import { getLocalISODate } from "@/lib/date-utils";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Droplet, Dumbbell, Utensils, Scale, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/saude")({ component: HealthPage });

const today = () => getLocalISODate(new Date());

function HealthPage() {
  return (
    <>
      <AppHeader title="Saúde" subtitle="Peso, água, treinos e refeições" />
      <div className="px-4 py-4">
        <Tabs defaultValue="metrics">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="metrics">Peso</TabsTrigger>
            <TabsTrigger value="water">Água</TabsTrigger>
            <TabsTrigger value="workouts">Treino</TabsTrigger>
            <TabsTrigger value="meals">Refeições</TabsTrigger>
          </TabsList>
          <TabsContent value="metrics" className="mt-4"><MetricsTab /></TabsContent>
          <TabsContent value="water" className="mt-4"><WaterTab /></TabsContent>
          <TabsContent value="workouts" className="mt-4"><WorkoutsTab /></TabsContent>
          <TabsContent value="meals" className="mt-4"><MealsTab /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function MetricsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["hm", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("health_metrics").select("*").eq("user_id", user!.id).order("date", { ascending: false }).limit(60);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
  const latest = rows[0];
  const imc = useMemo(() => {
    if (!latest?.weight || !latest?.height) return null;
    const h = Number(latest.height) / 100;
    return Number(latest.weight) / (h * h);
  }, [latest]);

  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [target, setTarget] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("health_metrics").upsert({
      user_id: user.id, date: today(),
      weight: weight ? Number(weight) : null,
      height: height ? Number(height) : (latest?.height ?? null),
      target_weight: target ? Number(target) : (latest?.target_weight ?? null),
    }, { onConflict: "user_id,date" });
    if (error) toast.error(error.message);
    else { toast.success("Registrado!"); setWeight(""); qc.invalidateQueries({ queryKey: ["hm"] }); }
  }

  return (
    <div className="space-y-3">
      <Card className="rounded-3xl p-5 shadow-card">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Scale className="size-5" /></div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Hoje</div>
            <div className="text-2xl font-bold">{latest?.weight ?? "—"} <span className="text-xs font-normal text-muted-foreground">kg</span></div>
          </div>
          {imc && <div className="text-right"><div className="text-xs text-muted-foreground">IMC</div><div className="font-bold">{imc.toFixed(1)}</div></div>}
        </div>
        {latest?.target_weight && (
          <div className="text-xs text-muted-foreground">Meta: {latest.target_weight} kg</div>
        )}
      </Card>

      <Card className="rounded-3xl p-4 shadow-card">
        <form onSubmit={save} className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Peso (kg)</Label><Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            <div><Label className="text-xs">Altura (cm)</Label><Input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder={latest?.height ?? ""} /></div>
            <div><Label className="text-xs">Meta (kg)</Label><Input type="number" step="0.1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={latest?.target_weight ?? ""} /></div>
          </div>
          <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-10">Registrar hoje</Button>
        </form>
      </Card>

      {rows.length > 1 && (
        <Card className="rounded-3xl shadow-card overflow-hidden">
          <div className="px-4 py-2 font-semibold text-xs uppercase tracking-wide bg-accent/30">Histórico</div>
          <div className="divide-y divide-border">
            {rows.slice(0, 10).map((r) => (
              <div key={r.id} className="px-4 py-2 flex justify-between text-sm">
                <span>{new Date(r.date).toLocaleDateString("pt-BR")}</span>
                <span className="font-medium">{r.weight} kg</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function WaterTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const t = today();
  const { data: rows = [] } = useQuery({
    queryKey: ["water", user?.id, t],
    queryFn: async () => {
      const { data } = await supabase.from("water_intake").select("*").eq("user_id", user!.id).eq("date", t);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
  const total = rows.reduce((s, r) => s + Number(r.ml || 0), 0);
  const goal = 2000;
  const pct = Math.min(100, (total / goal) * 100);

  async function addCup(ml: number) {
    await supabase.from("water_intake").insert({ user_id: user!.id, date: t, ml });
    qc.invalidateQueries({ queryKey: ["water"] });
  }
  async function clearToday() {
    await supabase.from("water_intake").delete().eq("user_id", user!.id).eq("date", t);
    qc.invalidateQueries({ queryKey: ["water"] });
  }

  return (
    <div className="space-y-3">
      <Card className="rounded-3xl p-5 shadow-card text-center">
        <Droplet className="size-10 text-primary mx-auto mb-2" fill="currentColor" />
        <div className="text-3xl font-bold">{total} <span className="text-xs font-normal text-muted-foreground">ml</span></div>
        <div className="text-xs text-muted-foreground mb-3">Meta: {goal} ml</div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {[200, 300, 500].map((ml) => (
          <Button key={ml} onClick={() => addCup(ml)} variant="outline" className="rounded-2xl h-14 flex-col"><Droplet className="size-4" />{ml}ml</Button>
        ))}
      </div>
      {rows.length > 0 && <Button variant="ghost" onClick={clearToday} className="w-full text-destructive">Limpar hoje</Button>}
    </div>
  );
}

function WorkoutsTab() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["wk", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("workouts").select("*").eq("user_id", user!.id).order("date", { ascending: false }).limit(30);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
  const [type, setType] = useState("");
  const [duration, setDuration] = useState("30");
  const [calories, setCalories] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !type) return;
    const { error } = await supabase.from("workouts").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      type, duration_min: Number(duration), calories: calories ? Number(calories) : null, date: today(),
    });
    if (error) toast.error(error.message);
    else { setType(""); setCalories(""); qc.invalidateQueries({ queryKey: ["wk"] }); }
  }
  return (
    <div className="space-y-3">
      <Card className="rounded-3xl p-4 shadow-card">
        <form onSubmit={save} className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Tipo" value={type} onChange={(e) => setType(e.target.value)} className="col-span-3" />
            <Input type="number" placeholder="min" value={duration} onChange={(e) => setDuration(e.target.value)} />
            <Input type="number" placeholder="kcal" value={calories} onChange={(e) => setCalories(e.target.value)} className="col-span-2" />
          </div>
          <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-10"><Plus className="size-4 mr-1" /> Registrar treino</Button>
        </form>
      </Card>
      {rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">Sem treinos ainda</p>
      ) : (
        <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
          {rows.map((w) => (
            <div key={w.id} className="px-4 py-3 flex items-center gap-3">
              <div className="size-9 rounded-xl bg-accent-purple/10 text-accent-purple flex items-center justify-center"><Dumbbell className="size-4" /></div>
              <div className="flex-1">
                <div className="text-sm font-medium">{w.type}</div>
                <div className="text-xs text-muted-foreground">{new Date(w.date).toLocaleDateString("pt-BR")} · {w.duration_min} min{w.calories ? ` · ${w.calories} kcal` : ""}</div>
              </div>
              <button onClick={async () => { await supabase.from("workouts").delete().eq("id", w.id); qc.invalidateQueries({ queryKey: ["wk"] }); }} className="text-destructive"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function MealsTab() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["hmeals", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("health_meals").select("*").eq("user_id", user!.id).order("date", { ascending: false }).limit(30);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });
  const [type, setType] = useState("lunch");
  const [desc, setDesc] = useState("");
  const [cal, setCal] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !desc) return;
    const { error } = await supabase.from("health_meals").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      meal_type: type, description: desc, calories: cal ? Number(cal) : null, date: today(),
    });
    if (error) toast.error(error.message);
    else { setDesc(""); setCal(""); qc.invalidateQueries({ queryKey: ["hmeals"] }); }
  }
  return (
    <div className="space-y-3">
      <Card className="rounded-3xl p-4 shadow-card">
        <form onSubmit={save} className="space-y-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="breakfast">Café da manhã</SelectItem>
              <SelectItem value="lunch">Almoço</SelectItem>
              <SelectItem value="dinner">Jantar</SelectItem>
              <SelectItem value="snack">Lanche</SelectItem>
            </SelectContent>
          </Select>
          <Textarea rows={2} placeholder="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Input type="number" placeholder="Calorias (opcional)" value={cal} onChange={(e) => setCal(e.target.value)} />
          <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-10"><Plus className="size-4 mr-1" /> Registrar</Button>
        </form>
      </Card>
      {rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">Sem registros</p>
      ) : (
        <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
          {rows.map((m) => (
            <div key={m.id} className="px-4 py-3 flex items-center gap-3">
              <div className="size-9 rounded-xl bg-warning/10 text-warning-foreground flex items-center justify-center"><Utensils className="size-4" /></div>
              <div className="flex-1">
                <div className="text-sm font-medium">{m.description}</div>
                <div className="text-xs text-muted-foreground">{new Date(m.date).toLocaleDateString("pt-BR")} · {m.meal_type}{m.calories ? ` · ${m.calories} kcal` : ""}</div>
              </div>
              <button onClick={async () => { await supabase.from("health_meals").delete().eq("id", m.id); qc.invalidateQueries({ queryKey: ["hmeals"] }); }} className="text-destructive"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
