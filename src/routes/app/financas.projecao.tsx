import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { TrendingUp, TrendingDown, CalendarDays, Wallet } from "lucide-react";
import { format, addMonths, startOfMonth, parseISO, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/app/financas/projecao")({
  component: ProjecaoPage,
});

function ProjecaoPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const [monthsToProject, setMonthsToProject] = useState("6");

  const { data: tx = [], isLoading: isLoadingTx } = useQuery({
    queryKey: ["tx-projecao", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("transactions").select("*, categories(name,color,icon)").order("date", { ascending: false });
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ["cards", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("credit_cards").select("*");
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { chartData, upcoming, currentBalance, projectedBalance, isHealthy } = useMemo(() => {
    if (!tx) return { chartData: [], upcoming: [], currentBalance: 0, projectedBalance: 0, isHealthy: true };

    let currentBalanceAccum = 0;
    const now = new Date();
    
    // Calcula saldo atual (soma de tudo que já passou até hoje)
    for (const t of tx as any[]) {
      const d = new Date(t.date);
      if (d <= now && !t.credit_card_id) {
        if (t.type === "income") currentBalanceAccum += Number(t.amount);
        if (t.type === "expense") currentBalanceAccum -= Number(t.amount);
      }
    }

    // Projetar futuro
    const months = parseInt(monthsToProject);
    const dataByMonth: Record<string, { income: number; expense: number }> = {};
    const upc: any[] = [];

    // Initialize months in dict
    for (let i = 0; i < months; i++) {
        const m = addMonths(now, i);
        const l = format(m, "MMM/yy", { locale: ptBR });
        dataByMonth[l] = { income: 0, expense: 0 };
    }

    // Processar transações para o futuro
    for (const t of tx as any[]) {
      const baseDate = new Date(t.date);
      const isCredit = !!t.credit_card_id;
      const installments = t.total_installments && t.total_installments > 0 ? t.total_installments : 1;
      const pieceAmount = Number(t.amount) / installments;

      for (let i = 0; i < installments; i++) {
        const d = addMonths(baseDate, i);
        
        // Se a parcela cai no futuro (ou no mês atual)
        if (d >= startOfMonth(now)) {
            const lbl = format(d, "MMM/yy", { locale: ptBR });
            if (dataByMonth[lbl]) {
                if (t.type === "income") dataByMonth[lbl].income += pieceAmount;
                if (t.type === "expense") dataByMonth[lbl].expense += pieceAmount;
            }
            
            // Adicionar ao upcoming events list
            if (isAfter(d, now)) {
                upc.push({
                   ...t, 
                   projectedAmount: pieceAmount, 
                   projectedDate: d,
                   installmentLabel: installments > 1 ? `${i + 1}/${installments}` : null
                });
            }
        }
      }
    }

    // Sort upcoming
    upc.sort((a, b) => a.projectedDate.getTime() - b.projectedDate.getTime());

    // Calc chart info
    const finalChartData = [];
    let running = currentBalanceAccum;
    let totalFutureDebt = 0;
    
    for (const t of upc) {
       if (t.type === "expense") {
          totalFutureDebt += t.projectedAmount;
       }
    }

    for (let i = 0; i < months; i++) {
        const m = addMonths(now, i);
        const l = format(m, "MMM/yy", { locale: ptBR });
        const dict = dataByMonth[l] || { income: 0, expense: 0 };
        running = running + dict.income - dict.expense;
        finalChartData.push({
            name: l,
            balance: parseFloat(running.toFixed(2)),
            income: parseFloat(dict.income.toFixed(2)),
            expense: parseFloat(dict.expense.toFixed(2)),
            debt: parseFloat(dict.expense.toFixed(2)), // Representing monthly debt obligation
        });
    }

    // Budget Health: What % of future income is eaten by future expenses?
    const totalFutureIncome = finalChartData.reduce((acc, c) => acc + c.income, 0);
    const healthRatio = totalFutureIncome > 0 ? (totalFutureDebt / totalFutureIncome) * 100 : 0;
    
    // Status text based on health
    let healthStatus = "Excelente";
    if (healthRatio > 50) healthStatus = "Atenção";
    if (healthRatio > 80) healthStatus = "Crítico";
    if (totalFutureIncome === 0 && totalFutureDebt > 0) healthStatus = "Sem Receita";

    return { 
        chartData: finalChartData, 
        upcoming: upc.slice(0, 15), 
        currentBalance: currentBalanceAccum,
        projectedBalance: running,
        isHealthy: running >= 0,
        totalFutureDebt,
        healthRatio,
        healthStatus
    };
  }, [tx, cards, monthsToProject]);

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

        {isLoadingTx ? (
             <div className="space-y-4">
               <Skeleton className="h-40 rounded-3xl" />
             </div>
        ) : (
            <>
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
                        upcoming.map((u, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-card rounded-2xl shadow-sm border border-border/50">
                                <div className="size-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                                    {u.type === "income" ? <TrendingUp className="size-5 text-success" /> : <TrendingDown className="size-5 text-destructive" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">{u.description || "Sem descrição"}</div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                        <span>{format(u.projectedDate, "dd 'de' MMM", { locale: ptBR })}</span>
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
                                    </div>
                                </div>
                                <div className={`font-semibold shrink-0 text-sm ${u.type === "income" ? "text-success" : "text-destructive"}`}>
                                    {u.type === "income" ? "+" : "-"}{formatBRL(u.projectedAmount)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </>
        )}

      </div>
    </>
  );
}
