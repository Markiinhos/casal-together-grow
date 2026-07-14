import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Plus, Copy, Archive, Trash2 } from "lucide-react";
import { formatBRL, monthLabel } from "@/lib/finance";
import { toast } from "sonner";

export const Route = createFileRoute("/app/financas/planejamento/")({
  component: PlanList,
});

function PlanList() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const plans = useQuery({
    queryKey: ["plans", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("monthly_financial_plans").select("*").order("reference_month", { ascending: false });
      if (space === "private") q = q.eq("visibility", "private").eq("user_id", user!.id);
      else if (coupleId) q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      else q = q.eq("visibility", "shared").eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const copyPrev = useMutation({
    mutationFn: async () => {
      // Pega plano mais recente e duplica para o próximo mês
      const active = (plans.data ?? []).filter((p) => p.status === "active");
      if (active.length === 0) throw new Error("Nenhum planejamento anterior encontrado");
      const src = active[0];
      const nextMonth = new Date(src.reference_month);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const { data: allocs } = await supabase.from("monthly_budget_allocations").select("*").eq("plan_id", src.id);
      const { data: newPlan, error: e1 } = await supabase.from("monthly_financial_plans").insert({
        user_id: user!.id,
        couple_id: space === "shared" ? coupleId : null,
        visibility: space,
        reference_month: getLocalISODate(nextMonth),
        expected_income: src.expected_income,
        suggested_percentage: src.suggested_percentage,
        spending_limit: src.spending_limit,
        planned_reserve: src.planned_reserve,
        planned_goals: src.planned_goals,
        distribute_all: src.distribute_all,
        edit_policy: src.edit_policy,
        created_by: user!.id,
      } as any).select("*").single();
      if (e1) throw e1;
      if (allocs && allocs.length > 0) {
        await supabase.from("monthly_budget_allocations").insert(
          allocs.map((a: any) => ({ plan_id: newPlan.id, category_id: a.category_id, planned_amount: a.planned_amount })) as any,
        );
      }
      return newPlan;
    },
    onSuccess: (p: any) => {
      toast.success("Planejamento copiado");
      qc.invalidateQueries({ queryKey: ["plans"] });
      navigate({ to: "/app/financas/planejamento/$id", params: { id: p.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível copiar"),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monthly_financial_plans").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Arquivado"); qc.invalidateQueries({ queryKey: ["plans"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monthly_financial_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["plans"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <>
      <PageHeader title="Planejamento mensal" fallbackRoute="/app/financas" />
      <div className="px-4 py-4 space-y-3 pb-24">
        <div className="grid grid-cols-2 gap-2">
          <Button asChild className="rounded-2xl">
            <Link to="/app/financas/planejamento/novo"><Plus className="size-4 mr-1" /> Novo</Link>
          </Button>
          <Button variant="outline" className="rounded-2xl" onClick={() => copyPrev.mutate()} disabled={copyPrev.isPending || (plans.data ?? []).length === 0}>
            <Copy className="size-4 mr-1" /> Copiar anterior
          </Button>
        </div>

        {plans.isLoading ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : (plans.data ?? []).length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Target} title="Sem planejamentos" description="Crie um planejamento para acompanhar seu orçamento" />
          </Card>
        ) : (
          <div className="space-y-2">
            {plans.data!.map((p: any) => {
              const monthDate = new Date(p.reference_month + "T12:00:00");
              return (
                <Card key={p.id} className="rounded-2xl p-4 shadow-card">
                  <Link to="/app/financas/planejamento/$id" params={{ id: p.id }} className="block">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium capitalize">{monthLabel(monthDate)}</div>
                      {p.status === "archived" && <span className="text-[10px] uppercase text-muted-foreground">Arquivado</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">Receita prevista: {formatBRL(Number(p.expected_income))}</div>
                    <div className="text-xs text-muted-foreground">Limite: {formatBRL(Number(p.spending_limit))}</div>
                  </Link>
                  <div className="flex gap-2 mt-3">
                    {p.status === "active" && (
                      <Button variant="outline" size="sm" className="rounded-lg" onClick={() => archive.mutate(p.id)}>
                        <Archive className="size-3.5 mr-1" /> Arquivar
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="rounded-lg text-destructive" onClick={() => { if (confirm("Excluir planejamento?")) remove.mutate(p.id); }}>
                      <Trash2 className="size-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
