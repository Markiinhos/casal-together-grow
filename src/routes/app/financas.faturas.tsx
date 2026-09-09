import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, usePartner } from "@/lib/hooks";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { formatBRL } from "@/lib/finance";
import { CreditCard, History, ChevronRight, CheckCircle2, Wallet } from "lucide-react";

export const Route = createFileRoute("/app/financas/faturas")({
  head: () => ({
    meta: [
      { title: "Faturas dos cartões — CASAL" },
      { name: "description", content: "Todas as faturas dos seus cartões com histórico de pagamentos e alterações." },
      { property: "og:title", content: "Faturas dos cartões — CASAL" },
      { property: "og:description", content: "Todas as faturas dos seus cartões com histórico de pagamentos e alterações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoicesPage,
});

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  closed: "Fechada",
  due: "Vence hoje",
  overdue: "Atrasada",
  partially_paid: "Paga em parte",
  paid: "Paga",
  cancelled: "Cancelada",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  closed: "bg-warning/15 text-warning-foreground",
  due: "bg-warning/20 text-warning-foreground",
  overdue: "bg-destructive/10 text-destructive",
  partially_paid: "bg-accent-purple/15 text-accent-purple",
  paid: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

const EDIT_FIELD_LABELS: Record<string, string> = {
  reference_month: "Mês de competência",
  due_date: "Vencimento",
  manual_adjustment: "Ajuste manual",
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");
  } catch {
    return v;
  }
}

function fmtMonth(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v.slice(0, 7) + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } catch {
    return v;
  }
}

function fmtEditValue(field: string, value: string | null) {
  if (value == null) return "—";
  if (field === "manual_adjustment") return formatBRL(Number(value));
  if (field === "reference_month") return fmtMonth(value);
  if (field === "due_date") return fmtDate(value);
  return value;
}

type Filter = "all" | "open" | "paid";

function InvoicesPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  function personName(uid?: string | null) {
    if (!uid) return "—";
    if (uid === user?.id) return profile?.full_name?.split(" ")[0] ?? "Você";
    if (uid === partner?.id) return partner?.full_name?.split(" ")[0] ?? "Parceiro";
    return "—";
  }

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["all-card-invoices", user?.id],
    queryFn: async () => {
      // Atualiza status/valores (abre → fechada → vencida) antes de listar
      await supabase.rpc("update_my_invoice_statuses" as any).then(() => null, () => null);
      const { data, error } = await supabase
        .from("card_invoices")
        .select("*, credit_cards(name,color,bank,closing_day,due_day)")
        .order("reference_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const invoiceIds = useMemo(() => invoices.map((i) => i.id), [invoices]);

  const { data: edits = [] } = useQuery({
    queryKey: ["all-card-invoice-edits", invoiceIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("card_invoice_edits" as any)
        .select("*")
        .in("invoice_id", invoiceIds)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: invoiceIds.length > 0,
  });

  const paymentIds = useMemo(
    () => invoices.map((i) => i.payment_transaction_id).filter(Boolean) as string[],
    [invoices],
  );

  const { data: payments = [] } = useQuery({
    queryKey: ["all-card-invoice-payments", paymentIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id,amount,date,description,account_id,user_id,bank_accounts(name)")
        .in("id", paymentIds);
      return (data ?? []) as any[];
    },
    enabled: paymentIds.length > 0,
  });

  const editsByInvoice = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const e of edits) (m[e.invoice_id] ??= []).push(e);
    return m;
  }, [edits]);

  const paymentById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of payments) m[p.id] = p;
    return m;
  }, [payments]);

  const filtered = useMemo(() => {
    if (filter === "paid") return invoices.filter((i) => i.status === "paid");
    if (filter === "open") return invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled");
    return invoices;
  }, [invoices, filter]);

  const totalOpen = invoices
    .filter((i) => i.status !== "paid" && i.status !== "cancelled")
    .reduce((s, i) => s + (Number(i.total_amount) - Number(i.paid_amount ?? 0)), 0);

  return (
    <>
      <PageHeader title="Faturas" subtitle="Todas as faturas, pagamentos e alterações" fallbackRoute="/app/financas" />
      <div className="px-4 py-4 space-y-4 pb-24">
        <Card className="rounded-3xl p-5 shadow-card">
          <div className="text-xs text-muted-foreground">Em aberto no total</div>
          <div className="text-3xl font-bold mt-0.5">{formatBRL(totalOpen)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {invoices.length} fatura(s) registradas
          </div>
        </Card>

        <div className="flex gap-2">
          {([
            { v: "all", l: "Todas" },
            { v: "open", l: "Em aberto" },
            { v: "paid", l: "Pagas" },
          ] as { v: Filter; l: string }[]).map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border transition ${
                filter === f.v ? "bg-primary text-white border-primary" : "bg-card border-border text-muted-foreground"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState
              icon={CreditCard}
              title="Nenhuma fatura"
              description="As faturas aparecem aqui conforme os ciclos dos seus cartões fecham."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((inv) => {
              const card = inv.credit_cards ?? {};
              const color = card.color || "#7B61FF";
              const remaining = Number(inv.total_amount) - Number(inv.paid_amount ?? 0);
              const invEdits = editsByInvoice[inv.id] ?? [];
              const payment = inv.payment_transaction_id ? paymentById[inv.payment_transaction_id] : null;
              const isOpenNow = expanded === inv.id;
              return (
                <Card key={inv.id} className="rounded-2xl shadow-card overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: color + "22", color }}
                      >
                        <CreditCard className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{card.name ?? "Cartão"}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {fmtMonth(inv.reference_month)} · vence {fmtDate(inv.due_date)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">{formatBRL(Number(inv.total_amount))}</div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[inv.status] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                      <div className="rounded-xl bg-muted/50 p-2">
                        <div className="text-muted-foreground">Fecha</div>
                        <div className="font-semibold">{fmtDate(inv.closing_date)}</div>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-2">
                        <div className="text-muted-foreground">Pago</div>
                        <div className="font-semibold text-success">{formatBRL(Number(inv.paid_amount ?? 0))}</div>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-2">
                        <div className="text-muted-foreground">Restante</div>
                        <div className={`font-semibold ${remaining > 0 ? "text-destructive" : "text-success"}`}>
                          {formatBRL(Math.max(0, remaining))}
                        </div>
                      </div>
                    </div>

                    {Number(inv.manual_adjustment ?? 0) !== 0 && (
                      <div className="text-[11px] mt-2">
                        Ajuste manual:{" "}
                        <span className={Number(inv.manual_adjustment) > 0 ? "text-destructive font-semibold" : "text-success font-semibold"}>
                          {Number(inv.manual_adjustment) > 0 ? "+" : ""}
                          {formatBRL(Number(inv.manual_adjustment))}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={() => setExpanded(isOpenNow ? null : inv.id)}
                        className="text-xs text-primary font-medium flex items-center gap-1"
                      >
                        <History className="size-3.5" />
                        Histórico ({invEdits.length + (payment ? 1 : 0)})
                      </button>
                      <Link
                        to="/app/cartoes/$cardId/faturas/$invoiceId"
                        params={{ cardId: inv.card_id, invoiceId: inv.id }}
                        className="text-xs text-muted-foreground font-medium flex items-center gap-0.5 ml-auto"
                      >
                        Abrir fatura <ChevronRight className="size-3.5" />
                      </Link>
                    </div>
                  </div>

                  {isOpenNow && (
                    <div className="border-t border-border/60 bg-muted/20 divide-y divide-border/50">
                      {payment && (
                        <div className="px-4 py-3 text-xs flex items-start gap-2">
                          <CheckCircle2 className="size-3.5 text-success mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <div className="font-medium">Pagamento registrado</div>
                            <div className="text-muted-foreground">
                              {formatBRL(Number(payment.amount))} em {fmtDate(payment.date)}
                              {payment.bank_accounts?.name ? ` · ${payment.bank_accounts.name}` : ""}
                              {` · ${personName(payment.user_id)}`}
                            </div>
                          </div>
                        </div>
                      )}
                      {invEdits.map((e) => (
                        <div key={e.id} className="px-4 py-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{EDIT_FIELD_LABELS[e.field] ?? e.field}</span>
                            <span className="text-muted-foreground">
                              {personName(e.edited_by)} ·{" "}
                              {new Date(e.created_at).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="text-muted-foreground mt-0.5">
                            {fmtEditValue(e.field, e.old_value)} →{" "}
                            <span className="text-foreground font-medium">{fmtEditValue(e.field, e.new_value)}</span>
                          </div>
                          {e.note && <div className="text-muted-foreground italic mt-0.5">"{e.note}"</div>}
                        </div>
                      ))}
                      {!payment && invEdits.length === 0 && (
                        <div className="px-4 py-3 text-xs text-muted-foreground">
                          Nenhum pagamento ou alteração registrada nesta fatura.
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <Card className="rounded-2xl p-4 shadow-card text-xs text-muted-foreground flex gap-2">
          <Wallet className="size-4 shrink-0 text-primary" />
          <span>
            Faturas com o ciclo ainda aberto não podem ser marcadas como pagas — o valor ainda pode mudar até a data de
            fechamento.
          </span>
        </Card>
      </div>
    </>
  );
}
