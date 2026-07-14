import { getLocalISODate } from "@/lib/date-utils";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace, applySpaceFilter } from "@/lib/space";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { Calendar as CalIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/agenda")({
  component: AgendaPage,
});

function AgendaPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: events = [] } = useQuery({
    queryKey: ["events", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("events").select("*").order("event_date").order("event_time");
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    const ch = supabase.channel("evt-rt").on("postgres_changes",
      { event: "*", schema: "public", table: "events" },
      () => qc.invalidateQueries({ queryKey: ["events"] })
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Group by date
  const groups: Record<string, any[]> = {};
  for (const e of events as any[]) (groups[e.event_date] ??= []).push(e);

  async function handleDelete(id: string) {
    if (!confirm("Excluir evento?")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); qc.invalidateQueries(); }
  }

  return (
    <>
      <AppHeader title="Agenda" subtitle="Eventos compartilhados" />
      <div className="px-4 py-4 space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl gradient-coral text-white border-0 h-11">
              <Plus className="size-4 mr-1" /> Novo evento
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Novo evento</DialogTitle></DialogHeader>
            <EventForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>

        {Object.keys(groups).length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={CalIcon} title="Agenda vazia" description="Adicione consultas, datas especiais ou eventos." />
          </Card>
        ) : (
          Object.entries(groups).map(([date, list]) => (
            <div key={date}>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2 px-1">
                {new Date(date + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
                {list.map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-accent-purple/10 flex flex-col items-center justify-center shrink-0">
                      <CalIcon className="size-4 text-accent-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{e.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.event_time ? e.event_time.slice(0, 5) : "Dia todo"}
                        {e.recurrence !== "none" && ` · ${e.recurrence}`}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(e.id)} className="size-8 rounded-lg hover:bg-destructive/10 text-destructive flex items-center justify-center">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </Card>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function EventForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(getLocalISODate(new Date()));
  const [time, setTime] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const qc = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      couple_id: space === "shared" ? profile?.couple_id ?? null : null,
      visibility: space,
      title, event_date: date, event_time: time || null, recurrence,
    } as any);
    if (error) toast.error(error.message);
    else { toast.success("Evento criado!"); qc.invalidateQueries(); onDone(); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><Label>Título</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Data</Label><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Hora</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <div>
        <Label>Recorrência</Label>
        <Select value={recurrence} onValueChange={setRecurrence}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Única</SelectItem>
            <SelectItem value="daily">Diária</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="biweekly">Quinzenal</SelectItem>
            <SelectItem value="monthly">Mensal</SelectItem>
            <SelectItem value="yearly">Anual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
