import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { EmptyState } from "@/components/EmptyState";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/cartoes")({ component: CardsPage });

const COLORS = ["#7B61FF", "#FF6B57", "#34D399", "#FBBF24", "#60A5FA", "#F472B6", "#0F172A"];

function CardsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("credit_cards").select("*").order("created_at");
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const ids = cards.map((c) => c.id);
  const { data: usage = {} } = useQuery({
    queryKey: ["cards-usage", ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const { data } = await supabase
        .from("installments")
        .select("amount, paid, transaction_id, transactions!inner(credit_card_id)")
        .eq("paid", false);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        const cid = r.transactions?.credit_card_id;
        if (cid) map[cid] = (map[cid] ?? 0) + Number(r.amount);
      });
      return map;
    },
    enabled: ids.length > 0,
  });

  async function del(id: string) {
    if (!confirm("Excluir cartão?")) return;
    await supabase.from("credit_cards").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["cards"] });
  }

  function ownerName(uid: string) {
    if (uid === user?.id) return profile?.full_name?.split(" ")[0] ?? "Você";
    if (uid === partner?.id) return partner?.full_name?.split(" ")[0] ?? "Parceiro";
    return "—";
  }

  return (
    <>
      <AppHeader title="Cartões" subtitle="Limites, faturas e parcelas" />
      <div className="px-4 py-4 space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl gradient-coral text-white border-0 h-11">
              <Plus className="size-4 mr-1" /> Novo cartão
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Novo cartão</DialogTitle></DialogHeader>
            <CardForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>

        {cards.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={CreditCard} title="Sem cartões" description="Cadastre seus cartões para acompanhar faturas e parcelas." />
          </Card>
        ) : (
          cards.map((c) => {
            const used = usage[c.id] ?? 0;
            const limit = Number(c.limit_amount) || 0;
            const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
            return (
              <Card key={c.id} className="rounded-3xl p-5 text-white border-0 shadow-soft" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs opacity-80">{c.bank || "Cartão"}</div>
                    <div className="font-bold text-lg">{c.name}</div>
                    <div className="text-[11px] opacity-80 mt-0.5">{ownerName(c.user_id)} · Fecha dia {c.closing_day} · Vence dia {c.due_day}</div>
                  </div>
                  <button onClick={() => del(c.id)} className="opacity-70 hover:opacity-100"><Trash2 className="size-4" /></button>
                </div>
                <div className="mt-4">
                  <div className="text-[11px] opacity-80">Comprometido</div>
                  <div className="text-2xl font-bold">{formatBRL(used)} <span className="text-xs font-normal opacity-80">/ {formatBRL(limit)}</span></div>
                  <div className="h-1.5 rounded-full bg-white/25 overflow-hidden mt-2">
                    <div className="h-full bg-white" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Card>
            );
          })
        )}

        <SyncedCardsList />
        <InstallmentsList />
      </div>
    </>
  );
}

function SyncedCardsList() {
  const { data: rows = [] } = useQuery({
    queryKey: ["synced-cards"],
    queryFn: async () => {
      const { data } = await supabase.from("synced_cards").select("*").order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });
  if (rows.length === 0) return null;
  return (
    <Card className="rounded-3xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border font-semibold text-sm flex items-center gap-2">
        <CreditCard className="size-4 text-primary" /> Cartões sincronizados (Open Finance)
      </div>
      <div className="divide-y divide-border">
        {rows.map((c) => {
          const used = Math.max(0, Number(c.limit_amount || 0) - Number(c.available_limit || 0));
          const pct = c.limit_amount ? Math.min(100, (used / Number(c.limit_amount)) * 100) : 0;
          return (
            <div key={c.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{c.card_name || "Cartão"} {c.card_brand && <span className="text-xs text-muted-foreground">· {c.card_brand}</span>}</div>
                <div className="text-xs text-muted-foreground">Vence dia {c.due_day ?? "—"}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatBRL(used)} usado de {formatBRL(Number(c.limit_amount || 0))}
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
                <div className="h-full gradient-coral" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}



function InstallmentsList() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { data: rows = [] } = useQuery({
    queryKey: ["installments", coupleId, user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const q = supabase.from("installments").select("*").eq("paid", false).gte("due_date", today).order("due_date").limit(20);
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
  if (rows.length === 0) return null;
  return (
    <Card className="rounded-3xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border font-semibold text-sm">Próximas parcelas</div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Parcela {r.installment_number}/{r.total_installments}</div>
              <div className="text-xs text-muted-foreground">Vence {new Date(r.due_date).toLocaleDateString("pt-BR")}</div>
            </div>
            <div className="text-sm font-semibold">{formatBRL(Number(r.amount))}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CardForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [limitAmount, setLimitAmount] = useState("");
  const [closingDay, setClosingDay] = useState("1");
  const [dueDay, setDueDay] = useState("10");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("credit_cards").insert({
      user_id: user.id,
      couple_id: profile?.couple_id ?? null,
      name, bank, color,
      limit_amount: Number(limitAmount) || 0,
      closing_day: Math.min(31, Math.max(1, Number(closingDay) || 1)),
      due_day: Math.min(31, Math.max(1, Number(dueDay) || 10)),
    });
    if (error) toast.error(error.message);
    else { toast.success("Cartão criado!"); qc.invalidateQueries({ queryKey: ["cards"] }); onDone(); }
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
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
