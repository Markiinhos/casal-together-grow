import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useCardAggregates } from "@/hooks/useCardAggregates";
import { type CardAggregate, OPEN_STATUSES } from "@/lib/card-aggregate";
import {
  ChevronLeft, ChevronRight, Eye, EyeOff, Wallet, CreditCard,
  TrendingUp, TrendingDown, Plus, ChartLine, Sparkles, PieChart,
  Target,
} from "lucide-react";
import {
  fetchAccountsTotal, getCategoryExpenses, fetchMonthIncome, fetchCardInvoice,
  formatBRL, hideOrShow, monthLabel, monthRange, getCardAggregate,
} from "@/lib/finance";
import { TransactionEditDrawer } from "@/components/TransactionEditDrawer";
import { InvoicePaymentDetailsDrawer } from "@/components/InvoicePaymentDetailsDrawer";
import { CardPurchaseEditDrawer } from "@/components/CardPurchaseEditDrawer";
import { ListIcon } from "lucide-react";
import { InvoicePaymentDrawer } from "@/components/InvoicePaymentDrawer";

export const Route = createFileRoute("/app/financas/")({
  component: FinancasCentral,
});

function FinancasCentral() {
  const { user, loading: loadingAuth } = useAuth();
  const { data: profile, isLoading: isLoadingProfile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const qc = useQueryClient();

  const [ref, setRef] = useState(() => new Date());
  const [hidden, setHidden] = useState(false);
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [selectedInvoiceInfo, setSelectedInvoiceInfo] = useState<{ inv: any; card: any } | null>(null);

  function handleOpenPay(inv: any, card: any) {
    setSelectedInvoiceInfo({ inv, card });
    setPayDrawerOpen(true);
  }

  const opts = { space, userId: user?.id ?? "", coupleId };
  const monthKey = `${ref.getFullYear()}-${ref.getMonth()}`;

  const accountsTotal = useQuery({
    queryKey: ["fin-accounts-total", monthKey, space, coupleId, user?.id],
    queryFn: () => fetchAccountsTotal(opts),
    enabled: !!user,
  });

  const income = useQuery({
    queryKey: ["fin-income", monthKey, space, coupleId, user?.id],
    queryFn: () => fetchMonthIncome(ref, opts),
    enabled: !!user,
  });

  const expenses = useQuery({
    queryKey: ["fin-expenses", monthKey, space, coupleId, user?.id],
    queryFn: () => getCategoryExpenses(ref, opts),
    enabled: !!user,
  });

  const accounts = useQuery({
    queryKey: ["fin-accounts", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("bank_accounts").select("*").eq("hidden", false);
      if (space === "private") q = q.eq("visibility", "private").eq("user_id", user!.id);
      else if (coupleId) q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      else q = q.eq("visibility", "shared").eq("user_id", user!.id);
      const { data } = await q.order("name");
      return data ?? [];
    },
    enabled: !!user,
  });

  // Categorias
  const categories = useQuery({
    queryKey: ["fin-cats", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("categories").select("*");
      if (coupleId) {
        q = q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`);
      } else {
        q = q.eq("user_id", user!.id);
      }
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const recentTransactions = useQuery({
    queryKey: ["recent-txs", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("transactions").select("*, categories(name,color,icon), installments(*)").order("date", { ascending: false }).limit(6);
      if (space === "private") q = q.eq("visibility", "private").eq("user_id", user!.id);
      else if (coupleId) q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      else q = q.eq("visibility", "shared").eq("user_id", user!.id);
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  // Realtime — invalida no update
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("fin-central")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        qc.invalidateQueries({ queryKey: ["fin-income"] });
        qc.invalidateQueries({ queryKey: ["fin-expenses"] });
        qc.invalidateQueries({ queryKey: ["fin-invoices"] });
        qc.invalidateQueries({ queryKey: ["recent-txs"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_accounts" }, () => {
        qc.invalidateQueries({ queryKey: ["fin-accounts"] });
        qc.invalidateQueries({ queryKey: ["fin-accounts-total"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const balance = (income.data ?? 0) - (expenses.data?.total ?? 0);
  const { aggregates: cardAggregates, cards: cardsData } = useCardAggregates();
  const cardsList = cardsData;
  const openInvoices = cardsList; // todas aparecem em "abertas"; "fechadas" é view alternativa
  const [invoiceTab, setInvoiceTab] = useState<"open" | "closed">("open");
  const [editTxId, setEditTxId] = useState<string | null>(null);
  const [isEditCardTx, setIsEditCardTx] = useState(false);
  const [paymentTxId, setPaymentTxId] = useState<string | null>(null);

  const byCatSorted = useMemo(() => {
    const map = expenses.data?.byCategory ?? {};
    const cats = categories.data ?? [];
    return Object.entries(map)
      .map(([id, total]) => ({
        id,
        total,
        cat: cats.find((c) => c.id === id),
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenses.data, categories.data]);

  if (loadingAuth || isLoadingProfile) {
    return (
      <div className="flex flex-col h-[50vh] items-center justify-center text-muted-foreground gap-3">
        <Skeleton className="size-12 rounded-full" />
        <span className="text-sm font-medium">Carregando painel...</span>
      </div>
    );
  }

  return (
    <>
      <AppHeader title="Financeiro" subtitle="Contas, cartões e planejamento" />
      <div className="px-4 py-4 space-y-4 pb-24">
        {selectedInvoiceInfo && (
          <InvoicePaymentDrawer
            open={payDrawerOpen}
            onOpenChange={setPayDrawerOpen}
            card={selectedInvoiceInfo.card}
            invoiceTotal={selectedInvoiceInfo.inv.total_amount}
            paidAmount={selectedInvoiceInfo.inv.paid_amount}
            invoiceId={selectedInvoiceInfo.inv.id}
            refMonth={selectedInvoiceInfo.inv.reference_month}
            accounts={accounts.data ?? []}
          />
        )}
        {/* Seletor de mês */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}
            className="size-9 rounded-full hover:bg-accent flex items-center justify-center"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex-1 text-center font-semibold capitalize">{monthLabel(ref)}</div>
          <button
            onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}
            className="size-9 rounded-full hover:bg-accent flex items-center justify-center"
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-5" />
          </button>
          <button
            onClick={() => setHidden((h) => !h)}
            className="size-9 rounded-full hover:bg-accent flex items-center justify-center"
            aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
          >
            {hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>

        {/* Card principal */}
        <Card className="rounded-3xl p-5 shadow-card">
          {accountsTotal.isPending ? (
            <Skeleton className="h-9 w-40 rounded-xl" />
          ) : (
            <div className="text-3xl font-bold">{hideOrShow(accountsTotal.data ?? 0, hidden)}</div>
          )}
          <p className="text-xs text-muted-foreground mt-1">Saldo em contas</p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-2xl bg-success/10 p-3">
              <div className="flex items-center gap-1.5 text-success mb-1"><TrendingUp className="size-3.5" /><span className="text-[11px] font-medium">Receitas</span></div>
              {income.isPending ? <Skeleton className="h-4 w-16" /> : <div className="font-semibold text-sm">{hideOrShow(income.data ?? 0, hidden)}</div>}
            </div>
            <div className="rounded-2xl bg-destructive/10 p-3">
              <div className="flex items-center gap-1.5 text-destructive mb-1"><TrendingDown className="size-3.5" /><span className="text-[11px] font-medium">Despesas</span></div>
              {expenses.isPending ? <Skeleton className="h-4 w-16" /> : <div className="font-semibold text-sm">{hideOrShow(expenses.data?.total ?? 0, hidden)}</div>}
            </div>
            <div className="rounded-2xl bg-accent-purple/10 p-3">
              <div className="flex items-center gap-1.5 text-accent-purple mb-1"><ChartLine className="size-3.5" /><span className="text-[11px] font-medium">Saldo mês</span></div>
              <div className={`font-semibold text-sm ${balance < 0 ? "text-destructive" : ""}`}>{hideOrShow(balance, hidden)}</div>
            </div>
          </div>
        </Card>

        {/* Atalhos */}
        <div className="grid grid-cols-4 gap-2">
          <ShortcutTile to="/app/financas/planejamento" icon={Target} label="Planejamento" />
          <ShortcutTile to="/app/financas/projecao" icon={ChartLine} label="Projeção" />
          <ShortcutTile to="/app/financas/simular" icon={Sparkles} label="Simular" />
          <ShortcutTile to="/app/categorias" icon={PieChart} label="Categorias" />
        </div>

        {/* Contas */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Contas</h3>
            <Link to="/app/financas/contas" className="text-xs text-primary font-medium">Ver todas</Link>
          </div>
          {accounts.isPending ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : accounts.data && accounts.data.length > 0 ? (
            <Card className="rounded-2xl divide-y divide-border shadow-card overflow-hidden">
              {accounts.data.slice(0, 5).map((a: any) => (
                <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Wallet className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{a.name || "Conta"}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.type ?? "conta"} · atualizada {new Date(a.updated_at).toLocaleDateString("pt-BR")}</div>
                  </div>
                  <div className={`text-sm font-semibold ${Number(a.balance) < 0 ? "text-destructive" : ""}`}>
                    {hideOrShow(Number(a.balance ?? 0), hidden)}
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 flex items-center justify-between text-sm">
                <span className="font-medium">Total em contas</span>
                <span className="font-bold">{hideOrShow(accountsTotal.data ?? 0, hidden)}</span>
              </div>
            </Card>
          ) : (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={Wallet} title="Sem contas" description="Cadastre suas contas para começar" />
            </Card>
          )}
          <Button asChild variant="outline" className="w-full mt-2 rounded-2xl">
            <Link to="/app/financas/contas"><Plus className="size-4 mr-1" /> Adicionar conta</Link>
          </Button>
        </section>

        {/* Cartões */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Cartões de crédito</h3>
            <Link to="/app/cartoes" className="text-xs text-primary font-medium">Gerenciar</Link>
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setInvoiceTab("open")} className={`text-xs px-3 py-1.5 rounded-full font-medium ${invoiceTab === "open" ? "bg-primary text-white" : "bg-accent text-foreground"}`}>Faturas abertas</button>
            <button onClick={() => setInvoiceTab("closed")} className={`text-xs px-3 py-1.5 rounded-full font-medium ${invoiceTab === "closed" ? "bg-primary text-white" : "bg-accent text-foreground"}`}>Fechadas</button>
          </div>
          {cardsList.length === 0 ? (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={CreditCard} title="Sem cartões" description="Adicione um cartão para acompanhar faturas" />
            </Card>
          ) : (
            <div className="space-y-2">
              {(invoiceTab === "open" ? openInvoices : cardsList).map((c: any) => {
                const agg = cardAggregates.find(a => a.cardId === c.id);
                if (!agg) return null;
                return (
                  <Card key={c.id} className="rounded-2xl p-4 shadow-card">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="size-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.color + "22", color: c.color }}>
                        <CreditCard className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.bank || "Cartão"} · fecha dia {c.closing_day} · vence {c.due_day}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{hideOrShow(agg.invoiceTotal, hidden)}</div>
                        <div className="text-[11px] text-muted-foreground">Fatura {agg.invoiceIsPaid ? "Paga" : ""}</div>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${agg.usedPercent}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                      <span>{Math.round(agg.usedPercent)}% do limite</span>
                      <span>Disponível: {hideOrShow(agg.available, hidden)}</span>
                    </div>
                    {agg.installmentsCount > 0 && (
                      <div className="text-[11px] text-muted-foreground mt-1">{agg.installmentsCount} parceladas no mês</div>
                    )}
                    {agg.activeInv && !agg.invoiceIsPaid && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <Button 
                          size="sm" 
                          onClick={() => handleOpenPay(agg.activeInv, c)}
                          className="w-full text-xs h-8 rounded-xl gradient-coral text-white border-0 shadow-none"
                        >
                          Marcar fatura como paga
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Despesas por categoria */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Despesas por categoria</h3>
          </div>
          {expenses.isLoading ? (
            <Skeleton className="h-20 rounded-2xl" />
          ) : byCatSorted.length === 0 ? (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={PieChart} title="Nada gasto no mês" description="Adicione uma despesa para acompanhar" />
            </Card>
          ) : (
            <Card className="rounded-2xl divide-y divide-border shadow-card overflow-hidden">
              {byCatSorted.slice(0, 8).map((row) => (
                <div key={row.id} className="px-4 py-3 flex items-center gap-3">
                  <div
                    className="size-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: (row.cat?.color ?? "#FF6B57") + "22", color: row.cat?.color ?? "#FF6B57" }}
                  >
                    <PieChart className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0 text-sm truncate">{row.cat?.name ?? "Sem categoria"}</div>
                  <div className="text-sm font-semibold">{hideOrShow(row.total, hidden)}</div>
                </div>
              ))}
            </Card>
          )}
        </section>

        {/* Lançamentos Recentes */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Lançamentos recentes</h3>
          </div>
          {recentTransactions.isLoading ? (
            <Skeleton className="h-20 rounded-2xl" />
          ) : (recentTransactions.data ?? []).length === 0 ? (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={ListIcon} title="Sem lançamentos" description="Nada lançado recentemente." />
            </Card>
          ) : (
            <Card className="rounded-2xl divide-y divide-border shadow-card overflow-hidden">
              {recentTransactions.data!.map((t: any) => {
                const insts = t.installments?.length ?? 0;
                const isPayment = t.is_card_payment;
                return (
                  <div 
                    key={t.id} 
                    onClick={() => {
                       if (isPayment) {
                         setPaymentTxId(t.id);
                         return;
                       }
                       setEditTxId(t.id);
                       setIsEditCardTx(!!t.credit_card_id);
                    }} 
                    className={`px-4 py-3 flex items-center gap-3 transition-colors ${isPayment ? "cursor-default" : "cursor-pointer hover:bg-muted/30"}`}
                  >
                    <div
                      className={isPayment ? "size-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary" : "size-9 rounded-xl flex items-center justify-center shrink-0"}
                      style={!isPayment ? { background: (t.categories?.color ?? "#94a3b8") + "22", color: t.categories?.color ?? "#94a3b8" } : undefined}
                    >
                      {isPayment ? <Wallet className="size-4" /> : <ListIcon className="size-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{isPayment ? t.description || "Pagamento de fatura" : t.description || t.categories?.name || "Lançamento"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                         {new Date(t.date).toLocaleDateString("pt-BR")}
                         {insts > 1 && !isPayment && ` · ${insts}x`}
                         {t.credit_card_id && !isPayment && ` · Cartão`}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${t.type === "income" ? "text-success" : ""}`}>
                      {t.type === "income" ? "+" : "-"} {hideOrShow(Number(t.amount), hidden)}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </section>
      </div>

      <TransactionEditDrawer
        transactionId={!isEditCardTx ? editTxId : null}
        open={!!editTxId && !isEditCardTx}
        onOpenChange={(op) => !op && setEditTxId(null)}
      />
      <CardPurchaseEditDrawer
        purchaseId={isEditCardTx ? editTxId : null}
        open={!!editTxId && isEditCardTx}
        onOpenChange={(op) => !op && setEditTxId(null)}
      />
      <InvoicePaymentDetailsDrawer
        paymentId={paymentTxId}
        open={!!paymentTxId}
        onOpenChange={(op) => !op && setPaymentTxId(null)}
      />
    </>
  );
}

function ShortcutTile({ to, icon: Icon, label }: { to: any; icon: any; label: string }) {
  return (
    <Link to={to} className="rounded-2xl bg-accent hover:bg-accent/70 p-3 flex flex-col items-center gap-1 text-center">
      <Icon className="size-5 text-primary" />
      <span className="text-[11px] font-medium">{label}</span>
    </Link>
  );
}
