import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Trash2, Star, ShoppingBasket, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/cardapio")({ component: MenuPage });

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MEALS: Record<string, string> = { breakfast: "Café", lunch: "Almoço", dinner: "Jantar", snack: "Lanche" };

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function MenuPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [weekRef, setWeekRef] = useState(() => startOfWeek(new Date()));
  const [open, setOpen] = useState(false);

  const weekStart = weekRef.toISOString().slice(0, 10);
  const weekEnd = new Date(weekRef.getTime() + 6 * 86400000).toISOString().slice(0, 10);

  const { data: plans = [] } = useQuery({
    queryKey: ["meal_plans", coupleId, user?.id, weekStart],
    queryFn: async () => {
      const q = supabase.from("meal_plans").select("*").gte("week_start", weekStart).lte("week_start", weekStart);
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const byCell = useMemo(() => {
    const m: Record<string, any[]> = {};
    plans.forEach((p) => {
      const k = `${p.day_of_week}-${p.meal_type}`;
      (m[k] = m[k] ?? []).push(p);
    });
    return m;
  }, [plans]);

  async function genShopping() {
    if (plans.length === 0) { toast.error("Sem refeições nesta semana"); return; }
    const items = plans.map((p) => ({
      user_id: user!.id, couple_id: coupleId,
      name: p.title, category: "mercado", meal_plan_id: p.id,
    }));
    const { error } = await supabase.from("shopping_items").insert(items);
    if (error) toast.error(error.message);
    else toast.success(`${items.length} itens adicionados à lista`);
  }

  async function delPlan(id: string) {
    await supabase.from("meal_plans").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["meal_plans"] });
  }
  async function fav(p: any) {
    await supabase.from("meal_plans").update({ favorite: !p.favorite }).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["meal_plans"] });
  }

  return (
    <>
      <AppHeader title="Cardápio" subtitle="Planejamento semanal" />
      <div className="px-4 py-4 space-y-4">
        <Card className="rounded-2xl p-3 shadow-card flex items-center gap-2">
          <button onClick={() => setWeekRef(new Date(weekRef.getTime() - 7 * 86400000))} className="size-8 rounded-lg hover:bg-accent flex items-center justify-center"><ChevronLeft className="size-4" /></button>
          <div className="flex-1 text-center text-sm font-medium">
            {weekRef.toLocaleDateString("pt-BR")} — {new Date(weekEnd).toLocaleDateString("pt-BR")}
          </div>
          <button onClick={() => setWeekRef(new Date(weekRef.getTime() + 7 * 86400000))} className="size-8 rounded-lg hover:bg-accent flex items-center justify-center"><ChevronRight className="size-4" /></button>
        </Card>

        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="flex-1 rounded-xl gradient-coral text-white border-0 h-10"><Plus className="size-4 mr-1" /> Refeição</Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader><DialogTitle>Nova refeição</DialogTitle></DialogHeader>
              <MealForm weekStart={weekStart} onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={genShopping} className="rounded-xl h-10"><ShoppingBasket className="size-4 mr-1" /> Gerar lista</Button>
          <Link to="/app/compras"><Button variant="ghost" className="rounded-xl h-10">Ver lista</Button></Link>
        </div>

        {DAYS.map((d, idx) => {
          const dayPlans = Object.entries(MEALS).map(([mt, label]) => ({
            mt, label, items: byCell[`${idx}-${mt}`] ?? [],
          }));
          const hasAny = dayPlans.some((d) => d.items.length > 0);
          if (!hasAny) return null;
          return (
            <Card key={d} className="rounded-3xl p-4 shadow-card">
              <div className="font-semibold text-sm mb-2">{d}</div>
              <div className="space-y-1.5">
                {dayPlans.filter((d) => d.items.length > 0).map((mt) => (
                  <div key={mt.mt}>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{mt.label}</div>
                    {mt.items.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 py-1">
                        <button onClick={() => fav(p)}><Star className={`size-4 ${p.favorite ? "text-warning-foreground fill-warning" : "text-muted-foreground"}`} /></button>
                        <div className="flex-1 text-sm">{p.title}</div>
                        <button onClick={() => delPlan(p.id)} className="text-destructive"><Trash2 className="size-3.5" /></button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function MealForm({ weekStart, onDone }: { weekStart: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("1");
  const [meal, setMeal] = useState("lunch");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("meal_plans").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      week_start: weekStart, day_of_week: Number(day), meal_type: meal, title,
    });
    if (error) toast.error(error.message);
    else { toast.success("Adicionada!"); qc.invalidateQueries({ queryKey: ["meal_plans"] }); onDone(); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Prato</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Frango grelhado" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Dia</Label>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Refeição</Label>
          <Select value={meal} onValueChange={setMeal}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(MEALS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
