import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Plus, Sun, CloudSun, Moon, Flame, Target, CheckCircle2, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/rotina")({ component: RotinaPage });

const PERIODS = [
  { value: "morning", label: "Manhã", icon: Sun, color: "text-warning-foreground bg-warning/10" },
  { value: "afternoon", label: "Tarde", icon: CloudSun, color: "text-primary bg-primary/10" },
  { value: "evening", label: "Noite", icon: Moon, color: "text-accent-purple bg-accent-purple/10" },
] as const;

function today() { return new Date().toISOString().slice(0, 10); }
function startOfWeek(d = new Date()) {
  const x = new Date(d); const day = x.getDay();
  x.setDate(x.getDate() - day); x.setHours(0,0,0,0);
  return x.toISOString().slice(0, 10);
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function RotinaPage() {
  return (
    <>
      <AppHeader title="Rotina" subtitle="Hábitos, rotinas e metas do casal" />
      <div className="px-4 py-4">
        <Tabs defaultValue="hoje">
          <TabsList className="grid grid-cols-4 w-full rounded-2xl">
            <TabsTrigger value="hoje" className="rounded-xl">Hoje</TabsTrigger>
            <TabsTrigger value="habitos" className="rounded-xl">Hábitos</TabsTrigger>
            <TabsTrigger value="rotinas" className="rounded-xl">Rotinas</TabsTrigger>
            <TabsTrigger value="metas" className="rounded-xl">Metas</TabsTrigger>
          </TabsList>
          <TabsContent value="hoje" className="mt-4 space-y-4"><TodayTab /></TabsContent>
          <TabsContent value="habitos" className="mt-4 space-y-4"><HabitsTab /></TabsContent>
          <TabsContent value="rotinas" className="mt-4 space-y-4"><RoutinesTab /></TabsContent>
          <TabsContent value="metas" className="mt-4 space-y-4"><GoalsTab /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// ---------- HOJE ----------
function TodayTab() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  const { data: habits = [] } = useQuery({
    queryKey: ["habits", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("habits").select("*").eq("active", true);
      const { data } = coupleId
        ? await q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`)
        : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: todayLogs = [] } = useQuery({
    queryKey: ["habit-logs-today", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("habit_logs").select("habit_id").eq("user_id", user!.id).eq("date", today());
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: streak = 0 } = useQuery({
    queryKey: ["habit-streak", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("habit_logs").select("date").eq("user_id", user!.id).order("date", { ascending: false }).limit(60);
      const set = new Set((data ?? []).map((l: any) => l.date));
      let s = 0; const d = new Date();
      while (set.has(d.toISOString().slice(0,10))) { s++; d.setDate(d.getDate() - 1); }
      return s;
    },
    enabled: !!user,
  });

  const logged = new Set(todayLogs.map((l: any) => l.habit_id));
  const completion = habits.length ? Math.round((logged.size / habits.length) * 100) : 0;

  const toggleHabit = useMutation({
    mutationFn: async (h: any) => {
      if (logged.has(h.id)) {
        await supabase.from("habit_logs").delete().eq("habit_id", h.id).eq("user_id", user!.id).eq("date", today());
      } else {
        await supabase.from("habit_logs").insert({ habit_id: h.id, user_id: user!.id, couple_id: h.couple_id, date: today() });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["habit-logs-today"] }); qc.invalidateQueries({ queryKey: ["habit-streak"] }); },
  });

  const byPeriod = (p: string) => habits.filter((h: any) => h.period === p);
  const anytime = habits.filter((h: any) => h.period === "anytime" || !h.period);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 rounded-2xl text-center">
          <Flame className="size-5 mx-auto text-warning-foreground" />
          <div className="text-2xl font-bold mt-1">{streak}</div>
          <div className="text-[11px] text-muted-foreground">dias seguidos</div>
        </Card>
        <Card className="p-3 rounded-2xl text-center">
          <CheckCircle2 className="size-5 mx-auto text-success" />
          <div className="text-2xl font-bold mt-1">{logged.size}/{habits.length}</div>
          <div className="text-[11px] text-muted-foreground">hábitos hoje</div>
        </Card>
        <Card className="p-3 rounded-2xl text-center">
          <Sparkles className="size-5 mx-auto text-primary" />
          <div className="text-2xl font-bold mt-1">{completion}%</div>
          <div className="text-[11px] text-muted-foreground">produtividade</div>
        </Card>
      </div>

      {habits.length === 0 ? (
        <EmptyState title="Sem hábitos" description="Crie hábitos na aba Hábitos para acompanhá-los aqui." />
      ) : (
        <>
          {PERIODS.map(p => {
            const list = byPeriod(p.value);
            if (!list.length) return null;
            return (
              <Card key={p.value} className="rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`size-8 rounded-lg flex items-center justify-center ${p.color}`}><p.icon className="size-4"/></div>
                  <div className="font-semibold text-sm">{p.label}</div>
                </div>
                <div className="space-y-1">
                  {list.map((h: any) => (
                    <button key={h.id} onClick={() => toggleHabit.mutate(h)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-accent text-left">
                      <Checkbox checked={logged.has(h.id)} />
                      <span className={`flex-1 text-sm ${logged.has(h.id) ? "line-through text-muted-foreground" : ""}`}>{h.icon} {h.name}</span>
                      {h.scope === "couple" && <Badge variant="secondary" className="text-[10px]">Casal</Badge>}
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
          {anytime.length > 0 && (
            <Card className="rounded-2xl p-3">
              <div className="font-semibold text-sm mb-2">A qualquer hora</div>
              <div className="space-y-1">
                {anytime.map((h: any) => (
                  <button key={h.id} onClick={() => toggleHabit.mutate(h)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-accent text-left">
                    <Checkbox checked={logged.has(h.id)} />
                    <span className={`flex-1 text-sm ${logged.has(h.id) ? "line-through text-muted-foreground" : ""}`}>{h.icon} {h.name}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

// ---------- HÁBITOS ----------
function HabitsTab() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "✨", period: "morning", scope: "individual", target_per_week: 7 });

  const { data: habits = [] } = useQuery({
    queryKey: ["habits-all", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("habits").select("*").order("created_at", { ascending: false });
      const { data } = coupleId
        ? await q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`)
        : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("habits").insert({
        ...form, user_id: user!.id,
        couple_id: form.scope === "couple" ? coupleId : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Hábito criado"); setOpen(false); setForm({ name:"", icon:"✨", period:"morning", scope:"individual", target_per_week:7 }); qc.invalidateQueries({ queryKey: ["habits"] }); qc.invalidateQueries({ queryKey: ["habits-all"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("habits").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["habits-all"] }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full rounded-2xl"><Plus className="size-4 mr-1"/>Novo hábito</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo hábito</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input className="w-16" value={form.icon} onChange={e=>setForm({...form, icon:e.target.value})} placeholder="✨"/>
              <Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Ex: Beber 2L de água"/>
            </div>
            <Select value={form.period} onValueChange={v=>setForm({...form, period:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Manhã</SelectItem>
                <SelectItem value="afternoon">Tarde</SelectItem>
                <SelectItem value="evening">Noite</SelectItem>
                <SelectItem value="anytime">Qualquer hora</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.scope} onValueChange={v=>setForm({...form, scope:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="couple" disabled={!coupleId}>Casal</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <label className="text-xs text-muted-foreground">Meta semanal</label>
              <Input type="number" min={1} max={7} value={form.target_per_week} onChange={e=>setForm({...form, target_per_week:Number(e.target.value)})}/>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={()=>create.mutate()} disabled={!form.name || create.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {habits.length === 0 ? (
        <EmptyState title="Nenhum hábito" description="Comece criando o primeiro hábito."/>
      ) : (
        <div className="space-y-2">
          {habits.map((h: any) => (
            <Card key={h.id} className="p-3 rounded-2xl flex items-center gap-3">
              <div className="text-2xl">{h.icon || "✨"}</div>
              <div className="flex-1">
                <div className="font-medium text-sm">{h.name}</div>
                <div className="text-xs text-muted-foreground">{PERIODS.find(p=>p.value===h.period)?.label || "Qualquer hora"} · {h.target_per_week}x/semana · {h.scope==="couple"?"Casal":"Individual"}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={()=>del.mutate(h.id)}><Trash2 className="size-4 text-destructive"/></Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- ROTINAS ----------
function RoutinesTab() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", period: "morning", scope: "individual" });

  const { data: routines = [] } = useQuery({
    queryKey: ["routines", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("routines").select("*, routine_items(*)").eq("active", true).order("period");
      const { data } = coupleId
        ? await q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`)
        : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: completions = [] } = useQuery({
    queryKey: ["routine-completions", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("routine_completions").select("routine_item_id").eq("user_id", user!.id).eq("date", today());
      return data ?? [];
    },
    enabled: !!user,
  });

  const doneSet = new Set(completions.map((c: any) => c.routine_item_id));

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("routines").insert({
        title: form.title, period: form.period,
        user_id: user!.id, couple_id: form.scope === "couple" ? coupleId : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rotina criada"); setOpen(false); setForm({title:"", period:"morning", scope:"individual"}); qc.invalidateQueries({ queryKey: ["routines"] }); },
  });

  const addItem = useMutation({
    mutationFn: async ({ routine_id, label }: any) => {
      await supabase.from("routine_items").insert({ routine_id, label });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });

  const toggleItem = useMutation({
    mutationFn: async (item: any) => {
      if (doneSet.has(item.id)) {
        await supabase.from("routine_completions").delete().eq("routine_item_id", item.id).eq("user_id", user!.id).eq("date", today());
      } else {
        await supabase.from("routine_completions").insert({ routine_item_id: item.id, user_id: user!.id, couple_id: coupleId, date: today() });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routine-completions"] }),
  });

  const delRoutine = useMutation({
    mutationFn: async (id: string) => { await supabase.from("routines").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="w-full rounded-2xl"><Plus className="size-4 mr-1"/>Nova rotina</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova rotina</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} placeholder="Ex: Rotina da manhã"/>
            <Select value={form.period} onValueChange={v=>setForm({...form, period:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Manhã</SelectItem>
                <SelectItem value="afternoon">Tarde</SelectItem>
                <SelectItem value="evening">Noite</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.scope} onValueChange={v=>setForm({...form, scope:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="couple" disabled={!coupleId}>Casal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button onClick={()=>create.mutate()} disabled={!form.title}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {routines.length === 0 ? (
        <EmptyState title="Sem rotinas" description="Crie rotinas de manhã, tarde e noite com checklists."/>
      ) : routines.map((r: any) => {
        const p = PERIODS.find(x=>x.value===r.period);
        return (
          <Card key={r.id} className="rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-2">
              {p && <div className={`size-8 rounded-lg flex items-center justify-center ${p.color}`}><p.icon className="size-4"/></div>}
              <div className="flex-1">
                <div className="font-semibold text-sm">{r.title}</div>
                <div className="text-xs text-muted-foreground">{p?.label} {r.scope==="couple"&&" · Casal"}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={()=>delRoutine.mutate(r.id)}><Trash2 className="size-4 text-destructive"/></Button>
            </div>
            <div className="space-y-1">
              {(r.routine_items ?? []).sort((a:any,b:any)=>a.position-b.position).map((it: any) => (
                <button key={it.id} onClick={()=>toggleItem.mutate(it)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-accent text-left">
                  <Checkbox checked={doneSet.has(it.id)}/>
                  <span className={`flex-1 text-sm ${doneSet.has(it.id) ? "line-through text-muted-foreground":""}`}>{it.label}</span>
                </button>
              ))}
              <AddItemRow onAdd={(label) => addItem.mutate({ routine_id: r.id, label })}/>
            </div>
          </Card>
        );
      })}
    </>
  );
}

function AddItemRow({ onAdd }: { onAdd: (label: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e)=>{e.preventDefault(); if(v.trim()){onAdd(v.trim()); setV("");}}} className="flex gap-2 mt-2">
      <Input className="h-9" placeholder="+ adicionar item" value={v} onChange={e=>setV(e.target.value)}/>
      <Button type="submit" size="sm" variant="secondary">Add</Button>
    </form>
  );
}

// ---------- METAS ----------
function GoalsTab() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title:"", description:"", period_type:"week", scope:"individual", priority:"medium" });

  const weekStart = useMemo(() => startOfWeek(), []);
  const monthStart = useMemo(() => startOfMonth(), []);

  const { data: goals = [] } = useQuery({
    queryKey: ["period-goals", coupleId, user?.id, weekStart, monthStart],
    queryFn: async () => {
      const q = supabase.from("period_goals").select("*")
        .or(`period_start.eq.${weekStart},period_start.eq.${monthStart}`)
        .order("priority", { ascending: false });
      const { data } = coupleId
        ? await q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`)
        : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("period_goals").insert({
        title: form.title, description: form.description, priority: form.priority,
        period_type: form.period_type, period_start: form.period_type==="week"?weekStart:monthStart,
        scope: form.scope, user_id: user!.id, couple_id: form.scope==="couple"?coupleId:null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Meta criada"); setOpen(false); setForm({title:"", description:"", period_type:"week", scope:"individual", priority:"medium"}); qc.invalidateQueries({ queryKey: ["period-goals"] }); },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: any) => { await supabase.from("period_goals").update({ status }).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["period-goals"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("period_goals").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["period-goals"] }),
  });

  const week = goals.filter((g:any)=>g.period_type==="week");
  const month = goals.filter((g:any)=>g.period_type==="month");

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="w-full rounded-2xl"><Plus className="size-4 mr-1"/>Nova meta</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova meta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} placeholder="Título"/>
            <Input value={form.description} onChange={e=>setForm({...form, description:e.target.value})} placeholder="Descrição (opcional)"/>
            <div className="grid grid-cols-2 gap-2">
              <Select value={form.period_type} onValueChange={v=>setForm({...form, period_type:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mês</SelectItem>
                </SelectContent>
              </Select>
              <Select value={form.priority} onValueChange={v=>setForm({...form, priority:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={form.scope} onValueChange={v=>setForm({...form, scope:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="couple" disabled={!coupleId}>Casal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button onClick={()=>create.mutate()} disabled={!form.title}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {[
        { label: "Esta semana", list: week },
        { label: "Este mês", list: month },
      ].map(group => (
        <Card key={group.label} className="rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2"><Target className="size-4 text-primary"/><div className="font-semibold text-sm">{group.label}</div></div>
          {group.list.length===0 ? <div className="text-xs text-muted-foreground py-2">Sem metas</div> : group.list.map((g:any)=>(
            <div key={g.id} className="flex items-center gap-3 py-2 border-t border-border first:border-0">
              <Checkbox checked={g.status==="done"} onCheckedChange={(c)=>updateStatus.mutate({id:g.id, status:c?"done":"pending"})}/>
              <div className="flex-1">
                <div className={`text-sm font-medium ${g.status==="done"?"line-through text-muted-foreground":""}`}>{g.title}</div>
                {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
              </div>
              <Badge variant={g.priority==="high"?"destructive":g.priority==="medium"?"default":"secondary"} className="text-[10px]">{g.priority}</Badge>
              <Button size="icon" variant="ghost" onClick={()=>del.mutate(g.id)}><Trash2 className="size-4 text-destructive"/></Button>
            </div>
          ))}
        </Card>
      ))}
    </>
  );
}
