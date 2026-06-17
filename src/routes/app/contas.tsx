import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { formatBRL } from "@/lib/couple";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { Calendar, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/contas")({ component: BillsPage });

function BillsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: bills = [] } = useQuery({
    queryKey: ["bills", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("future_bills").select("*").order("due_date");
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  async function toggle(b: any) {
    await supabase.from("future_bills").update({ paid: !b.paid }).eq("id", b.id);
    qc.invalidateQueries({ queryKey: ["bills"] });
  }
  async function del(id: string) {
    if (!confirm("Excluir?")) return;
    await supabase.from("future_bills").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["bills"] });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soon = bills.filter((b) => !b.paid && (new Date(b.due_date).getTime() - today.getTime()) <= 7 * 86400000);

  return (
    <>
      <AppHeader title="Contas futuras" subtitle="Recorrentes e próximas" />
      <div className="px-4 py-4 space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl gradient-coral text-white border-0 h-11"><Plus className="size-4 mr-1" /> Nova conta</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
            <BillForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>

        {soon.length > 0 && (
          <Card className="rounded-2xl p-3 bg-warning/10 border border-warning/30 flex items-start gap-2">
            <AlertTriangle className="size-4 text-warning-foreground shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold">{soon.length} conta(s) vencendo em até 7 dias</div>
              <div className="text-muted-foreground">Total: {formatBRL(soon.reduce((s, b) => s + Number(b.amount), 0))}</div>
            </div>
          </Card>
        )}

        {bills.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Calendar} title="Sem contas" description="Cadastre contas fixas para receber alertas." />
          </Card>
        ) : (
          <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
            {bills.map((b) => (
              <div key={b.id} className="px-4 py-3 flex items-center gap-3">
                <input type="checkbox" checked={b.paid} onChange={() => toggle(b)} className="size-5 accent-primary" />
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm truncate ${b.paid ? "line-through text-muted-foreground" : ""}`}>{b.title}</div>
                  <div className="text-xs text-muted-foreground">{new Date(b.due_date).toLocaleDateString("pt-BR")} · {b.recurrence}</div>
                </div>
                <div className="text-sm font-semibold">{formatBRL(Number(b.amount))}</div>
                <button onClick={() => del(b.id)} className="text-destructive"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

function BillForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("monthly");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("future_bills").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      title, amount: Number(amount) || 0, due_date: dueDate, recurrence,
    });
    if (error) toast.error(error.message);
    else { toast.success("Salvo!"); qc.invalidateQueries({ queryKey: ["bills"] }); onDone(); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Título</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Aluguel" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Valor</Label><Input required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Vencimento</Label><Input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <div>
        <Label>Recorrência</Label>
        <Select value={recurrence} onValueChange={setRecurrence}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="once">Única</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="monthly">Mensal</SelectItem>
            <SelectItem value="yearly">Anual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
