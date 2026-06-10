import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft, Plus, Trash2, Trophy, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/desafios")({
  component: DesafiosPage,
});

function DesafiosPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: list = [] } = useQuery({
    queryKey: ["challenges", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("challenges").select("*").order("created_at", { ascending: false });
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  async function setStatus(id: string, status: string) {
    await supabase.from("challenges").update({ status }).eq("id", id);
    qc.invalidateQueries();
  }
  async function del(id: string) {
    if (!confirm("Excluir desafio?")) return;
    await supabase.from("challenges").delete().eq("id", id);
    qc.invalidateQueries();
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/app/mais" className="size-9 rounded-full hover:bg-accent flex items-center justify-center">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="font-bold">Desafios</h1>
        </div>
      </header>
      <div className="px-4 py-4 space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl gradient-coral text-white border-0 h-11">
              <Plus className="size-4 mr-1" /> Novo desafio
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Novo desafio</DialogTitle></DialogHeader>
            <ChallengeForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>

        {list.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Trophy} title="Sem desafios" description="Crie um desafio: sem delivery, economizar X, etc." />
          </Card>
        ) : (
          (list as any[]).map((c) => (
            <Card key={c.id} className="rounded-3xl p-4 shadow-card">
              <div className="flex items-start gap-3 mb-2">
                <div className="size-10 rounded-xl bg-accent-purple/10 flex items-center justify-center"><Trophy className="size-5 text-accent-purple" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{c.name}</div>
                  {c.objective && <div className="text-xs text-muted-foreground">{c.objective}</div>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  c.status === "active" ? "bg-success/10 text-success" :
                  c.status === "completed" ? "bg-primary/10 text-primary" :
                  c.status === "paused" ? "bg-warning/10 text-warning-foreground" : "bg-destructive/10 text-destructive"
                }`}>{c.status}</span>
              </div>
              {c.reward && <div className="text-xs text-muted-foreground mb-2">🎁 {c.reward}</div>}
              <div className="flex gap-2">
                {c.status !== "completed" && (
                  <Button size="sm" onClick={() => setStatus(c.id, "completed")} className="flex-1 rounded-xl gradient-coral text-white border-0">
                    <Check className="size-3.5 mr-1" /> Concluir
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => del(c.id)} className="rounded-xl text-destructive"><Trash2 className="size-4" /></Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

function ChallengeForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [reward, setReward] = useState("");
  const [endDate, setEndDate] = useState("");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("challenges").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      name, objective, reward, end_date: endDate || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Criado!"); qc.invalidateQueries(); onDone(); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Nome</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Sem delivery" /></div>
      <div><Label>Objetivo</Label><Textarea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} /></div>
      <div><Label>Recompensa</Label><Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Ex: Jantar fora" /></div>
      <div><Label>Data fim</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
