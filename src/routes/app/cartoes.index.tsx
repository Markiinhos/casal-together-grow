import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, usePartner } from "@/lib/hooks";
import { formatBRL } from "@/lib/couple";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { getLocalISODate } from "@/lib/date-utils";
import { CreditCard, Plus, Trash2, Pencil, ChevronDown, ShoppingBag, TrendingUp, Calendar, Wallet } from "lucide-react";
import { toast } from "sonner";
import { CardPurchaseEditDrawer } from "@/components/CardPurchaseEditDrawer";
import { useCardAggregates } from "@/hooks/useCardAggregates";
import { InvoicePaymentDrawer } from "@/components/InvoicePaymentDrawer";
import { InvoicePaymentDetailsDrawer } from "@/components/InvoicePaymentDetailsDrawer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Link } from "@tanstack/react-router";
import { type CardAggregate, getInvoiceStatusLabel, getInvoiceStatusColor } from "@/lib/card-aggregate";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

export const Route = createFileRoute("/app/cartoes/")({ component: CardsPage });

const COLORS = ["#7B61FF", "#FF6B57", "#34D399", "#FBBF24", "#60A5FA", "#F472B6", "#0F172A"];
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthKey(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function CardsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [openCard, setOpenCard] = useState(false);
  const [openPurchase, setOpenPurchase] = useState(false);
  const [editingCard, setEditingCard] = useState<any | null>(null);


  const { data: accounts = [] } = useQuery({
    queryKey: ["fin-accounts", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("*").order("name");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: cats = [] } = useQuery({
    queryKey: ["cats-exp", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("categories").select("*").eq("type", "expense").order("name");
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    const ch = supabase
      .channel("cards-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        qc.invalidateQueries({ queryKey: ["card-purchases"] });
        qc.invalidateQueries({ queryKey: ["card-invoices"] });
        qc.invalidateQueries({ queryKey: ["recent-txs"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "installments" }, () => {
        qc.invalidateQueries({ queryKey: ["card-purchases"] });
        qc.invalidateQueries({ queryKey: ["card-invoices"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "card_invoices" }, () => {
        qc.invalidateQueries({ queryKey: ["card-invoices"] });
        qc.invalidateQueries({ queryKey: ["card-purchases"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  function ownerName(uid: string) {
    if (uid === user?.id) return profile?.full_name?.split(" ")[0] ?? "Você";
    if (uid === partner?.id) return partner?.full_name?.split(" ")[0] ?? "Parceiro";
    return "—";
  }

  async function delCard(id: string) {
    if (!confirm("Excluir cartão? As compras vinculadas perderão a referência.")) return;
    await supabase.from("credit_cards").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["cards"] });
  }

  // Compute per-card metrics from purchases/installments
  const { aggregates, byId, isLoading: isLoadingCards, cards, purchases, invoices, rawMetrics: cardMetrics } = useCardAggregates();

  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [selectedInvoiceInfo, setSelectedInvoiceInfo] = useState<{ inv: any; card: any } | null>(null);

  function handleOpenPay(inv: any, card: any) {
    setSelectedInvoiceInfo({ inv, card });
    setPayDrawerOpen(true);
  }

  return (
    <>
      <AppHeader title="Cartões" subtitle="Faturas, parcelas e análises" />
      <div className="px-4 py-4 space-y-4 pb-24">
        <Dialog open={!!editingCard} onOpenChange={(op) => !op && setEditingCard(null)}>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Editar cartão</DialogTitle></DialogHeader>
            {editingCard && <CardForm card={editingCard} onDone={() => setEditingCard(null)} />}
          </DialogContent>
        </Dialog>
        {selectedInvoiceInfo && (
          <InvoicePaymentDrawer
            open={payDrawerOpen}
            onOpenChange={setPayDrawerOpen}
            card={selectedInvoiceInfo.card}
            invoiceTotal={selectedInvoiceInfo.inv.total_amount}
            paidAmount={selectedInvoiceInfo.inv.paid_amount}
            invoiceId={selectedInvoiceInfo.inv.id}
            refMonth={selectedInvoiceInfo.inv.reference_month}
            accounts={accounts}
            status={selectedInvoiceInfo.inv.status}
            closingDate={selectedInvoiceInfo.inv.closing_date}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Dialog open={openCard} onOpenChange={setOpenCard}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl h-11">
                <Plus className="size-4 mr-1" /> Cartão
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader><DialogTitle>Novo cartão</DialogTitle></DialogHeader>
              <CardForm onDone={() => setOpenCard(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={openPurchase} onOpenChange={setOpenPurchase}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gradient-coral text-white border-0 h-11" disabled={cards.length === 0}>
                <ShoppingBag className="size-4 mr-1" /> Nova compra
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader><DialogTitle>Nova compra no cartão</DialogTitle></DialogHeader>
              <PurchaseForm cards={cards} cats={cats} onDone={() => setOpenPurchase(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="cards">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="cards">Cartões</TabsTrigger>
            <TabsTrigger value="bills">Faturas</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="charts">Gráficos</TabsTrigger>
          </TabsList>

          <TabsContent value="cards" className="mt-4 space-y-3">
            {isLoadingCards ? (
              <div className="space-y-4">
                <div className="h-48 bg-muted animate-pulse rounded-3xl" />
                <div className="h-48 bg-muted animate-pulse rounded-3xl" />
              </div>
            ) : cards.length === 0 ? (
              <Card className="rounded-2xl p-4 shadow-card">
                <EmptyState icon={CreditCard} title="Sem cartões" description="Cadastre seus cartões para acompanhar faturas e parcelas." />
              </Card>
            ) : (
              cards.map((c) => {
                const agg = byId[c.id];
                if (!agg) return null;

                return (
                  <Card key={c.id} className="rounded-3xl overflow-hidden shadow-soft border-0">
                    <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs opacity-80">{c.bank || "Cartão"}</div>
                          <div className="font-bold text-lg">{c.name}</div>
                          <div className="text-[11px] opacity-80 mt-0.5">{ownerName(c.user_id)} · Fecha dia {c.closing_day} · Vence dia {c.due_day}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingCard(c)} className="opacity-70 hover:opacity-100"><Pencil className="size-4" /></button>
                          <button onClick={() => delCard(c.id)} className="opacity-70 hover:opacity-100"><Trash2 className="size-4" /></button>
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="text-[11px] opacity-80">Comprometido</div>
                        <div className="text-2xl font-bold">{formatBRL(agg.used)} <span className="text-xs font-normal opacity-80">/ {formatBRL(agg.limitTotal)}</span></div>
                        <div className="h-1.5 rounded-full bg-white/25 overflow-hidden mt-2">
                          <div className="h-full bg-white" style={{ width: `${agg.usedPercent}%` }} />
                        </div>
                        <div className="text-[11px] opacity-80 mt-1">{agg.usedPercent.toFixed(0)}% do limite utilizado</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-border">
                      <div className="bg-card p-3 flex flex-col justify-between">
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            {agg.activeInv
                              ? (agg.invoiceIsPaid ? "Última fatura" : "Próxima fatura em aberto")
                              : "Fatura atual"}
                          </div>
                          <div className="font-semibold text-sm capitalize">{agg.invoiceRefLabel}</div>
                          <div className="text-[11px] text-muted-foreground">{formatBRL(agg.invoiceTotal)}</div>
                          {agg.activeInv?.due_date && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Vence em {new Date(String(agg.activeInv.due_date).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR")}
                            </div>
                          )}
                          {agg.activeInv && (
                             <div className="text-[10px] mt-1">
                               <span className={`px-1.5 py-0.5 rounded-full font-medium ${agg.invoiceStatusColor}`}>
                                 {agg.invoiceStatusLabel}
                               </span>
                             </div>
                          )}
                        </div>
                        {agg.activeInv && (
                          <div className="mt-2 flex gap-1.5">
                            <Link to={`/app/cartoes/$cardId/faturas`} params={{ cardId: c.id }} className="flex-1">
                              <Button variant="outline" size="sm" className="w-full text-xs h-7 px-0 rounded-lg">Detalhes</Button>
                            </Link>
                            {!agg.invoiceIsPaid ? (
                              <Button
                                size="sm"
                                onClick={() => handleOpenPay(agg.activeInv, c)}
                                className="flex-1 text-[11px] h-7 px-0 rounded-lg gradient-coral text-white border-0 shadow-none"
                              >
                                Marcar como paga
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPay(agg.activeInv, c)}
                                className="flex-1 text-[11px] h-7 px-0 rounded-lg"
                              >
                                Editar pagamento
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-card p-3">
                        <div className="text-[10px] text-muted-foreground uppercase">Restante parcelas</div>
                        <div className="font-semibold text-sm">{formatBRL(agg.remainingTotal)}</div>
                      </div>
                      <div className="bg-card p-3">
                        <div className="text-[10px] text-muted-foreground uppercase">Parceladas</div>
                        <div className="font-semibold text-sm">{agg.installmentsCount}</div>
                      </div>
                      <div className="bg-card p-3">
                        <div className="text-[10px] text-muted-foreground uppercase">Maior categoria</div>
                        <div className="font-semibold text-sm truncate">{agg.topCategory ? agg.topCategory[0] : "—"}</div>
                      </div>
                    </div>
                    {agg.usedPercent >= 80 && (
                      <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs">
                        ⚠️ Limite acima de 80% utilizado
                      </div>
                    )}
                  </Card>
                );
              })
            )}

            <PurchasesList purchases={purchases} cards={cards} />
          </TabsContent>

          <TabsContent value="bills" className="mt-4 space-y-4">
            {/* Per-card invoice summary with pay buttons */}
            {cards.length > 0 && (
              <div className="space-y-3">
                {cards.map((c) => {
                  const agg = byId[c.id];
                  if (!agg) return null;
                  return (
                    <Card key={c.id} className="rounded-2xl shadow-card overflow-hidden">
                      <div className="px-4 py-3 flex items-center gap-3" style={{ borderLeft: `4px solid ${c.color}` }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{c.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{agg.invoiceRefLabel} · Vence dia {c.due_day}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm">{formatBRL(agg.invoiceTotal)}</div>
                          {agg.invoicePaid > 0 && !agg.invoiceIsPaid && (
                            <div className="text-[10px] text-success">Pago: {formatBRL(agg.invoicePaid)}</div>
                          )}
                        </div>
                      </div>
                      <div className="px-4 pb-3 flex gap-2">
                        <Link to={`/app/cartoes/$cardId/faturas`} params={{ cardId: c.id }} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full text-xs h-8 rounded-xl">
                            <Wallet className="size-3.5 mr-1" /> Detalhes
                          </Button>
                        </Link>
                        {!agg.invoiceIsPaid && agg.invoiceRemaining > 0 && agg.activeInv && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenPay(agg.activeInv, c)}
                            className="flex-1 text-xs h-8 rounded-xl gradient-coral text-white border-0"
                          >
                            <CreditCard className="size-3.5 mr-1" /> Marcar como paga
                          </Button>
                        )}
                        {agg.invoiceIsPaid && agg.activeInv && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPay(agg.activeInv, c)}
                            className="flex-1 text-xs h-8 rounded-xl"
                          >
                            ✓ Paga — editar/desfazer
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            <FutureBills purchases={purchases} cards={cards} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <History purchases={purchases} cards={cards} cats={cats} />
          </TabsContent>

          <TabsContent value="charts" className="mt-4 space-y-4">
            <MonthlyChart cards={cards} cardMetrics={cardMetrics} />
            <CompareChart cards={cards} cardMetrics={cardMetrics} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function PurchasesList({ purchases, cards }: { purchases: any[]; cards: any[] }) {
  const [statusFilter, setStatusFilter] = useState<"ativas" | "quitadas" | "todas">("ativas");
  const parceladas = purchases.filter((p) => (p.installments?.length ?? 0) > 1);
  if (parceladas.length === 0) return null;
  const cardName = (id: string) => cards.find((c) => c.id === id)?.name ?? "—";
  const filtered = parceladas.filter((p) => {
    const insts = p.installments ?? [];
    const quitada = insts.length > 0 && insts.every((i: any) => i.paid);
    if (statusFilter === "ativas") return !quitada;
    if (statusFilter === "quitadas") return quitada;
    return true;
  });
  const counts = {
    ativas: parceladas.filter((p) => !(p.installments ?? []).every((i: any) => i.paid)).length,
    quitadas: parceladas.filter((p) => (p.installments ?? []).length > 0 && (p.installments ?? []).every((i: any) => i.paid)).length,
  };
  return (
    <Card className="rounded-3xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border font-semibold text-sm flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Calendar className="size-4 text-primary" /> Compras parceladas</div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativas">Ativas ({counts.ativas})</SelectItem>
            <SelectItem value="quitadas">Quitadas ({counts.quitadas})</SelectItem>
            <SelectItem value="todas">Todas ({parceladas.length})</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          Nenhuma compra {statusFilter === "ativas" ? "ativa" : statusFilter === "quitadas" ? "quitada" : ""}.
        </div>
      ) : (
      <div className="divide-y divide-border">
        {filtered.map((p) => {
          const insts = (p.installments ?? []).slice().sort((a: any, b: any) => a.installment_number - b.installment_number);
          const paid = insts.filter((i: any) => i.paid).length;
          const total = insts.length;
          const remaining = insts.filter((i: any) => !i.paid).reduce((s: number, i: any) => s + Number(i.amount), 0);
          const lastDue = insts[insts.length - 1]?.due_date;
          const quitada = total > 0 && paid === total;
          return (
            <Collapsible key={p.id}>
              <CollapsibleTrigger className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/30 text-left ${quitada ? "opacity-60" : ""}`}>
                <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ShoppingBag className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {p.description || p.categories?.name || "Compra"}
                    {quitada && <span className="ml-2 text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded uppercase">Quitada</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{cardName(p.credit_card_id)} · {paid}/{total} pagas · {formatBRL(Number(p.amount))}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{formatBRL(remaining)}</div>
                  <div className="text-[10px] text-muted-foreground">restante</div>
                </div>
                <ChevronDown className="size-4 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-3 space-y-1">
                  <div className="text-[11px] text-muted-foreground">Quita em {lastDue ? new Date(lastDue).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—"}</div>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {insts.map((i: any) => (
                      <InstallmentPill key={i.id} inst={i} />
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
      )}
    </Card>
  );
}

function InstallmentPill({ inst }: { inst: any }) {
  const qc = useQueryClient();
  async function toggle() {
    const { error } = await supabase
      .from("installments")
      .update({ paid: !inst.paid, paid_at: !inst.paid ? new Date().toISOString() : null })
      .eq("id", inst.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["card-purchases"] });
  }
  return (
    <button
      onClick={toggle}
      className={`text-[11px] rounded-lg px-2 py-1.5 flex items-center justify-between border transition ${
        inst.paid ? "bg-success/10 border-success/30 text-success line-through" : "bg-card border-border hover:bg-accent/40"
      }`}
    >
      <span>{inst.installment_number}/{inst.total_installments}</span>
      <span className="font-medium">{formatBRL(Number(inst.amount))}</span>
    </button>
  );
}

function FutureBills({ purchases, cards }: { purchases: any[]; cards: any[] }) {
  const [cardId, setCardId] = useState<string>("all");
  const months = useMemo(() => {
    const items: { key: string; label: string; total: number; rows: { desc: string; amount: number; card: string; inst?: string }[] }[] = [];
    const today = new Date();
    today.setUTCDate(1);
    for (let i = 0; i < 12; i++) {
      const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
      items.push({
        key: monthKey(dt),
        label: `${MONTH_NAMES[dt.getUTCMonth()]}/${String(dt.getUTCFullYear()).slice(2)}`,
        total: 0,
        rows: [],
      });
    }
    const filtered = cardId === "all" ? purchases : purchases.filter((p) => p.credit_card_id === cardId);
    for (const p of filtered) {
      if (p.is_card_payment) continue;
      const cardName = cards.find((c) => c.id === p.credit_card_id)?.name ?? "Cartão";
      const insts = p.installments ?? [];
      if (insts.length > 0) {
        for (const i of insts) {
          if (i.paid) continue;
          const mk = monthKey(i.due_date);
          const slot = items.find((it) => it.key === mk);
          if (slot) {
            slot.total += Number(i.amount);
            slot.rows.push({
              desc: p.description || p.categories?.name || "Compra",
              amount: Number(i.amount),
              card: cardName,
              inst: `${i.installment_number}/${i.total_installments}`,
            });
          }
        }
      } else {
        const mk = monthKey(p.date);
        const slot = items.find((it) => it.key === mk);
        if (slot) {
          slot.total += Number(p.amount);
          slot.rows.push({ desc: p.description || "Compra", amount: Number(p.amount), card: cardName });
        }
      }
    }
    return items;
  }, [purchases, cards, cardId]);

  return (
    <div className="space-y-3">
      <Select value={cardId} onValueChange={setCardId}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os cartões</SelectItem>
          {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {months.map((m) => (
        <Card key={m.key} className="rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 flex items-center justify-between">
            <div className="font-semibold text-sm capitalize">{m.label}</div>
            <div className="text-sm font-bold">{formatBRL(m.total)}</div>
          </div>
          {m.rows.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">Sem lançamentos</div>
          ) : (
            <div className="divide-y divide-border">
              {m.rows.map((r, i) => (
                <div key={i} className="px-4 py-2 flex items-center gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.desc} {r.inst && <Badge variant="secondary" className="ml-1 text-[10px] py-0">{r.inst}</Badge>}</div>
                    <div className="text-muted-foreground">{r.card}</div>
                  </div>
                  <div className="font-semibold">{formatBRL(r.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function History({ purchases, cards, cats }: { purchases: any[]; cards: any[]; cats: any[] }) {
  const [type, setType] = useState<"all" | "parceladas" | "avista">("all");
  const [cardId, setCardId] = useState("all");
  const [catId, setCatId] = useState("all");
  const [period, setPeriod] = useState("90");

  const [status, setStatus] = useState<"ativas" | "quitadas" | "all">("ativas");

  const filtered = useMemo(() => {
    const cutoff = period === "all" ? null : new Date(Date.now() - Number(period) * 86400000);
    return purchases.filter((p) => {
      const insts = p.installments?.length ?? 0;
      const isQuitada = insts > 1 && p.installments.every((i: any) => i.paid);
      
      if (status === "ativas" && isQuitada) return false;
      if (status === "quitadas" && !isQuitada) return false;
      if (type === "parceladas" && insts <= 1) return false;
      if (type === "avista" && insts > 1) return false;
      if (cardId !== "all" && p.credit_card_id !== cardId) return false;
      if (catId !== "all" && p.category_id !== catId) return false;
      if (cutoff && new Date(p.date) < cutoff) return false;
      return true;
    });
  }, [purchases, type, cardId, catId, period, status]);

  const [selectedRecord, setSelectedRecord] = useState<{ id: string, type: 'payment' | 'purchase' | 'transaction' } | null>(null);

  return (
    <div className="space-y-3">
      {/* Modais encapsulados em ErrorBoundary local */}
      <ErrorBoundary>
        <CardPurchaseEditDrawer
          purchaseId={selectedRecord?.type === 'purchase' ? selectedRecord.id : null}
          open={selectedRecord?.type === 'purchase'}
          onOpenChange={(op) => !op && setSelectedRecord(null)}
        />
        <InvoicePaymentDetailsDrawer
          paymentId={selectedRecord?.type === 'payment' ? selectedRecord.id : null}
          open={selectedRecord?.type === 'payment'}
          onOpenChange={(op) => !op && setSelectedRecord(null)}
        />
        {/* TransactionEditDrawer pode ser adicionado aqui caso haja outros tipos, mas por padrão vamos usar purchase para compras normais */}
      </ErrorBoundary>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativas">Ativas e Pendentes</SelectItem>
            <SelectItem value="quitadas">Quitadas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as compras</SelectItem>
            <SelectItem value="parceladas">Parceladas</SelectItem>
            <SelectItem value="avista">À vista</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="180">Últimos 6 meses</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cardId} onValueChange={setCardId}>
          <SelectTrigger><SelectValue placeholder="Cartão" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos cartões</SelectItem>
            {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catId} onValueChange={setCatId}>
          <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="rounded-2xl p-4 shadow-card">
          <EmptyState icon={Wallet} title="Sem compras" description="Ajuste os filtros ou cadastre uma nova compra." />
        </Card>
      ) : (
        <Card className="rounded-3xl shadow-card overflow-hidden divide-y divide-border">
          {filtered.map((p) => {
            const insts = p.installments?.length ?? 0;
            const cardName = cards.find((c) => c.id === p.credit_card_id)?.name ?? "—";
            const isQuitada = insts > 1 && p.installments.every((i: any) => i.paid);
            const isCancelled = false; // transactions are hard-deleted
            
            return (
              <div 
                key={p.id} 
                className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${
                  isCancelled ? "opacity-40" : 
                  isQuitada ? "opacity-60 bg-muted/20" : 
                  "hover:bg-muted/30"
                }`}
                onClick={() => {
                  const type = p.is_card_payment ? 'payment' : 'purchase';
                  setSelectedRecord({ id: p.id, type });
                }}
              >
                <div className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${isCancelled ? "bg-muted text-muted-foreground" : "bg-accent/40"}`}>
                  <ShoppingBag className="size-4 text-foreground/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                    {p.description || p.categories?.name || "Compra"}
                    {isCancelled && <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded uppercase no-underline">Cancelada</span>}
                    {isQuitada && !isCancelled && <span className="ml-2 text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded uppercase no-underline">Quitada</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR")} · {cardName}
                    {insts > 1 && <> · {insts}x</>}
                    {p.categories?.name && <> · {p.categories.name}</>}
                  </div>
                </div>
                <div className={`text-sm font-semibold ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                  {formatBRL(Number(p.amount))}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function MonthlyChart({ cards, cardMetrics }: { cards: any[]; cardMetrics: any }) {
  const [cardId, setCardId] = useState<string>(cards[0]?.id ?? "");
  useEffect(() => { if (!cardId && cards[0]) setCardId(cards[0].id); }, [cards, cardId]);
  if (cards.length === 0) return null;
  const m = cardMetrics[cardId];
  const data = useMemo(() => {
    if (!m) return [];
    const today = new Date();
    const out: { label: string; value: number }[] = [];
    for (let i = -6; i < 6; i++) {
      const dt = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1));
      const key = monthKey(dt);
      out.push({ label: `${MONTH_NAMES[dt.getUTCMonth()]}/${String(dt.getUTCFullYear()).slice(2)}`, value: Number(m.monthly?.[key] ?? 0) });
    }
    return out;
  }, [m]);
  return (
    <Card className="rounded-3xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="size-4 text-primary" /> Evolução mensal</h3>
        <Select value={cardId} onValueChange={setCardId}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis fontSize={10} tickLine={false} axisLine={false} width={50} />
          <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
          <Line type="monotone" dataKey="value" stroke="#FF6B57" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function CompareChart({ cards, cardMetrics }: { cards: any[]; cardMetrics: any }) {
  if (cards.length === 0) return null;
  const data = cards.map((c) => {
    const m = cardMetrics[c.id] ?? {};
    const limit = Number(c.limit_amount) || 0;
    // FONTE ÚNICA: prefere activeInv.total_amount (servidor) sobre currentBill (cliente)
    const fatura = Number(m.activeInv?.total_amount ?? m.currentBill ?? 0);
    return {
      name: c.name,
      fatura: Math.round(fatura),
      comprometido: Math.round(m.used ?? 0),
      limite: Math.round(limit),
      pct: limit > 0 ? Math.round(((m.used ?? 0) / limit) * 100) : 0,
    };
  });
  return (
    <Card className="rounded-3xl p-5 shadow-card">
      <h3 className="font-semibold text-sm mb-3">Comparação entre cartões</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis fontSize={10} tickLine={false} axisLine={false} width={50} />
          <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="fatura" fill="#7B61FF" radius={[6, 6, 0, 0]} name="Fatura atual" />
          <Bar dataKey="comprometido" fill="#FF6B57" radius={[6, 6, 0, 0]} name="Total comprometido" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 space-y-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate font-medium">{d.name}</span>
            <span className="text-muted-foreground">{d.pct}% do limite</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PurchaseForm({ cards, cats, onDone }: { cards: any[]; cats: any[]; onDone: () => void }) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("1");
  const [date, setDate] = useState(getLocalISODate());
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [catId, setCatId] = useState<string>("");

  const total = Number(amount) || 0;
  const n = Math.max(1, Number(installments) || 1);
  const perInstallment = n > 1 ? total / n : total;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !cardId) return;
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      couple_id: profile?.couple_id ?? null,
      type: "expense",
      amount: total,
      description,
      date,
      credit_card_id: cardId,
      total_installments: n > 1 ? n : null,
      category_id: catId || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(n > 1 ? `Compra em ${n}x criada!` : "Compra registrada!");
      qc.invalidateQueries({ queryKey: ["card-purchases"] });
      onDone();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Descrição</Label><Input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Sofá" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Valor total</Label><Input required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Parcelas</Label><Input type="number" min={1} max={48} value={installments} onChange={(e) => setInstallments(e.target.value)} /></div>
      </div>
      {n > 1 && total > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-xl p-2.5">
          {n}x de <b>{formatBRL(perInstallment)}</b> · Total {formatBRL(total)}
        </div>
      )}
      <div><Label>Data da compra</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div>
        <Label>Cartão</Label>
        <Select value={cardId} onValueChange={setCardId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Categoria</Label>
        <Select value={catId} onValueChange={setCatId}>
          <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
          <SelectContent>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Registrar compra</Button>
    </form>
  );
}

function CardForm({ card, onDone }: { card?: any; onDone: () => void }) {
  const isEdit = !!card;
  const [name, setName] = useState(card?.name ?? "");
  const [bank, setBank] = useState(card?.bank ?? "");
  const [color, setColor] = useState(card?.color ?? COLORS[0]);
  const [limitAmount, setLimitAmount] = useState(card?.limit_amount != null ? String(card.limit_amount) : "");
  const [closingDay, setClosingDay] = useState(card?.closing_day != null ? String(card.closing_day) : "1");
  const [dueDay, setDueDay] = useState(card?.due_day != null ? String(card.due_day) : "10");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const payload = {
      name, bank, color,
      limit_amount: Number(limitAmount) || 0,
      closing_day: Math.min(31, Math.max(1, Number(closingDay) || 1)),
      due_day: Math.min(31, Math.max(1, Number(dueDay) || 10)),
    };
    const { error } = isEdit
      ? await supabase.from("credit_cards").update(payload).eq("id", card.id)
      : await supabase.from("credit_cards").insert({
          user_id: user.id,
          couple_id: profile?.couple_id ?? null,
          ...payload,
        });
    if (error) toast.error(error.message);
    else {
      toast.success(isEdit ? "Cartão atualizado!" : "Cartão criado!");
      qc.invalidateQueries({ queryKey: ["cards"] });
      onDone();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Nome do cartão</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank" /></div>
      <div><Label>Banco</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Nubank, Inter..." /></div>
      <div>
        <Label>Cor</Label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={`size-8 rounded-full border-2 ${color === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ background: c }} />
          ))}
        </div>
      </div>
      <div><Label>Limite</Label><Input type="number" step="0.01" value={limitAmount} onChange={(e) => setLimitAmount(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Fechamento (dia)</Label><Input type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} /></div>
        <div><Label>Vencimento (dia)</Label><Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></div>
      </div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">{isEdit ? "Salvar alterações" : "Salvar"}</Button>
    </form>
  );
}
