import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Plus, Trash2, Star, ShoppingBasket, ChevronLeft, ChevronRight, ChefHat, Heart, Clock, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/cardapio")({ component: MenuPage });

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MEALS: Record<string, string> = { breakfast: "Café", lunch: "Almoço", snack: "Lanche", dinner: "Jantar" };

function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0,0,0,0);
  x.setDate(x.getDate() - x.getDay()); return x;
}

function MenuPage() {
  return (
    <>
      <AppHeader title="Cardápio" subtitle="Planejamento alimentar do casal"/>
      <div className="px-4 py-4">
        <Tabs defaultValue="planner">
          <TabsList className="grid grid-cols-2 w-full rounded-2xl">
            <TabsTrigger value="planner" className="rounded-xl">Planejamento</TabsTrigger>
            <TabsTrigger value="recipes" className="rounded-xl">Receitas</TabsTrigger>
          </TabsList>
          <TabsContent value="planner" className="mt-4 space-y-3"><PlannerTab/></TabsContent>
          <TabsContent value="recipes" className="mt-4 space-y-3"><RecipesTab/></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// ---------- PLANNER ----------
function PlannerTab() {
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
      const q = supabase.from("meal_plans").select("*, recipes(*)").eq("week_start", weekStart);
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const byCell = useMemo(() => {
    const m: Record<string, any[]> = {};
    plans.forEach((p) => { const k = `${p.day_of_week}-${p.meal_type}`; (m[k] = m[k] ?? []).push(p); });
    return m;
  }, [plans]);

  async function genShopping() {
    if (plans.length === 0) { toast.error("Sem refeições nesta semana"); return; }
    const items: any[] = [];
    plans.forEach((p) => {
      const ing = (p.recipes?.ingredients ?? []) as any[];
      if (ing.length) {
        ing.forEach((i: any) => items.push({
          user_id: user!.id, couple_id: coupleId,
          name: i.name || String(i), quantity: i.quantity ?? null,
          category: "mercado", meal_plan_id: p.id,
        }));
      } else {
        items.push({ user_id: user!.id, couple_id: coupleId, name: p.title, category: "mercado", meal_plan_id: p.id });
      }
    });
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
      <Card className="rounded-2xl p-3 shadow-card flex items-center gap-2">
        <button onClick={() => setWeekRef(new Date(weekRef.getTime() - 7*86400000))} className="size-8 rounded-lg hover:bg-accent flex items-center justify-center"><ChevronLeft className="size-4"/></button>
        <div className="flex-1 text-center text-sm font-medium">{weekRef.toLocaleDateString("pt-BR")} — {new Date(weekEnd).toLocaleDateString("pt-BR")}</div>
        <button onClick={() => setWeekRef(new Date(weekRef.getTime() + 7*86400000))} className="size-8 rounded-lg hover:bg-accent flex items-center justify-center"><ChevronRight className="size-4"/></button>
      </Card>

      <div className="flex gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="flex-1 rounded-xl gradient-coral text-white border-0 h-10"><Plus className="size-4 mr-1"/> Refeição</Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Nova refeição</DialogTitle></DialogHeader>
            <MealForm weekStart={weekStart} onDone={() => setOpen(false)}/>
          </DialogContent>
        </Dialog>
        <Button variant="outline" onClick={genShopping} className="rounded-xl h-10"><ShoppingBasket className="size-4 mr-1"/> Gerar lista</Button>
        <Link to="/app/compras"><Button variant="ghost" className="rounded-xl h-10">Ver lista</Button></Link>
      </div>

      {plans.length === 0 && <EmptyState icon={ChefHat} title="Sem refeições" description="Adicione refeições para esta semana."/>}

      {DAYS.map((d, idx) => {
        const dayPlans = Object.entries(MEALS).map(([mt, label]) => ({ mt, label, items: byCell[`${idx}-${mt}`] ?? [] }));
        const hasAny = dayPlans.some((dp) => dp.items.length > 0);
        if (!hasAny) return null;
        return (
          <Card key={d} className="rounded-3xl p-4 shadow-card">
            <div className="font-semibold text-sm mb-2">{d}</div>
            <div className="space-y-2">
              {dayPlans.filter((dp) => dp.items.length > 0).map((mt) => (
                <div key={mt.mt}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{mt.label}</div>
                  {mt.items.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 py-1">
                      <button onClick={() => fav(p)}><Star className={`size-4 ${p.favorite ? "text-warning-foreground fill-warning":"text-muted-foreground"}`}/></button>
                      <div className="flex-1 text-sm">
                        {p.title}
                        {p.recipes && <span className="text-xs text-muted-foreground"> · {p.recipes.name}</span>}
                      </div>
                      <button onClick={() => delPlan(p.id)} className="text-destructive"><Trash2 className="size-3.5"/></button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </>
  );
}

function MealForm({ weekStart, onDone }: { weekStart: string; onDone: () => void }) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("1");
  const [meal, setMeal] = useState("lunch");
  const [recipeId, setRecipeId] = useState<string>("");

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-pick", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("recipes").select("id,name").order("favorite", { ascending: false }).order("name");
      const { data } = coupleId ? await q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const chosen = recipes.find((r: any) => r.id === recipeId);
    const { error } = await supabase.from("meal_plans").insert({
      user_id: user.id, couple_id: coupleId,
      week_start: weekStart, day_of_week: Number(day), meal_type: meal,
      title: title || chosen?.name || "Refeição",
      recipe_id: recipeId || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Adicionada!"); qc.invalidateQueries({ queryKey: ["meal_plans"] }); onDone(); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label>Receita (opcional)</Label>
        <Select value={recipeId} onValueChange={setRecipeId}>
          <SelectTrigger><SelectValue placeholder="Escolher receita..."/></SelectTrigger>
          <SelectContent>
            {recipes.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Título</Label><Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Ex: Frango grelhado"/></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Dia</Label>
          <Select value={day} onValueChange={setDay}><SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Refeição</Label>
          <Select value={meal} onValueChange={setMeal}><SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{Object.entries(MEALS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}

// ---------- RECIPES ----------
function RecipesTab() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes", coupleId, user?.id, onlyFav],
    queryFn: async () => {
      let q = supabase.from("recipes").select("*").order("favorite", { ascending: false }).order("name");
      if (onlyFav) q = q.eq("favorite", true);
      const { data } = coupleId ? await q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const toggleFav = useMutation({
    mutationFn: async (r: any) => { await supabase.from("recipes").update({ favorite: !r.favorite }).eq("id", r.id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("recipes").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  });

  return (
    <>
      <div className="flex gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="flex-1 rounded-2xl"><Plus className="size-4 mr-1"/> Nova receita</Button></DialogTrigger>
          <DialogContent className="rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova receita</DialogTitle></DialogHeader>
            <RecipeForm onDone={() => setOpen(false)}/>
          </DialogContent>
        </Dialog>
        <Button variant={onlyFav ? "default" : "outline"} className="rounded-2xl" onClick={() => setOnlyFav(v => !v)}>
          <Heart className={`size-4 mr-1 ${onlyFav?"fill-current":""}`}/>Favoritas
        </Button>
      </div>

      {recipes.length === 0 ? (
        <EmptyState icon={ChefHat} title="Sem receitas" description="Cadastre receitas com ingredientes para gerar listas de compra automáticas."/>
      ) : (
        <div className="space-y-2">
          {recipes.map((r: any) => (
            <Card key={r.id} className="rounded-2xl p-3">
              <div className="flex items-start gap-3">
                <div className="size-12 rounded-xl bg-warning/10 text-warning-foreground flex items-center justify-center text-xl">🍽️</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm truncate">{r.name}</div>
                    {r.favorite && <Star className="size-3.5 text-warning-foreground fill-warning"/>}
                  </div>
                  {r.description && <div className="text-xs text-muted-foreground line-clamp-2">{r.description}</div>}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                    {r.prep_minutes && <span className="flex items-center gap-1"><Clock className="size-3"/>{r.prep_minutes}min</span>}
                    {r.servings && <span className="flex items-center gap-1"><Users className="size-3"/>{r.servings}p</span>}
                    <span>{(r.ingredients ?? []).length} ingredientes</span>
                  </div>
                  {(r.tags ?? []).length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => toggleFav.mutate(r)}><Star className={`size-4 ${r.favorite?"text-warning-foreground fill-warning":"text-muted-foreground"}`}/></button>
                  <button onClick={() => del.mutate(r.id)}><Trash2 className="size-4 text-destructive"/></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function RecipeForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [form, setForm] = useState({ name:"", description:"", instructions:"", prep_minutes: 30, servings: 2, tags: "", scope: "individual" });
  const [ings, setIngs] = useState<{name:string; quantity:string}[]>([{name:"", quantity:""}]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanIngs = ings.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), quantity: i.quantity.trim() }));
    const { error } = await supabase.from("recipes").insert({
      name: form.name, description: form.description, instructions: form.instructions,
      prep_minutes: form.prep_minutes, servings: form.servings,
      tags: form.tags ? form.tags.split(",").map(t=>t.trim()).filter(Boolean) : [],
      ingredients: cleanIngs,
      user_id: user!.id, couple_id: form.scope==="couple" ? coupleId : null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Receita criada"); qc.invalidateQueries({ queryKey: ["recipes"] }); onDone(); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Nome</Label><Input required value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/></div>
      <div><Label>Descrição</Label><Input value={form.description} onChange={e=>setForm({...form, description:e.target.value})}/></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Tempo (min)</Label><Input type="number" value={form.prep_minutes} onChange={e=>setForm({...form, prep_minutes:Number(e.target.value)})}/></div>
        <div><Label>Porções</Label><Input type="number" value={form.servings} onChange={e=>setForm({...form, servings:Number(e.target.value)})}/></div>
      </div>
      <div><Label>Tags (vírgula)</Label><Input value={form.tags} onChange={e=>setForm({...form, tags:e.target.value})} placeholder="rápido, fit, vegano"/></div>
      <div>
        <Label>Escopo</Label>
        <Select value={form.scope} onValueChange={v=>setForm({...form, scope:v})}>
          <SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="couple" disabled={!coupleId}>Casal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Ingredientes</Label>
        <div className="space-y-1 mt-1">
          {ings.map((i, idx) => (
            <div key={idx} className="flex gap-2">
              <Input className="flex-1" placeholder="Ingrediente" value={i.name} onChange={e=>{const n=[...ings]; n[idx].name=e.target.value; setIngs(n);}}/>
              <Input className="w-24" placeholder="Qtd" value={i.quantity} onChange={e=>{const n=[...ings]; n[idx].quantity=e.target.value; setIngs(n);}}/>
              <Button type="button" size="icon" variant="ghost" onClick={()=>setIngs(ings.filter((_,j)=>j!==idx))}><Trash2 className="size-4"/></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={()=>setIngs([...ings,{name:"",quantity:""}])}>+ Ingrediente</Button>
        </div>
      </div>
      <div><Label>Modo de preparo</Label><Textarea rows={4} value={form.instructions} onChange={e=>setForm({...form, instructions:e.target.value})}/></div>
      <DialogFooter><Button type="submit" className="w-full">Salvar receita</Button></DialogFooter>
    </form>
  );
}
