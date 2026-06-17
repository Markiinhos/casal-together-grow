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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { Heart, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/dates")({ component: DatesPage });

const STATUS: Record<string, { label: string; cls: string }> = {
  planned: { label: "Planejado", cls: "bg-primary/10 text-primary" },
  done: { label: "Realizado", cls: "bg-success/10 text-success" },
  canceled: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

function DatesPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: list = [] } = useQuery({
    queryKey: ["dates", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("dates").select("*").order("date_at", { ascending: false, nullsFirst: false });
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  async function setStatus(d: any, status: string) {
    await supabase.from("dates").update({ status }).eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["dates"] });
  }
  async function del(id: string) {
    if (!confirm("Excluir?")) return;
    await supabase.from("dates").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["dates"] });
  }

  return (
    <>
      <AppHeader title="Dates" subtitle="Planejador de encontros" />
      <div className="px-4 py-4 space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl gradient-coral text-white border-0 h-11"><Plus className="size-4 mr-1" /> Novo date</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Novo encontro</DialogTitle></DialogHeader>
            <DateForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>

        {list.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Heart} title="Sem dates ainda" description="Planeje seu próximo encontro." />
          </Card>
        ) : (
          list.map((d) => (
            <Card key={d.id} className="rounded-3xl p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="size-12 rounded-2xl gradient-coral flex items-center justify-center text-white"><Heart className="size-5" fill="currentColor" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm">{d.title}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span>
                  </div>
                  {d.date_at && <div className="text-xs text-muted-foreground">{new Date(d.date_at).toLocaleString("pt-BR")}</div>}
                  {d.location && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="size-3" />{d.location}</div>}
                  {d.notes && <p className="text-xs mt-1 text-muted-foreground">{d.notes}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {d.planned_amount && <span className="text-xs font-medium">{formatBRL(Number(d.planned_amount))}</span>}
                    <Select value={d.status} onValueChange={(v) => setStatus(d, v)}>
                      <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planned">Planejado</SelectItem>
                        <SelectItem value="done">Realizado</SelectItem>
                        <SelectItem value="canceled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <button onClick={() => del(d.id)} className="text-destructive"><Trash2 className="size-4" /></button>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

function DateForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [dateAt, setDateAt] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("dates").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      title, location, date_at: dateAt || null,
      planned_amount: plannedAmount ? Number(plannedAmount) : null, notes,
    });
    if (error) toast.error(error.message);
    else { toast.success("Salvo!"); qc.invalidateQueries({ queryKey: ["dates"] }); onDone(); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Título</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Jantar romântico" /></div>
      <div><Label>Local</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Data/hora</Label><Input type="datetime-local" value={dateAt} onChange={(e) => setDateAt(e.target.value)} /></div>
        <div><Label>Valor previsto</Label><Input type="number" step="0.01" value={plannedAmount} onChange={(e) => setPlannedAmount(e.target.value)} /></div>
      </div>
      <div><Label>Observações</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
