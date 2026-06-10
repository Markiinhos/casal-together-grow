import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { formatBRL } from "@/lib/couple";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { Target, Plus, Trash2, Pause, Play, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/metas")({
  component: GoalsPage,
});

function GoalsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contribOpen, setContribOpen] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState("");

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("goals").select("*").order("created_at", { ascending: false });
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    const ch = supabase.channel("goals-rt").on("postgres_changes",
      { event: "*", schema: "public", table: "goals" },
      () => qc.invalidateQueries({ queryKey: ["goals"] })
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function del(id: string) {
    if (!confirm("Excluir meta?")) return;
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries();
  }
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("goals").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries();
  }
  async function addContribution(goalId: string) {
    const amount = parseFloat(contribAmount.replace(",", "."));
    if (!amount || !user) return;
    const goal = (goals as any[]).find((g) => g.id === goalId);
    if (!goal) return;
    await supabase.from("goal_contributions").insert({ goal_id: goalId, user_id: user.id, amount });
    await supabase.from("goals").update({ current_amount: Number(goal.current_amount) + amount }).eq("id", goalId);
    setContribOpen(null); setContribAmount(""); qc.invalidateQueries(); toast.success("Aporte registrado");
  }

  return (
    <>
      <AppHeader title="Metas" subtitle="Sonhos a dois" />
      <div className="px-4 py-4 space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl gradient-coral text-white border-0 h-11">
              <Plus className="size-4 mr-1" /> Nova meta
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Nova meta</DialogTitle></DialogHeader>
            <GoalForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>

        {goals.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Target} title="Sem metas" description="Comprar casa, viajar, casamento... vocês escolhem!" />
          </Card>
        ) : (
          (goals as any[]).map((g) => {
            const pct = g.target_amount > 0 ? Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100) : 0;
            return (
              <Card key={g.id} className="rounded-3xl p-5 shadow-card">
                <div className="flex items-start gap-3 mb-3">
                  <div className="size-12 rounded-2xl bg-accent flex items-center justify-center">
                    <Target className="size-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{g.name}</div>
                    {g.description && <div className="text-xs text-muted-foreground line-clamp-1">{g.description}</div>}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    g.status === "active" ? "bg-success/10 text-success" :
                    g.status === "paused" ? "bg-warning/10 text-warning-foreground" : "bg-muted text-muted-foreground"
                  }`}>{g.status === "active" ? "Ativa" : g.status === "paused" ? "Pausada" : "Concluída"}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold">{formatBRL(Number(g.current_amount))}</span>
                  <span className="text-muted-foreground">{formatBRL(Number(g.target_amount))}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
                  <div className="h-full gradient-coral transition-all" style={{ width: `${pct}%` }} />
                </div>
                {g.deadline && <div className="text-xs text-muted-foreground mb-3">Prazo: {new Date(g.deadline).toLocaleDateString("pt-BR")}</div>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setContribOpen(g.id)} className="flex-1 rounded-xl gradient-coral text-white border-0">+ Aporte</Button>
                  {g.status !== "completed" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(g.id, g.status === "paused" ? "active" : "paused")} className="rounded-xl">
                      {g.status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                    </Button>
                  )}
                  {g.status !== "completed" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(g.id, "completed")} className="rounded-xl">
                      <Check className="size-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => del(g.id)} className="rounded-xl text-destructive">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {contribOpen === g.id && (
                  <div className="mt-3 flex gap-2">
                    <Input inputMode="decimal" value={contribAmount} onChange={(e) => setContribAmount(e.target.value)} placeholder="Valor do aporte" />
                    <Button size="sm" onClick={() => addContribution(g.id)} className="rounded-xl gradient-coral text-white border-0">OK</Button>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}

function GoalForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("goals").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      name, description, target_amount: parseFloat(target.replace(",", ".")) || 0, deadline: deadline || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Criada!"); qc.invalidateQueries(); onDone(); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Nome</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Viagem" /></div>
      <div><Label>Valor alvo</Label><Input inputMode="decimal" required value={target} onChange={(e) => setTarget(e.target.value)} /></div>
      <div><Label>Prazo</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
      <div><Label>Descrição</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
