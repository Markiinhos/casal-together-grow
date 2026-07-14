import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatBRL, monthLabel, firstOfMonth } from "@/lib/finance";
import { AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { getLocalISODate } from "@/lib/date-utils";


type Search = { id?: string; month?: string };

export const Route = createFileRoute("/app/financas/planejamento/novo")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    id: typeof s.id === "string" ? s.id : undefined,
    month: typeof s.month === "string" ? s.month : undefined,
  }),
  component: PlanWizard,
});

function PlanWizard() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = useSearch({ from: "/app/financas/planejamento/novo" }) as Search;
  const editingId = search.id;

  const [step, setStep] = useState(1);
  const [referenceMonth, setReferenceMonth] = useState<string>(search.month ?? firstOfMonth(new Date()));
  const [income, setIncome] = useState<number>(0);
  const [percent, setPercent] = useState<number>(80);
  const [limit, setLimit] = useState<number>(0);
  const [reserve, setReserve] = useState<number>(0);
  const [goals, setGoals] = useState<number>(0);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [distributeAll, setDistributeAll] = useState(false);
  const [editPolicy, setEditPolicy] = useState<"both" | "creator_only">("both");
  const [search_cat, setSearchCat] = useState("");

  // Autopopula receita a partir das últimas receitas do mês anterior
  useEffect(() => {
    if (editingId || income > 0) return;
    (async () => {
      const now = new Date(referenceMonth + "T12:00:00");
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      let q: any = supabase.from("transactions").select("amount").eq("type", "income").gte("date", prevStart).lte("date", prevEnd);
      if (space === "private") q = q.eq("visibility", "private").eq("user_id", user!.id);
      else if (coupleId) q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      else q = q.eq("visibility", "shared").eq("user_id", user!.id);
      const { data } = await q;
      const sum = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
      if (sum > 0) setIncome(sum);
    })();
  }, [referenceMonth, user, coupleId, space, editingId, income]);

  useEffect(() => {
    setLimit(Number((income * (percent / 100)).toFixed(2)));
  }, [income, percent]);

  const categories = useQuery({
    queryKey: ["plan-cats", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("categories").select("*").eq("type", "expense");
      if (space === "private") q = q.eq("visibility", "private").eq("user_id", user!.id);
      else if (coupleId) q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      else q = q.eq("visibility", "shared").eq("user_id", user!.id);
      const { data } = await q.order("name");
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  // Se editando, carrega dados
  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const { data: plan } = await supabase.from("monthly_financial_plans").select("*").eq("id", editingId).maybeSingle();
      if (!plan) return;
      setReferenceMonth(plan.reference_month);
      setIncome(Number(plan.expected_income));
      setPercent(Number(plan.suggested_percentage));
      setLimit(Number(plan.spending_limit));
      setReserve(Number(plan.planned_reserve));
      setGoals(Number(plan.planned_goals));
      setDistributeAll(plan.distribute_all);
      setEditPolicy(plan.edit_policy === "creator_only" ? "creator_only" : "both");
      const { data: allocs } = await supabase.from("monthly_budget_allocations").select("*").eq("plan_id", editingId);
      const ids: string[] = [];
      const amts: Record<string, number> = {};
      (allocs ?? []).forEach((a: any) => { ids.push(a.category_id); amts[a.category_id] = Number(a.planned_amount); });
      setSelectedCats(ids);
      setAmounts(amts);
    })();
  }, [editingId]);

  const filteredCats = useMemo(() => {
    const list = categories.data ?? [];
    if (!search_cat.trim()) return list;
    return list.filter((c) => c.name.toLowerCase().includes(search_cat.toLowerCase()));
  }, [categories.data, search_cat]);

  const distributed = useMemo(() => {
    return selectedCats.reduce((s, id) => s + (amounts[id] ?? 0), 0) + reserve + goals;
  }, [selectedCats, amounts, reserve, goals]);

  const available = limit + reserve + goals - distributed;
  const totalTarget = distributeAll ? income : limit + reserve + goals;
  const leftover = income - distributed - (distributeAll ? 0 : 0);

  const save = useMutation({
    mutationFn: async () => {
      if (income <= 0) throw new Error("Informe a receita prevista");
      if (limit < 0) throw new Error("Limite inválido");
      if (selectedCats.length === 0) throw new Error("Selecione ao menos uma categoria");

      let planId = editingId;
      if (editingId) {
        const { error } = await supabase.from("monthly_financial_plans").update({
          reference_month: referenceMonth,
          expected_income: income,
          suggested_percentage: percent,
          spending_limit: limit,
          planned_reserve: reserve,
          planned_goals: goals,
          distribute_all: distributeAll,
          edit_policy: editPolicy,
        }).eq("id", editingId);
        if (error) throw error;
        await supabase.from("monthly_budget_allocations").delete().eq("plan_id", editingId);
      } else {
        const { data, error } = await supabase.from("monthly_financial_plans").insert({
          user_id: user!.id,
          couple_id: space === "shared" ? coupleId : null,
          visibility: space,
          reference_month: referenceMonth,
          expected_income: income,
          suggested_percentage: percent,
          spending_limit: limit,
          planned_reserve: reserve,
          planned_goals: goals,
          distribute_all: distributeAll,
          edit_policy: editPolicy,
          created_by: user!.id,
        } as any).select("*").single();
        if (error) throw error;
        planId = data.id;
      }
      if (selectedCats.length > 0) {
        const rows = selectedCats.map((cid) => ({ plan_id: planId!, category_id: cid, planned_amount: amounts[cid] ?? 0 }));
        const { error: e2 } = await supabase.from("monthly_budget_allocations").insert(rows as any);
        if (e2) throw e2;
      }
      return planId!;
    },
    onSuccess: (id) => {
      toast.success("Planejamento salvo!");
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      navigate({ to: "/app/financas/planejamento/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar"),
  });

  const canNext = (() => {
    if (step === 1) return income > 0;
    if (step === 2) return limit >= 0;
    if (step === 3) return selectedCats.length > 0;
    return true;
  })();

  return (
    <>
      <PageHeader title={editingId ? "Editar planejamento" : "Novo planejamento"} fallbackRoute="/app/financas/planejamento" />
      <div className="px-4 py-4 space-y-4 pb-24 max-w-md mx-auto">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <Card className="rounded-2xl p-4 shadow-card space-y-3">
            <h3 className="font-semibold">Planejamento inicial</h3>
            <p className="text-xs text-muted-foreground">Informe quanto vocês esperam receber neste mês.</p>
            <div>
              <Label>Mês de referência</Label>
              <Input type="month" value={referenceMonth.slice(0, 7)} onChange={(e) => setReferenceMonth(e.target.value + "-01")} />
            </div>
            <div>
              <Label>Receita mensal prevista</Label>
              <Input type="number" step="0.01" min="0" value={income || ""} onChange={(e) => setIncome(Number(e.target.value))} placeholder="0,00" />
              <p className="text-[11px] text-muted-foreground mt-1">Sugerimos usar a soma das receitas do mês anterior.</p>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card className="rounded-2xl p-4 shadow-card space-y-3">
            <h3 className="font-semibold">Planejamento total</h3>
            <p className="text-xs text-muted-foreground">Sugerimos que seus gastos mensais não ultrapassem 80% dos seus ganhos.</p>
            <div>
              <Label>Percentual de gastos: {percent}%</Label>
              <Slider value={[percent]} min={10} max={150} step={1} onValueChange={(v) => setPercent(v[0])} />
            </div>
            <div>
              <Label>Limite de gastos</Label>
              <Input type="number" step="0.01" min="0" value={limit || ""} onChange={(e) => setLimit(Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Reserva</Label>
                <Input type="number" step="0.01" min="0" value={reserve || ""} onChange={(e) => setReserve(Number(e.target.value))} />
              </div>
              <div>
                <Label>Metas</Label>
                <Input type="number" step="0.01" min="0" value={goals || ""} onChange={(e) => setGoals(Number(e.target.value))} />
              </div>
            </div>
            {limit > income && (
              <div className="flex items-start gap-2 text-xs text-orange-700 bg-orange-500/10 p-2 rounded-lg">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                Este planejamento prevê gastos maiores que a receita mensal.
              </div>
            )}
            {space === "shared" && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Switch id="editpol" checked={editPolicy === "both"} onCheckedChange={(v) => setEditPolicy(v ? "both" : "creator_only")} />
                <Label htmlFor="editpol" className="text-xs">Permitir que o parceiro edite este planejamento</Label>
              </div>
            )}
          </Card>
        )}

        {step === 3 && (
          <Card className="rounded-2xl p-4 shadow-card space-y-3">
            <h3 className="font-semibold">Categorias e subcategorias</h3>
            <p className="text-xs text-muted-foreground">Escolha para quais categorias você deseja definir um orçamento.</p>
            <Input placeholder="Buscar categoria" value={search_cat} onChange={(e) => setSearchCat(e.target.value)} />
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filteredCats.map((c: any) => {
                const on = selectedCats.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setSelectedCats((prev) => on ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border ${on ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <div className="size-7 rounded-lg flex items-center justify-center" style={{ background: (c.color ?? "#FF6B57") + "22", color: c.color ?? "#FF6B57" }}>
                      <Check className={`size-4 ${on ? "opacity-100" : "opacity-0"}`} />
                    </div>
                    <span className="text-sm flex-1 text-left">{c.name}</span>
                  </button>
                );
              })}
              {filteredCats.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma categoria encontrada</p>}
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card className="rounded-2xl p-4 shadow-card space-y-3">
            <h3 className="font-semibold">Metas e orçamentos</h3>
            <div className="rounded-xl bg-accent/50 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Limite total</span><b>{formatBRL(limit + reserve + goals)}</b></div>
              <div className="flex justify-between"><span>Distribuído</span><b>{formatBRL(distributed)}</b></div>
              <div className="flex justify-between"><span>Disponível</span><b className={available < 0 ? "text-destructive" : ""}>{formatBRL(available)}</b></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="da" checked={distributeAll} onCheckedChange={setDistributeAll} />
              <Label htmlFor="da" className="text-xs">Distribuir todo o valor (orçamento base zero)</Label>
            </div>
            {distributeAll && leftover !== 0 && (
              <div className="text-xs text-orange-700 bg-orange-500/10 p-2 rounded-lg">
                Ainda existem {formatBRL(Math.abs(leftover))} sem uma finalidade definida.
              </div>
            )}
            <div className="space-y-2">
              {selectedCats.map((cid) => {
                const c = categories.data?.find((x) => x.id === cid);
                return (
                  <div key={cid} className="flex items-center gap-2">
                    <div className="flex-1 text-sm truncate">{c?.name}</div>
                    <Input
                      type="number" step="0.01" min="0"
                      className="w-32"
                      value={amounts[cid] ?? ""}
                      onChange={(e) => setAmounts((prev) => ({ ...prev, [cid]: Number(e.target.value) }))}
                      placeholder="0,00"
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="flex gap-2">
          {step > 1 && <Button variant="outline" className="flex-1 rounded-2xl" onClick={() => setStep(step - 1)}>Voltar</Button>}
          {step < 4 && <Button className="flex-1 rounded-2xl" disabled={!canNext} onClick={() => setStep(step + 1)}>Continuar</Button>}
          {step === 4 && <Button className="flex-1 rounded-2xl" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Salvando…" : "Salvar planejamento"}</Button>}
        </div>
      </div>
    </>
  );
}
