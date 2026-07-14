import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { formatBRL } from "@/lib/finance";
import {
  fetchSubscriptionById,
  fetchSubscriptionHistory,
  monthlyEquivalent,
  annualProjection,
  frequencyLabel,
  statusLabel,
  statusColor,
  paymentMethodLabel,
  calcNextBillingDate,
  type Subscription,
  type SubHistory,
} from "@/lib/subscriptions";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Pencil, Pause, Play, XCircle, Trash2, CreditCard,
  Wallet, Calendar, TrendingUp, Clock, History,
  ExternalLink, AlertTriangle, RefreshCw, Receipt
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/financas/assinaturas/$id")(
  { component: SubDetailPage },
);

function SubDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [editName, setEditName] = useState("");

  const { data: sub, isLoading } = useQuery({
    queryKey: ["subscription", id],
    queryFn: () => fetchSubscriptionById(id),
    enabled: !!id && !!user,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["subscription-history", id],
    queryFn: () => fetchSubscriptionHistory(id),
    enabled: !!id && !!user,
  });

  // Linked transactions
  const { data: linkedTx = [] } = useQuery({
    queryKey: ["subscription-tx", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, date, amount, description")
        .like("source", `subscription_charge:${id}:%`)
        .order("date", { ascending: false })
        .limit(12);
      return data ?? [];
    },
    enabled: !!id && !!user,
  });

  // 12-month projection
  const projection = useMemo(() => {
    if (!sub || sub.status === "canceled" || sub.status === "ended") return [];
    const months: { month: string; amount: number }[] = [];
    const me = monthlyEquivalent(sub);
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      months.push({
        month: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        amount: me,
      });
    }
    return months;
  }, [sub]);

  // Mutations
  const updateStatus = useMutation({
    mutationFn: async ({ newStatus, resumeDate }: { newStatus: string; resumeDate?: string }) => {
      if (!sub || !user) throw new Error("Missing data");
      const updates: any = { status: newStatus };
      if (resumeDate) updates.next_billing_date = resumeDate;
      if (newStatus === "canceled") updates.end_date = getLocalISODate(new Date());
      const { error } = await supabase.from("subscriptions").update(updates).eq("id", sub.id);
      if (error) throw error;
      await supabase.from("subscription_history").insert({
        subscription_id: sub.id,
        changed_by: user.id,
        action: newStatus === "paused" ? "paused" : newStatus === "active" ? "reactivated" : "canceled",
        old_values: { status: sub.status },
        new_values: updates,
      } as any);
    },
    onSuccess: () => {
      toast.success("Atualizado!");
      qc.invalidateQueries({ queryKey: ["subscription", id] });
      qc.invalidateQueries({ queryKey: ["subscription-history", id] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const updatePrice = useMutation({
    mutationFn: async () => {
      if (!sub || !user) throw new Error("Missing data");
      const newAmt = parseFloat(editAmount.replace(",", "."));
      if (isNaN(newAmt) || newAmt < 0) throw new Error("Valor inválido");
      const { error } = await supabase.from("subscriptions").update({
        amount: newAmt,
        name: editName.trim() || sub.name,
      }).eq("id", sub.id);
      if (error) throw error;
      await supabase.from("subscription_history").insert({
        subscription_id: sub.id,
        changed_by: user.id,
        action: "price_changed",
        old_values: { amount: sub.amount, name: sub.name },
        new_values: { amount: newAmt, name: editName.trim() || sub.name },
      } as any);
    },
    onSuccess: () => {
      toast.success("Atualizado!");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["subscription", id] });
      qc.invalidateQueries({ queryKey: ["subscription-history", id] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const deleteSub = useMutation({
    mutationFn: async () => {
      if (!sub) throw new Error("Not found");
      if (linkedTx.length > 0) {
        // Archive instead of delete
        const { error } = await supabase.from("subscriptions").update({ status: "ended" }).eq("id", sub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").delete().eq("id", sub.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(linkedTx.length > 0 ? "Assinatura encerrada (transações mantidas)" : "Excluída!");
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      navigate({ to: "/app/financas/assinaturas" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  // Manual charge
  const manualCharge = useMutation({
    mutationFn: async () => {
      if (!sub || !user) throw new Error("Missing data");
      const dedupe = `subscription_charge:${sub.id}:${sub.next_billing_date}`;
      // Check dedupe
      const { data: existing } = await supabase.from("transactions").select("id").eq("source", dedupe).maybeSingle();
      if (existing) throw new Error("Cobrança já registrada para esta data");

      const { data: tx, error } = await supabase.from("transactions").insert({
        user_id: sub.user_id,
        couple_id: sub.couple_id,
        visibility: sub.visibility,
        type: "expense",
        amount: Number(sub.amount),
        description: `Assinatura: ${sub.name}`,
        date: sub.next_billing_date,
        category_id: sub.category_id,
        credit_card_id: sub.card_id,
        source: dedupe,
        is_card_payment: false,
      } as any).select("id").single();
      if (error) throw error;

      // Advance next billing
      const nextDate = calcNextBillingDate(
        new Date(sub.next_billing_date + "T00:00:00"),
        sub.billing_frequency,
        sub.billing_interval
      ).toISOString().slice(0, 10);

      await supabase.from("subscriptions").update({
        last_charged_at: new Date().toISOString(),
        last_generated_transaction_id: tx.id,
        next_billing_date: nextDate,
      }).eq("id", sub.id);

      await supabase.from("subscription_history").insert({
        subscription_id: sub.id,
        changed_by: user.id,
        action: "manual_charge",
        new_values: { transaction_id: tx.id, amount: sub.amount, billing_date: sub.next_billing_date },
      } as any);
    },
    onSuccess: () => {
      toast.success("Cobrança registrada!");
      qc.invalidateQueries({ queryKey: ["subscription", id] });
      qc.invalidateQueries({ queryKey: ["subscription-tx", id] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-invoices"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Detalhes" fallbackRoute="/app/financas/assinaturas" />
        <div className="px-4 py-4 space-y-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </>
    );
  }

  if (!sub) {
    return (
      <>
        <PageHeader title="Não encontrada" fallbackRoute="/app/financas/assinaturas" />
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Assinatura não encontrada ou sem permissão.
        </div>
      </>
    );
  }

  const me = monthlyEquivalent(sub);
  const annual = annualProjection(sub);
  const nextDate = new Date(sub.next_billing_date + "T12:00:00");
  const daysUntil = Math.ceil((nextDate.getTime() - new Date().getTime()) / 86400000);

  return (
    <>
      <PageHeader title={sub.name} subtitle={statusLabel(sub.status)} fallbackRoute="/app/financas/assinaturas">
        <Button variant="ghost" size="icon" onClick={() => { setEditName(sub.name); setEditAmount(String(sub.amount)); setEditOpen(true); }} className="size-9 rounded-full">
          <Pencil className="size-4" />
        </Button>
      </PageHeader>
      <div className="px-4 py-4 space-y-4 pb-24">
        {/* Main Info Card */}
        <Card className="rounded-3xl p-5 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              {sub.payment_method === "credit_card" ? <CreditCard className="size-5" /> : <Wallet className="size-5" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{sub.name}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusColor(sub.status)}`}>
                  {statusLabel(sub.status)}
                </span>
              </div>
              {sub.description && <p className="text-xs text-muted-foreground mt-0.5">{sub.description}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-accent p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-1">Valor</p>
              <p className="text-sm font-bold">{formatBRL(Number(sub.amount))}</p>
              <p className="text-[9px] text-muted-foreground">{frequencyLabel(sub.billing_frequency, sub.billing_interval)}</p>
            </div>
            <div className="rounded-2xl bg-accent p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-1">Mensal eq.</p>
              <p className="text-sm font-bold">{formatBRL(me)}</p>
            </div>
            <div className="rounded-2xl bg-accent p-3 text-center">
              <p className="text-[10px] text-muted-foreground mb-1">Anual est.</p>
              <p className="text-sm font-bold">{formatBRL(annual)}</p>
            </div>
          </div>
        </Card>

        {/* Details */}
        <Card className="rounded-3xl p-5 shadow-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Calendar className="size-4" /> Detalhes</h3>
          <DetailRow label="Próxima cobrança" value={
            <span className={daysUntil <= 3 && daysUntil >= 0 ? "text-orange-500 font-medium" : ""}>
              {nextDate.toLocaleDateString("pt-BR")} ({daysUntil < 0 ? "vencida" : daysUntil === 0 ? "hoje" : `em ${daysUntil} dias`})
            </span>
          } />
          <DetailRow label="Forma de pagamento" value={paymentMethodLabel(sub.payment_method)} />
          {sub.credit_cards && <DetailRow label="Cartão" value={(sub.credit_cards as any).name} />}
          {sub.bank_accounts && <DetailRow label="Conta" value={(sub.bank_accounts as any).name} />}
          {sub.start_date && <DetailRow label="Início" value={new Date(sub.start_date + "T12:00:00").toLocaleDateString("pt-BR")} />}
          {sub.end_date && <DetailRow label="Data final" value={new Date(sub.end_date + "T12:00:00").toLocaleDateString("pt-BR")} />}
          {sub.trial_enabled && sub.trial_end_date && (
            <DetailRow label="Fim do teste" value={new Date(sub.trial_end_date + "T12:00:00").toLocaleDateString("pt-BR")} />
          )}
          {sub.url && (
            <DetailRow label="Site" value={
              <a href={sub.url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs flex items-center gap-1">
                {sub.url.replace(/^https?:\/\//, "").slice(0, 30)} <ExternalLink className="size-3" />
              </a>
            } />
          )}
          {sub.metadata?.notes && <DetailRow label="Notas" value={sub.metadata.notes} />}
        </Card>

        {/* Actions */}
        <Card className="rounded-3xl p-5 shadow-card space-y-3">
          <h3 className="font-semibold text-sm">Ações</h3>
          <div className="grid grid-cols-2 gap-2">
            {sub.status === "active" && (
              <Button variant="outline" className="rounded-xl text-xs h-10" onClick={() => updateStatus.mutate({ newStatus: "paused" })} disabled={updateStatus.isPending}>
                <Pause className="size-3.5 mr-1" /> Pausar
              </Button>
            )}
            {sub.status === "paused" && (
              <Button variant="outline" className="rounded-xl text-xs h-10" onClick={() => {
                const resumeDate = getLocalISODate(new Date());
                updateStatus.mutate({ newStatus: "active", resumeDate });
              }} disabled={updateStatus.isPending}>
                <Play className="size-3.5 mr-1" /> Reativar
              </Button>
            )}
            {(sub.status === "active" || sub.status === "paused" || sub.status === "trial") && (
              <Button variant="outline" className="rounded-xl text-xs h-10 text-destructive" onClick={() => {
                if (confirm("Cancelar assinatura? Cobranças passadas serão mantidas.")) {
                  updateStatus.mutate({ newStatus: "canceled" });
                }
              }} disabled={updateStatus.isPending}>
                <XCircle className="size-3.5 mr-1" /> Cancelar
              </Button>
            )}
            {sub.status === "active" && (
              <Button variant="outline" className="rounded-xl text-xs h-10" onClick={() => {
                if (confirm(`Registrar cobrança manual de ${formatBRL(Number(sub.amount))}?`)) {
                  manualCharge.mutate();
                }
              }} disabled={manualCharge.isPending}>
                <Receipt className="size-3.5 mr-1" /> Registrar cobrança
              </Button>
            )}
            <Button variant="outline" className="rounded-xl text-xs h-10 text-destructive" onClick={() => {
              const msg = linkedTx.length > 0
                ? "Há transações vinculadas. A assinatura será encerrada (mantendo histórico)."
                : "Excluir assinatura permanentemente?";
              if (confirm(msg)) deleteSub.mutate();
            }} disabled={deleteSub.isPending}>
              <Trash2 className="size-3.5 mr-1" /> {linkedTx.length > 0 ? "Encerrar" : "Excluir"}
            </Button>
          </div>
        </Card>

        {/* Charge history */}
        <Card className="rounded-3xl p-5 shadow-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Receipt className="size-4" /> Cobranças ({linkedTx.length})</h3>
          {linkedTx.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhuma cobrança registrada</p>
          ) : (
            <div className="space-y-1.5">
              {linkedTx.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50">
                  <span className="text-xs text-muted-foreground">{new Date(tx.date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                  <span className="text-sm font-medium">{formatBRL(Number(tx.amount))}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Activity History */}
        <Card className="rounded-3xl p-5 shadow-card space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><History className="size-4" /> Histórico</h3>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum registro</p>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 10).map((h) => (
                <div key={h.id} className="flex items-start gap-2 py-1.5">
                  <div className="size-6 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="size-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{historyActionLabel(h.action)}</p>
                    {h.new_values?.amount != null && h.old_values?.amount != null && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatBRL(h.old_values.amount)} → {formatBRL(h.new_values.amount)}
                        {" "}({h.new_values.amount > h.old_values.amount ? "+" : ""}{formatBRL(h.new_values.amount - h.old_values.amount)}/mês)
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 12-month projection */}
        {projection.length > 0 && (
          <Card className="rounded-3xl p-5 shadow-card space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="size-4" /> Projeção 12 meses</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {projection.map((p, i) => (
                <div key={i} className="rounded-lg bg-accent p-2 text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">{p.month}</p>
                  <p className="text-[11px] font-semibold mt-0.5">{formatBRL(p.amount)}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Total previsto: {formatBRL(projection.reduce((s, p) => s + p.amount, 0))}</p>
          </Card>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-3xl border-0 shadow-xl sm:max-w-md">
          <DialogHeader><DialogTitle>Editar assinatura</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updatePrice.mutate(); }} className="space-y-4 mt-2">
            <div>
              <Label>Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Novo valor</Label>
              <Input inputMode="decimal" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
              {sub && editAmount && parseFloat(editAmount.replace(",", ".")) !== Number(sub.amount) && (
                <p className="text-[11px] mt-1 text-muted-foreground">
                  {parseFloat(editAmount.replace(",", ".")) > Number(sub.amount) ? "Aumento" : "Redução"} de{" "}
                  {formatBRL(Math.abs(parseFloat(editAmount.replace(",", ".")) - Number(sub.amount)))}/mês
                  {" "}({formatBRL(Math.abs(parseFloat(editAmount.replace(",", ".")) - Number(sub.amount)) * 12)}/ano)
                </p>
              )}
            </div>
            <Button type="submit" disabled={updatePrice.isPending} className="w-full rounded-xl gradient-coral text-white border-0 h-11">
              {updatePrice.isPending ? "Salvando..." : "Atualizar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right max-w-[55%] truncate">{value}</span>
    </div>
  );
}

function historyActionLabel(action: string): string {
  switch (action) {
    case "created": return "Assinatura criada";
    case "price_changed": return "Preço alterado";
    case "paused": return "Pausada";
    case "reactivated": return "Reativada";
    case "canceled": return "Cancelada";
    case "charge_generated": return "Cobrança gerada";
    case "manual_charge": return "Cobrança manual";
    case "card_changed": return "Cartão alterado";
    case "renewed": return "Renovada";
    default: return action;
  }
}
