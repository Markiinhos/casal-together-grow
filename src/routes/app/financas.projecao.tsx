import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace, applySpaceFilter } from "@/lib/space";
import { formatBRL } from "@/lib/couple";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, CalendarDays, Wallet, RefreshCw, RefreshCcw } from "lucide-react";
import { format, addMonths, startOfMonth, isAfter, isValid, addDays, addYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { useCardAggregates } from "@/hooks/useCardAggregates";
import { monthlyAmount } from "@/lib/finance";

export const Route = createFileRoute("/app/financas/projecao")({
  component: ProjecaoPage,
});

function ProjecaoPage() {
  const { user } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const [monthsToProject, setMonthsToProject] = useState("6");
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: tx, isLoading: isLoadingTx, isError: isErrorTx, refetch: refetchTx } = useQuery({
    queryKey: ["tx-projecao", space, coupleId, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      let q: any = supabase.from("transactions").select("*, categories(name,color,icon)").order("date", { ascending: false });
      q = applySpaceFilter(q, { space, userId: user.id, coupleId });
      const { data, error } = await q;
      if (error) {
        console.error("Erro ao carregar projeção financeira (transactions):", error);
        return [];
      }
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { aggregates, isLoading: isLoadingCards, isError: isErrorCards } = useCardAggregates();

  const { data: subs = [], isLoading: isSubsLoading } = useQuery({
    queryKey: ["subs-projecao", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("subscriptions").select("*, categories(name,color,icon)").eq("status", "active");
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user?.id,
  });

  const { data: incomeSources = [], isLoading: isIncomeSourcesLoading } = useQuery({
    queryKey: ["income-sources-projecao", space, coupleId, user?.id],
    queryFn: async () => { let q: any = supabase.from("income_sources").select("*").eq("is_active", true); q = applySpaceFilter(q, { space, userId: user!.id, coupleId }); const { data, error } = await q; if (error) throw error; return data ?? []; },
    enabled: !!user?.id,
  });
  const { data: fixedBills = [], isLoading: isFixedBillsLoading } = useQuery({
    queryKey: ["fixed-bills-projecao", space, coupleId, user?.id],
    queryFn: async () => { let q: any = supabase.from("future_bills").select("*").eq("is_active", true).neq("recurrence", "once"); q = applySpaceFilter(q, { space, userId: user!.id, coupleId }); const { data, error } = await q; if (error) throw error; return data ?? []; },
    enabled: !!user?.id,
  });

  const { chartData, upcoming, currentBalance, projectedBalance, isHealthy, totalFutureDebt, healthRatio, healthStatus } = useMemo(() => {
    const transactionsList = Array.isArray(tx) ? tx : [];
    
    let currentBalanceAccum = 0;
    const now = new Date();
    
    for (const t of transactionsList) {
      if (!t.date || !t.type || t.amount == null) continue;
      
      const d = new Date(t.date);
      if (!isValid(d)) continue;
      
      if (d <= now && !t.credit_card_id) {
        const amt = Number(t.amount || 0);
        if (Number.isFinite(amt)) {
          if (t.type === "income") currentBalanceAccum += amt;
          if (t.type === "expense") currentBalanceAccum -= amt;
        }
      }
    }

    const months = parseInt(monthsToProject) || 6;
    const dataByMonth: Record<string, { income: number; expense: number }> = {};
    const upc: any[] = [];

    for (let i = 0; i < months; i++) {
        const m = addMonths(now, i);
        if (isValid(m)) {
          const l = format(m, "MMM/yy", { locale: ptBR });
          dataByMonth[l] = { income: 0, expense: 0 };
        }
    }

    for (const t of transactionsList) {
      if (!t.date || !t.type || t.amount == null) continue;

      const baseDate = new Date(t.date);
      if (!isValid(baseDate)) continue;
      if (t.credit_card_id) continue; // Cartões são processados via useCardAggregates

      const installmentsCount = (t.total_installments && Number(t.total_installments) > 0) ? Number(t.total_installments) : 1;
      const amt = Number(t.amount || 0);
      
      if (!Number.isFinite(amt)) continue;
      const pieceAmount = amt / installmentsCount;

      for (let i = 0; i < installmentsCount; i++) {
        const d = addMonths(baseDate, i);
        if (!isValid(d)) continue;
        
        if (d >= startOfMonth(now)) {
            const lbl = format(d, "MMM/yy", { locale: ptBR });
            if (dataByMonth[lbl]) {
                if (t.type === "income") dataByMonth[lbl].income += pieceAmount;
                if (t.type === "expense") dataByMonth[lbl].expense += pieceAmount;
            }
            
            if (isAfter(d, now)) {
                upc.push({
                   ...t, 
                   projectedAmount: pieceAmount, 
                   projectedDate: d,
                   installmentLabel: installmentsCount > 1 ? `${i + 1}/${installmentsCount}` : null
                });
            }
        }
      }
    }

    // Include credit card installments from centralized aggregates
    for (const agg of aggregates) {
       for (const [monthKey, amount] of Object.entries(agg.monthly)) {
          const [yy, mm] = monthKey.split("-");
          const mDate = new Date(Number(yy), Number(mm) - 1, agg.dueDay || 10, 12, 0, 0);
          if (mDate >= startOfMonth(now)) {
             const lbl = format(mDate, "MMM/yy", { locale: ptBR });
             if (dataByMonth[lbl]) {
                 dataByMonth[lbl].expense += amount;
             }
             
             if (isAfter(mDate, now) && amount > 0) {
                 upc.push({
                     id: `card-bill-${agg.cardId}-${monthKey}`,
                     type: "expense",
                     description: `Fatura ${agg.cardName}`,
                     projectedAmount: amount,
                     projectedDate: mDate,
                     icon: "CreditCard",
                     color: agg.color,
                     isCardBill: true
                 });
             }
          }
       }
    }

    // Include subscriptions
    for (const sub of subs) {
      if (!sub.next_billing_date || !sub.amount) continue;
      const amt = Number(sub.amount);
      if (amt <= 0) continue;
      
      let currentDate = new Date(sub.next_billing_date + "T12:00:00");
      for (let i = 0; i < months; i++) {
        if (!isValid(currentDate)) break;
        
        const m = addMonths(now, i);
        if (currentDate <= m && (sub.billing_frequency === "monthly" || i === 0)) {
           // We simplify adding subscriptions based on their frequency
           const lbl = format(currentDate, "MMM/yy", { locale: ptBR });
           if (dataByMonth[lbl]) {
               dataByMonth[lbl].expense += amt;
           }
           
           if (isAfter(currentDate, now)) {
               upc.push({
                   ...sub,
                   type: "expense",
                   description: sub.name,
                   isSubscription: true,
                   projectedAmount: amt,
                   projectedDate: new Date(currentDate)
               });
           }
        }
        
        // increment currentDate
        if (sub.billing_frequency === "monthly") {
           currentDate = addMonths(currentDate, sub.billing_interval || 1);
        } else if (sub.billing_frequency === "annual") {
           currentDate = addYears(currentDate, sub.billing_interval || 1);
        } else if (sub.billing_frequency === "weekly") {
           currentDate = addDays(currentDate, 7 * (sub.billing_interval || 1));
        } else {
           break;
        }
      }
    }

    // Fontes estruturadas alimentam somente a previsão; não criam lançamentos reais.
    for (let i = 0; i < months; i++) {
      const month = addMonths(now, i);
      const lbl = format(month, "MMM/yy", { locale: ptBR });
      for (const source of incomeSources as any[]) {
        const amount = monthlyAmount(source.amount, source.frequency);
        dataByMonth[lbl].income += amount;
        const day = Math.min(source.receipt_day || 1, new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());
        const projectedDate = new Date(month.getFullYear(), month.getMonth(), day, 12);
        if (isAfter(projectedDate, now)) upc.push({ id: `income-source-${source.id}-${i}`, type: "income", description: source.name, projectedAmount: amount, projectedDate, isPlannedSource: true });
      }
      for (const bill of fixedBills as any[]) {
        const amount = monthlyAmount(bill.amount, bill.recurrence);
        dataByMonth[lbl].expense += amount;
        const due = new Date(bill.due_date + "T12:00:00");
        const day = Math.min(due.getDate(), new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());
        const projectedDate = new Date(month.getFullYear(), month.getMonth(), day, 12);
        if (isAfter(projectedDate, now)) upc.push({ id: `fixed-bill-${bill.id}-${i}`, type: "expense", description: bill.title, projectedAmount: amount, projectedDate, isFixedBill: true });
      }
    }

    upc.sort((a, b) => {
        if (!isValid(a.projectedDate) || !isValid(b.projectedDate)) return 0;
        return a.projectedDate.getTime() - b.projectedDate.getTime();
    });

    const finalChartData = [];
    let running = currentBalanceAccum;
    let _totalFutureDebt = 0;
    
    for (const t of upc) {
       if (t.type === "expense") {
          _totalFutureDebt += Number(t.projectedAmount || 0);
       }
    }

    for (let i = 0; i < months; i++) {
        const m = addMonths(now, i);
        if (!isValid(m)) continue;
        
        const l = format(m, "MMM/yy", { locale: ptBR });
        const dict = dataByMonth[l] || { income: 0, expense: 0 };
        running = running + dict.income - dict.expense;
        finalChartData.push({
            name: l,
            balance: parseFloat(running.toFixed(2)) || 0,
            income: parseFloat(dict.income.toFixed(2)) || 0,
            expense: parseFloat(dict.expense.toFixed(2)) || 0,
            debt: parseFloat(dict.expense.toFixed(2)) || 0, 
        });
    }

    const totalFutureIncome = finalChartData.reduce((acc, c) => acc + c.income, 0);
    const _healthRatio = totalFutureIncome > 0 ? (_totalFutureDebt / totalFutureIncome) * 100 : 0;
    
    let _healthStatus = "Excelente";
    if (_healthRatio > 50) _healthStatus = "Atenção";
    if (_healthRatio > 80) _healthStatus = "Crítico";
    if (totalFutureIncome === 0 && _totalFutureDebt > 0) _healthStatus = "Sem Receita";

    return { 
        chartData: finalChartData, 
        upcoming: upc.slice(0, 15), 
        currentBalance: currentBalanceAccum,
        projectedBalance: running,
        isHealthy: running >= 0,
        totalFutureDebt: _totalFutureDebt,
        healthRatio: _healthRatio,
        healthStatus: _healthStatus
    };
  }, [tx, aggregates, subs, incomeSources, fixedBills, monthsToProject]);

  if (!user || isProfileLoading || isLoadingTx || isLoadingCards || isSubsLoading || isIncomeSourcesLoading || isFixedBillsLoading) {
      return (
          <>
             <PageHeader title="Projeção Financeira" subtitle="Carregando dados..." fallbackRoute="/app/financas" />
             <div className="px-4 py-8 space-y-4">
               <Skeleton className="h-20 rounded-3xl w-full" />
               <Skeleton className="h-40 rounded-3xl w-full" />
               <Skeleton className="h-72 rounded-3xl w-full mt-4" />
             </div>
          </>
      )
  }

  if (space === "shared" && coupleId == null) {
      return (
          <>
             <PageHeader title="Projeção Financeira" subtitle="Atenção" fallbackRoute="/app/financas" />
             <div className="px-4 py-8">
               <Card className="rounded-3xl p-6 shadow-card text-center space-y-3">
                  <Wallet className="size-10 mx-auto text-muted-foreground opacity-50" />
                  <p className="font-semibold">Nenhum parceiro vinculado</p>
                  <p className="text-sm text-muted-foreground">
                      Vincule seu parceiro para visualizar uma projeção financeira compartilhada do Nosso Espaço.
                  </p>
               </Card>
             </div>
          </>
      )
  }

  if (isErrorTx || isErrorCards) {
      return (
          <>
             <PageHeader title="Projeção Financeira" subtitle="Ocorreu um problema" fallbackRoute="/app/financas" />
             <div className="px-4 py-8">
               <Card className="rounded-3xl p-6 shadow-card text-center space-y-4">
                  <p className="text-sm font-semibold text-destructive">Não foi possível carregar a projeção financeira.</p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={() => { refetchTx(); }} className="rounded-xl">
                      <RefreshCw className="size-4 mr-2" /> Tentar novamente
                    </Button>
                    <Button variant="secondary" onClick={() => navigate({ to: "/app/financas" })} className="rounded-xl">
                      Voltar para Finanças
                    </Button>
                  </div>
               </Card>
             </div>
          </>
      )
  }

  if (Array.isArray(tx) && tx.length === 0 && incomeSources.length === 0 && fixedBills.length === 0 && subs.length === 0) {
      return (
          <>
             <PageHeader title="Projeção Financeira" subtitle="Previsão do seu saldo" fallbackRoute="/app/financas" />
             <div className="px-4 py-8">
               <Card className="rounded-3xl p-6 shadow-card text-center space-y-4">
                  <p className="text-sm font-semibold">Ainda não existem dados suficientes para gerar sua projeção financeira.</p>
                  <p className="text-xs text-muted-foreground">Registre receitas ou despesas recorrentes primeiro.</p>
                  <div className="flex flex-col gap-2 mt-4">
                    <Button onClick={() => navigate({ to: "/app/adicionar" })} className="rounded-xl gradient-coral text-white border-0">
                      Adicionar Despesa / Receita
                    </Button>
                  </div>
               </Card>
             </div>
          </>
      )
  }

  return (
    <>
      <PageHeader title="Projeção Financeira" subtitle="Previsão do seu saldo" fallbackRoute="/app/financas" />
      <div className="px-4 py-4 space-y-6 pb-24">
        
        <div className="flex justify-between items-center bg-card p-4 rounded-3xl border shadow-sm">
            <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Período Projetado</p>
            </div>
            <Select value={monthsToProject} onValueChange={setMonthsToProject}>
                <SelectTrigger className="w-[120px] h-8 text-xs rounded-xl">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="3">3 Meses</SelectItem>
                    <SelectItem value="6">6 Meses</SelectItem>
                    <SelectItem value="12">12 Meses</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
            <Card className="rounded-3xl p-4 shadow-card flex flex-col justify-center border-l-4 border-l-primary relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-125 transition-transform duration-500">
                    <Wallet className="size-20" />
                </div>
                <p className="text-xs text-muted-foreground mb-1 relative z-10">Saldo Atual</p>
                <p className={`text-lg font-bold relative z-10 ${currentBalance >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatBRL(currentBalance)}
                </p>
            </Card>
            <Card className="rounded-3xl p-4 shadow-card flex flex-col justify-center border-l-4 border-l-blue-500 relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-125 transition-transform duration-500">
                    <TrendingUp className="size-20" />
                </div>
                <p className="text-xs text-muted-foreground mb-1 relative z-10">Fim do Período</p>
                <p className={`text-lg font-bold relative z-10 ${projectedBalance >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatBRL(projectedBalance)}
                </p>
            </Card>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
            <Card className="rounded-3xl p-4 shadow-card flex flex-col justify-center bg-destructive/5 border-destructive/20 border">
                <p className="text-xs text-muted-foreground mb-1">Dívida Futura (Total)</p>
                <p className="text-lg font-bold text-destructive">
                    {formatBRL(totalFutureDebt)}
                </p>
            </Card>
            <Card className={`rounded-3xl p-4 shadow-card flex flex-col justify-center border ${
                healthStatus === "Excelente" ? "bg-success/5 border-success/20" : 
                healthStatus === "Atenção" ? "bg-warning/10 border-warning/30" : 
                "bg-destructive/10 border-destructive/30"
            }`}>
                <p className="text-xs text-muted-foreground mb-1 flex justify-between items-center">
                    Saúde Orçamentária
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        healthStatus === "Excelente" ? "bg-success/20 text-success" : 
                        healthStatus === "Atenção" ? "bg-warning/30 text-warning-foreground" : 
                        "bg-destructive/20 text-destructive"
                    }`}>{healthStatus}</span>
                </p>
                <p className="text-sm font-medium mt-1">
                    Comprometimento: <span className="font-bold">{healthRatio.toFixed(0)}%</span>
                </p>
            </Card>
        </div>

        <Card className="rounded-3xl p-5 shadow-card space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
                <TrendingUp className="size-4" /> Evolução do Saldo
            </h3>
            <div className="h-64 w-full">
                {!mounted ? (
                  <Skeleton className="w-full h-full rounded-2xl" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                          <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                          <Tooltip
                              formatter={(value: number) => formatBRL(value)}
                              contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", backgroundColor: "var(--background)" }}
                          />
                          <ReferenceLine y={0} stroke={isHealthy ? "#34D399" : "#F25542"} strokeDasharray="3 3" opacity={0.4} />
                          <Line 
                              name="Saldo"
                              type="monotone" 
                              dataKey="balance" 
                              stroke={isHealthy ? "#34D399" : "#F25542"} 
                              strokeWidth={3} 
                              dot={{ r: 4, fill: "var(--background)", strokeWidth: 2 }} 
                              activeDot={{ r: 6 }} 
                          />
                          <Line 
                              name="Dívida"
                              type="monotone" 
                              dataKey="debt" 
                              stroke="#F25542" 
                              strokeWidth={2} 
                              strokeDasharray="5 5"
                              dot={false}
                              activeDot={{ r: 4 }} 
                          />
                      </LineChart>
                  </ResponsiveContainer>
                )}
            </div>
        </Card>

        <div className="space-y-3">
            <h3 className="font-semibold px-1 text-sm text-muted-foreground flex items-center gap-2">
                <CalendarDays className="size-4" /> Próximos Lançamentos
            </h3>
            {upcoming.length === 0 ? (
                <div className="text-center p-6 text-sm text-muted-foreground bg-muted/30 rounded-2xl">
                    Nenhum lançamento futuro encontrado para este período.
                </div>
            ) : (
                upcoming.map((u, i) => {
                  let formattedDate = "--";
                  if (u.projectedDate && isValid(u.projectedDate)) {
                    formattedDate = format(u.projectedDate, "dd 'de' MMM", { locale: ptBR });
                  }
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 bg-card rounded-2xl shadow-sm border border-border/50">
                        <div className="size-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                            {u.type === "income" ? <TrendingUp className="size-5 text-success" /> : <TrendingDown className="size-5 text-destructive" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{u.description || "Sem descrição"}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span>{formattedDate}</span>
                                {u.installmentLabel && (
                                    <>
                                        <span>•</span>
                                        <span>Parc. {u.installmentLabel}</span>
                                    </>
                                )}
                                {u.credit_card_id && (
                                    <>
                                        <span>•</span>
                                        <Wallet className="size-3" />
                                    </>
                                )}
                                {u.isSubscription && (
                                    <>
                                        <span>•</span>
                                        <RefreshCcw className="size-3 text-primary" />
                                    </>
                                )}
                            </div>
                        </div>
                        <div className={`font-semibold shrink-0 text-sm ${u.type === "income" ? "text-success" : "text-destructive"}`}>
                            {u.type === "income" ? "+" : "-"}{formatBRL(u.projectedAmount)}
                        </div>
                    </div>
                  );
                })
            )}
        </div>

      </div>
    </>
  );
}
