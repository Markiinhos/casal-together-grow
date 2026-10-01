import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, useCouple, usePartner } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { SpaceToggle } from "@/components/SpaceToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getLocalISODate } from "@/lib/date-utils";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AppHeader } from "@/components/AppHeader";
import { Sparkles, Wallet, Calendar, Target, ListChecks, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { CategoryIcon } from "@/lib/category-icons";


export const Route = createFileRoute("/app/adicionar")({
  component: AddPage,
});

type Mode = "ai" | "expense" | "income" | "task" | "event" | "goal";

function AddPage() {
  const [mode, setMode] = useState<Mode>("ai");
  return (
    <>
      <AppHeader title="Adicionar" subtitle="Registre algo novo" />
      <div className="px-4 py-4 space-y-4">
        <div className="flex justify-center"><SpaceToggle /></div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "ai", label: "IA", icon: Sparkles },
            { k: "expense", label: "Despesa", icon: Wallet },
            { k: "income", label: "Receita", icon: Wallet },
            { k: "task", label: "Tarefa", icon: ListChecks },
            { k: "event", label: "Evento", icon: Calendar },
            { k: "goal", label: "Meta", icon: Target },
          ].map((it) => {
            const active = mode === it.k;
            return (
              <button
                key={it.k}
                onClick={() => setMode(it.k as Mode)}
                className={`rounded-2xl p-3 flex flex-col items-center gap-1.5 border transition-all ${
                  active ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"
                }`}
              >
                <it.icon className="size-5" />
                <span className="text-xs font-medium">{it.label}</span>
              </button>
            );
          })}
        </div>

        {mode === "expense" && (
          <div className="space-y-2">
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-center justify-between gap-2">
              <div className="text-xs">
                <p className="font-semibold text-amber-700 dark:text-amber-400">Tem um cupom, recibo ou boleto?</p>
                <p className="text-muted-foreground">Fotografe ou envie o PDF para preencher com IA.</p>
              </div>
              <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                <Link to="/app/financas/recibos">
                  <Receipt className="size-4 mr-1.5" />
                  Escanear
                </Link>
              </Button>
            </div>

            <div className="rounded-2xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between gap-2">
              <div className="text-xs">
                <p className="font-semibold">Não sabe se cabe no orçamento?</p>
                <p className="text-muted-foreground">Simule antes de adicionar como despesa.</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/financas/simular" search={(prev: any) => prev}><Sparkles className="size-4 mr-1" />Simular</Link>
              </Button>
            </div>
          </div>
        )}
        {mode === "ai" && <AIForm />}
        {mode === "expense" && <TxForm type="expense" />}
        {mode === "income" && <TxForm type="income" />}
        {mode === "task" && <TaskForm />}
        {mode === "event" && <EventForm />}
        {mode === "goal" && <GoalForm />}
      </div>
    </>
  );
}

