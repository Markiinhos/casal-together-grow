import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, usePartner } from "@/lib/hooks";
import { notifyPartnerMention } from "@/lib/mentions";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { Plus, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tarefas")({
  component: TasksPage,
});

function TasksPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("house_tasks").select("*").order("completed").order("due_date", { nullsFirst: false });
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    const ch = supabase.channel("tasks-rt").on("postgres_changes",
      { event: "*", schema: "public", table: "house_tasks" },
      () => qc.invalidateQueries({ queryKey: ["tasks"] })
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const today = new Date().toISOString().slice(0, 10);
  const partition = useMemo(() => {
    const pending: any[] = [], done: any[] = [], overdue: any[] = [];
    for (const t of tasks as any[]) {
      if (t.completed) done.push(t);
      else if (t.due_date && t.due_date < today) overdue.push(t);
      else pending.push(t);
    }
    return { pending, done, overdue };
  }, [tasks, today]);

  async function toggle(t: any) {
    const { error } = await supabase.from("house_tasks").update({
      completed: !t.completed,
      completed_at: !t.completed ? new Date().toISOString() : null,
      completed_by: !t.completed ? user!.id : null,
    }).eq("id", t.id);
    if (error) toast.error(error.message);
    else if (!t.completed) {
      await supabase.from("house_task_history").insert({ task_id: t.id, user_id: user!.id });
      qc.invalidateQueries();
    } else qc.invalidateQueries();
  }
  async function del(id: string) {
    if (!confirm("Excluir tarefa?")) return;
    const { error } = await supabase.from("house_tasks").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries();
  }

  return (
    <>
      <AppHeader title="Responsabilidades" subtitle="Tarefas da casa" />
      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Pendentes" value={partition.pending.length} color="text-primary" />
          <StatCard label="Atrasadas" value={partition.overdue.length} color="text-destructive" />
          <StatCard label="Concluídas" value={partition.done.length} color="text-success" />
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl gradient-coral text-white border-0 h-11">
              <Plus className="size-4 mr-1" /> Nova tarefa
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
            <TaskFormDialog onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="pending">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
            <TabsTrigger value="done">Concluídas</TabsTrigger>
          </TabsList>
          {(["pending", "overdue", "done"] as const).map((k) => (
            <TabsContent key={k} value={k} className="mt-4">
              <TaskList list={partition[k]} onToggle={toggle} onDelete={del} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="rounded-2xl p-3 shadow-card text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase font-medium">{label}</div>
    </Card>
  );
}

function TaskList({ list, onToggle, onDelete }: { list: any[]; onToggle: (t: any) => void; onDelete: (id: string) => void }) {
  if (list.length === 0) return (
    <Card className="rounded-2xl p-4 shadow-card">
      <EmptyState icon={ListChecks} title="Nenhuma tarefa aqui" />
    </Card>
  );
  return (
    <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
      {list.map((t) => (
        <div key={t.id} className="px-4 py-3 flex items-center gap-3">
          <Checkbox checked={t.completed} onCheckedChange={() => onToggle(t)} className="rounded-md" />
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>{t.name}</div>
            <div className="text-xs text-muted-foreground">
              {t.due_date && `${new Date(t.due_date).toLocaleDateString("pt-BR")} · `}
              {t.responsible === "me" ? "Eu" : t.responsible === "partner" ? "Parceiro" : "Ambos"}
            </div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            t.priority === "high" ? "bg-destructive/10 text-destructive" :
            t.priority === "medium" ? "bg-warning/10 text-warning-foreground" : "bg-muted text-muted-foreground"
          }`}>{t.priority === "high" ? "Alta" : t.priority === "medium" ? "Média" : "Baixa"}</span>
          <button onClick={() => onDelete(t.id)} className="size-8 rounded-lg hover:bg-destructive/10 text-destructive flex items-center justify-center">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </Card>
  );
}

function TaskFormDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("both");
  const [priority, setPriority] = useState("medium");
  const [frequency, setFrequency] = useState("once");
  const [dueDate, setDueDate] = useState("");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { data, error } = await supabase.from("house_tasks").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      name, description, responsible, priority, frequency, due_date: dueDate || null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await notifyPartnerMention({
      text: `${name} ${description ?? ""}`,
      partnerId: partner?.id ?? null,
      fromName: profile?.full_name ?? null,
      context: "uma tarefa",
      link: "/app/tarefas",
    });
    toast.success("Criada!"); qc.invalidateQueries(); onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Nome</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Lavar louça — @parceiro" /></div>
      <div><Label>Descrição</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Use @parceiro para notificar" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Responsável</Label>
          <Select value={responsible} onValueChange={setResponsible}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Eu</SelectItem>
              <SelectItem value="partner">Parceiro(a)</SelectItem>
              <SelectItem value="both">Ambos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Prioridade</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Frequência</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Única</SelectItem>
              <SelectItem value="daily">Diária</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="biweekly">Quinzenal</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="custom">Personalizada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Data limite</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
