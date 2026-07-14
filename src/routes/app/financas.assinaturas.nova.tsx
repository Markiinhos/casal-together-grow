import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BillingFrequency, PaymentMethod, SubStatus } from "@/lib/subscriptions";

export const Route = createFileRoute("/app/financas/assinaturas/nova")(
  { component: NewSubPage },
);

function NewSubPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<BillingFrequency>("monthly");
  const [interval, setInterval] = useState("1");
  const [startDate, setStartDate] = useState(getLocalISODate(new Date()));
  const [nextBilling, setNextBilling] = useState(getLocalISODate(new Date()));
  const [billingDay, setBillingDay] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [cardId, setCardId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<SubStatus>("active");
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialEndDate, setTrialEndDate] = useState("");
  const [amountAfterTrial, setAmountAfterTrial] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Load categories
  const { data: categories } = useQuery({
    queryKey: ["categories-sub", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("categories").select("*").in("type", ["expense", "other"]).eq("is_archived", false).order("name");
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Load cards
  const { data: cards } = useQuery({
    queryKey: ["cards-sub", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("credit_cards").select("*").order("name");
      if (space === "private") q = q.eq("visibility", "private").eq("user_id", user!.id);
      else if (coupleId) q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      else q = q.eq("visibility", "shared").eq("user_id", user!.id);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Load accounts
  const { data: accounts } = useQuery({
    queryKey: ["accounts-sub", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("bank_accounts").select("*").eq("hidden", false).order("name");
      if (space === "private") q = q.eq("visibility", "private").eq("user_id", user!.id);
      else if (coupleId) q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      else q = q.eq("visibility", "shared").eq("user_id", user!.id);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    setSaving(true);

    const actualCoupleId = space === "shared" ? coupleId : null;
    const parsedAmount = parseFloat(amount.replace(",", "."));

    if (!name.trim() || isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error("Preencha o nome e o valor corretamente");
      setSaving(false);
      return;
    }

    const effectiveStatus = trialEnabled ? "trial" : status;

    const payload = {
      user_id: user.id,
      couple_id: actualCoupleId,
      created_by: user.id,
      visibility: space,
      name: name.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      icon: null,
      url: url.trim() || null,
      amount: parsedAmount,
      currency: "BRL",
      billing_frequency: frequency,
      billing_interval: parseInt(interval) || 1,
      start_date: startDate || null,
      next_billing_date: nextBilling,
      billing_day: billingDay ? parseInt(billingDay) : null,
      renewal_date: renewalDate || null,
      end_date: endDate || null,
      payment_method: paymentMethod,
      account_id: paymentMethod === "bank_account" || paymentMethod === "debit" ? (accountId || null) : null,
      card_id: paymentMethod === "credit_card" ? (cardId || null) : null,
      responsible_user_id: user.id,
      status: effectiveStatus,
      trial_enabled: trialEnabled,
      trial_end_date: trialEnabled && trialEndDate ? trialEndDate : null,
      amount_after_trial: trialEnabled && amountAfterTrial
        ? parseFloat(amountAfterTrial.replace(",", "."))
        : null,
      auto_renew: autoRenew,
      metadata: notes.trim() ? { notes: notes.trim() } : {},
    };

    const { data, error } = await supabase
      .from("subscriptions")
      .insert(payload as any)
      .select("*")
      .single();

    if (error) {
      console.error("[sub] create error", error);
      toast.error(error.message);
      setSaving(false);
      return;
    }

    // Log history
    await supabase.from("subscription_history").insert({
      subscription_id: data.id,
      changed_by: user.id,
      action: "created",
      new_values: { name: payload.name, amount: payload.amount, status: payload.status },
    } as any);

    // Create notification for partner if shared
    if (space === "shared" && coupleId) {
      const { data: partnerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("couple_id", coupleId)
        .neq("id", user.id)
        .maybeSingle();

      if (partnerProfile) {
        await supabase.from("notifications").insert({
          user_id: partnerProfile.id,
          title: "Nova assinatura compartilhada",
          body: `${profile?.full_name || "Parceiro(a)"} adicionou: ${name.trim()} — ${formatBRL(parsedAmount)}`,
          type: "subscription",
          link: `/app/financas/assinaturas/${data.id}`,
          dedupe_key: `subscription_created:${data.id}`,
        } as any);
      }
    }

    toast.success("Assinatura criada!");
    qc.invalidateQueries({ queryKey: ["subscriptions"] });
    qc.invalidateQueries({ queryKey: ["fin-expenses"] });
    setSaving(false);
    navigate({ to: "/app/financas/assinaturas" });
  }

  return (
    <>
      <PageHeader title="Nova assinatura" subtitle="Cadastre uma despesa recorrente" fallbackRoute="/app/financas/assinaturas" />
      <div className="px-4 py-4 pb-24">
        <Card className="rounded-3xl p-5 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <Label>Nome do serviço *</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Netflix, Spotify, Academia" />
            </div>

            {/* Description */}
            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Plano família, 4 telas..." />
            </div>

            {/* Category */}
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value + Frequency row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor *</Label>
                <Input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Periodicidade</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as BillingFrequency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="bimonthly">Bimestral</SelectItem>
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                    <SelectItem value="semiannual">Semestral</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                    <SelectItem value="custom">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {frequency === "custom" && (
              <div>
                <Label>Intervalo (meses)</Label>
                <Input type="number" min="1" value={interval} onChange={(e) => setInterval(e.target.value)} />
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de início</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Próxima cobrança *</Label>
                <Input type="date" required value={nextBilling} onChange={(e) => setNextBilling(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Dia de vencimento</Label>
                <Input type="number" min="1" max="31" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} placeholder="Ex: 15" />
              </div>
              <div>
                <Label>Data de renovação</Label>
                <Input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Data final (quando houver)</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            {/* Payment method */}
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="debit">Débito</SelectItem>
                  <SelectItem value="bank_account">Conta bancária</SelectItem>
                  <SelectItem value="credit_card">Cartão de crédito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "credit_card" && (
              <div>
                <Label>Cartão</Label>
                <Select value={cardId} onValueChange={setCardId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                  <SelectContent>
                    {(cards ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.bank ? `(${c.bank})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cardId && (() => {
                  const card = (cards ?? []).find((c: any) => c.id === cardId);
                  if (!card) return null;
                  return (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Fecha dia {card.closing_day} · Vence dia {card.due_day}
                    </p>
                  );
                })()}
              </div>
            )}

            {(paymentMethod === "bank_account" || paymentMethod === "debit") && (
              <div>
                <Label>Conta</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {(accounts ?? []).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.name || "Conta"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Trial */}
            <div className="flex items-center justify-between p-3 bg-blue-500/5 rounded-xl border border-blue-500/20">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Período de teste gratuito</div>
                <div className="text-xs text-muted-foreground">Marque se está em trial</div>
              </div>
              <Switch checked={trialEnabled} onCheckedChange={setTrialEnabled} />
            </div>

            {trialEnabled && (
              <div className="space-y-3 pl-2 border-l-2 border-blue-500/30">
                <div>
                  <Label>Fim do período gratuito</Label>
                  <Input type="date" value={trialEndDate} onChange={(e) => setTrialEndDate(e.target.value)} />
                </div>
                <div>
                  <Label>Valor após o teste</Label>
                  <Input inputMode="decimal" value={amountAfterTrial} onChange={(e) => setAmountAfterTrial(e.target.value)} placeholder="Mesmo valor ou diferente" />
                </div>
              </div>
            )}

            {/* Auto renew */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Renovação automática</div>
                <div className="text-xs text-muted-foreground">Renova ao final do ciclo</div>
              </div>
              <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
            </div>

            {/* URL */}
            <div>
              <Label>Site ou link (opcional)</Label>
              <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>

            {/* Notes */}
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Login, plano contratado, benefícios..." className="rounded-2xl resize-none" />
            </div>

            <Button type="submit" disabled={saving} className="w-full rounded-xl gradient-coral text-white border-0 h-11 mt-4">
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar assinatura"}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