function AIForm() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<any | null>(null);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  async function callFn(autoCommit: boolean) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quick-parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text, autoCommit }),
    });
    return res;
  }

  async function handleParse() {
    if (!text.trim()) return;
    setLoading(true);
    setParsed(null);
    try {
      const res = await callFn(false);
      if (res.status === 429) { toast.error("Muitas requisições. Tente novamente em instantes."); return; }
      if (res.status === 402) { toast.error("Créditos de IA esgotados."); return; }
      if (!res.ok) { toast.error("Não foi possível interpretar"); return; }
      const json = await res.json();
      if (!json.parsed) { toast.error("Não entendi. Reescreva com mais detalhes."); return; }
      setParsed(json.parsed);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!parsed || !user) return;
    setLoading(true);
    try {
      const res = await callFn(true);
      if (!res.ok) { toast.error("Não foi possível registrar"); return; }
      const json = await res.json();
      if (json.warning === "no_couple") { toast.error("Vincule seu casal antes de registrar."); return; }
      if (!json.created) { toast.error("Falha ao registrar"); return; }
      const label = parsed.type === "task" ? "Tarefa criada!" : parsed.type === "event" ? "Evento criado!" : "Registrado!";
      toast.success(label);
      await supabase.from("whatsapp_records").insert({
        user_id: user.id, couple_id: profile?.couple_id ?? null,
        raw_text: text, parsed, status: "confirmed",
      });
      qc.invalidateQueries();
      setText(""); setParsed(null);
    } finally {
      setLoading(false);
    }
  }


  return (
    <Card className="rounded-3xl p-5 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <div className="size-8 rounded-xl gradient-coral flex items-center justify-center">
          <Sparkles className="size-4 text-white" />
        </div>
        <div>
          <div className="font-semibold text-sm">Entrada rápida com IA</div>
          <div className="text-xs text-muted-foreground">Ex: "Gastei 50 no mercado"</div>
        </div>
      </div>
      <Textarea
        placeholder='Digite o que aconteceu... "Recebi 1500", "Uber 25", "Reunião amanhã 14h", "Comprar pão"'
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="rounded-2xl resize-none"
      />
      {!parsed ? (
        <Button onClick={handleParse} disabled={loading || !text.trim()} className="w-full rounded-xl gradient-coral text-white border-0 h-11">
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Interpretar"}
        </Button>
      ) : (
        <div className="rounded-2xl bg-accent p-3 space-y-2 text-sm">
          <div className="font-medium">Confirmar:</div>
          <div className="space-y-1 text-xs">
            <div><span className="text-muted-foreground">Tipo:</span> {parsed.type}</div>
            {parsed.title && <div><span className="text-muted-foreground">Título:</span> {parsed.title}</div>}
            {parsed.amount != null && <div><span className="text-muted-foreground">Valor:</span> R$ {parsed.amount}</div>}
            {parsed.category_hint && <div><span className="text-muted-foreground">Categoria:</span> {parsed.category_hint}</div>}
            {parsed.date && <div><span className="text-muted-foreground">Data:</span> {parsed.date}{parsed.time ? ` ${parsed.time}` : ""}</div>}
            {parsed.priority && <div><span className="text-muted-foreground">Prioridade:</span> {parsed.priority}</div>}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConfirm} className="flex-1 rounded-xl gradient-coral text-white border-0">Confirmar</Button>
            <Button variant="outline" onClick={() => setParsed(null)} className="rounded-xl">Editar</Button>
          </div>
        </div>
      )}
      <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Tem foto de cupom, recibo ou boleto?</span>
        <Button asChild size="sm" variant="ghost" className="gap-1.5 h-8 text-xs text-primary font-medium hover:text-primary">
          <Link to="/app/financas/recibos">
            <Receipt className="size-3.5" />
            <span>Usar Leitor de Recibos</span>
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function TxForm({ type }: { type: "income" | "expense" }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState(getLocalISODate());
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: categories } = useQuery({
    queryKey: ["categories", profile?.couple_id, user?.id, type],
    queryFn: async () => {
      const q = supabase
        .from("categories")
        .select("*")
        .in("type", [type, "other"])
        .eq("is_archived", false)
        .order("sort_order")
        .order("name");
      const { data } = profile?.couple_id ? await q.eq("couple_id", profile.couple_id) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  /** Categorias pai com suas subcategorias aninhadas, na ordem definida em /app/categorias. */
  const grouped = useMemo(() => {
    const all = (categories ?? []) as any[];
    const parents = all.filter((c) => !c.parent_id);
    return parents.map((p) => ({
      ...p,
      subs: all.filter((s) => s.parent_id === p.id),
    }));
  }, [categories]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      couple_id: space === "shared" ? profile?.couple_id ?? null : null,
      visibility: space,
      type,
      amount: parseFloat(amount.replace(",", ".")),
      description,
      date,
      category_id: categoryId || null,
    } as any);
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Registrado!");
      qc.invalidateQueries();
      navigate({ to: "/app/financas" });
    }
  }

  return (
    <Card className="rounded-3xl p-5 shadow-card">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Valor</Label>
          <Input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <Label>Descrição</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Mercado" />
        </div>
        <div>
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
            <SelectContent>
              {grouped.map((c: any) => [
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <CategoryIcon icon={c.icon} color={c.color} size={22} />
                    {c.name}
                  </span>
                </SelectItem>,
                ...c.subs.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2 pl-4">
                      <CategoryIcon icon={s.icon ?? c.icon} color={s.color || c.color} size={20} />
                      <span className="text-muted-foreground">{c.name} ·</span> {s.name}
                    </span>
                  </SelectItem>
                )),
              ])}
            </SelectContent>
          </Select>
          <Link to="/app/categorias" className="text-xs text-primary mt-1 inline-block">+ Gerenciar categorias</Link>
        </div>

        <div>
          <Label>Data</Label>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button type="submit" disabled={loading} className="w-full rounded-xl gradient-coral text-white border-0 h-11">
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </Card>
  );
}

function TaskForm() {
  const [name, setName] = useState("");
  const [responsible, setResponsible] = useState("both");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("house_tasks").insert({
      user_id: user.id,
      couple_id: space === "shared" ? profile?.couple_id ?? null : null,
      visibility: space,
      name, responsible, priority, due_date: dueDate || null,
    } as any);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Tarefa criada!"); qc.invalidateQueries(); navigate({ to: "/app/tarefas" }); }
  }

  return (
    <Card className="rounded-3xl p-5 shadow-card">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div><Label>Nome</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <Label>Responsável</Label>
          <Select value={responsible} onValueChange={setResponsible}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Eu</SelectItem>
              <SelectItem value="partner">Parceiro(a)</SelectItem>
              <SelectItem value="both">Ambos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Data limite (opcional)</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        <Button type="submit" disabled={loading} className="w-full rounded-xl gradient-coral text-white border-0 h-11">
          {loading ? "Salvando..." : "Criar tarefa"}
        </Button>
      </form>
    </Card>
  );
}

function EventForm() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(getLocalISODate());
  const [time, setTime] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      couple_id: space === "shared" ? profile?.couple_id ?? null : null,
      visibility: space,
      title, event_date: date, event_time: time || null, recurrence,
    } as any);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Evento criado!"); qc.invalidateQueries(); navigate({ to: "/app/agenda" }); }
  }

  return (
    <Card className="rounded-3xl p-5 shadow-card">
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
        <Button type="submit" disabled={loading} className="w-full rounded-xl gradient-coral text-white border-0 h-11">
          {loading ? "Salvando..." : "Criar evento"}
        </Button>
      </form>
    </Card>
  );
}

function GoalForm() {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("goals").insert({
      user_id: user.id,
      couple_id: space === "shared" ? profile?.couple_id ?? null : null,
      visibility: space,
      name, description, target_amount: parseFloat(target.replace(",", ".")) || 0, deadline: deadline || null,
    } as any);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Meta criada!"); qc.invalidateQueries(); navigate({ to: "/app/metas" }); }
  }

  return (
    <Card className="rounded-3xl p-5 shadow-card">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div><Label>Nome da meta</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Viagem para Europa" /></div>
        <div><Label>Valor alvo</Label><Input inputMode="decimal" required value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" /></div>
        <div><Label>Prazo</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
        <div><Label>Descrição</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <Button type="submit" disabled={loading} className="w-full rounded-xl gradient-coral text-white border-0 h-11">
          {loading ? "Salvando..." : "Criar meta"}
        </Button>
      </form>
    </Card>
  );
}
