import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, AlertTriangle } from "lucide-react";
import { formatBRL, monthLabel, daysRemaining, safePercent, budgetStatus, getCategoryExpenses, monthlyAmount } from "@/lib/finance";
import { fetchSubscriptions, buildSummary } from "@/lib/subscriptions";
import { useSpace } from "@/lib/space";

export const Route = createFileRoute("/app/financas/planejamento/$id")({
  component: PlanDetail,
});

function PlanDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();

  const plan = useQuery({
    queryKey: ["plan", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("monthly_financial_plans").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const allocs = useQuery({
    queryKey: ["plan-allocs", id],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_budget_allocations").select("*, categories(name,color,icon)").eq("plan_id", id);
      return (data ?? []) as any[];
    },
  });

  const refDate = plan.data ? new Date(plan.data.reference_month + "T12:00:00") : new Date();

  const expenses = useQuery({
    queryKey: ["plan-expenses", id, plan.data?.reference_month, space, coupleId, user?.id],
    queryFn: () => getCategoryExpenses(refDate, { space, userId: user!.id, coupleId }),
    enabled: !!user && !!plan.data,
  });
  
  const subs = useQuery({
    queryKey: ["plan-subs", space, coupleId, user?.id],
    queryFn: async () => {
      const allSubs = await fetchSubscriptions({ space, userId: user!.id, coupleId });
      return buildSummary(allSubs);
    },
    enabled: !!user,
  });

  const fixedBills = useQuery({
    queryKey: ["plan-fixed-bills", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("future_bills").select("amount,recurrence").eq("is_active", true).neq("recurrence", "once");
      if (space === "private") q = q.eq("visibility", "private").eq("user_id", user!.id);
      else if (coupleId) q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      else q = q.eq("visibility", "shared").eq("user_id", user!.id);
      const { data, error } = await q; if (error) throw error;
      return (data ?? []).reduce((sum: number, b: any) => sum + monthlyAmount(b.amount, b.recurrence), 0);
    }, enabled: !!user,
  });

  if (plan.isLoading) return <><PageHeader title="Planejamento" fallbackRoute="/app/financas/planejamento" /><div className="p-4"><Skeleton className="h-40 rounded-2xl" /></div></>;
  if (!plan.data) return <><PageHeader title="Planejamento" fallbackRoute="/app/financas/planejamento" /><div className="p-4">Não encontrado.</div></>;

  const p = plan.data;
  const totalSpent = expenses.data?.total ?? 0;
  const remaining = Number(p.spending_limit) - totalSpent;
  const days = daysRemaining(refDate);
  const perDay = days > 0 ? Math.max(0, remaining / days) : 0;
  const pctUsed = safePercent(totalSpent, Number(p.spending_limit));

  return (
    <>
      <PageHeader title={monthLabel(refDate)} fallbackRoute="/app/financas/planejamento">
        <Link to="/app/financas/planejamento/novo" search={{ id: p.id }} className="p-2 hover:bg-accent rounded-lg">
          <Pencil className="size-4" />
        </Link>
      </PageHeader>
      <div className="px-4 py-4 space-y-3 pb-24">
        <Card className="rounded-2xl p-4 shadow-card space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Receita prevista" value={formatBRL(Number(p.expected_income))} />
            <Stat label="Limite" value={formatBRL(Number(p.spending_limit))} />
            <Stat label="Já gasto" value={formatBRL(totalSpent)} tone={pctUsed && pctUsed >= 100 ? "danger" : undefined} />
            <Stat label="Restante" value={formatBRL(remaining)} tone={remaining < 0 ? "danger" : "safe"} />
            <Stat label="Reserva planejada" value={formatBRL(Number(p.planned_reserve))} />
            <Stat label="Metas" value={formatBRL(Number(p.planned_goals))} />
          </div>
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Disponível por dia (restam {days} dias)</span>
              <b>{days > 0 ? formatBRL(perDay) : "—"}</b>
            </div>
            {pctUsed !== null && (
              <div className="mt-2">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full transition-all ${pctUsed >= 100 ? "bg-destructive" : pctUsed >= 90 ? "bg-orange-500" : pctUsed >= 70 ? "bg-yellow-500" : "bg-success"}`} style={{ width: `${Math.min(100, pctUsed)}%` }} />
                </div>
                <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
                  <span>{pctUsed.toFixed(0)}% utilizado</span>
                  {pctUsed > 100 && <span className="text-destructive">Excedeu em {formatBRL(totalSpent - Number(p.spending_limit))}</span>}
                </div>
              </div>
            )}
          </div>
        </Card>

        <section>
          <h3 className="font-semibold mb-2">Acompanhamento por categoria</h3>
          {(allocs.data ?? []).length === 0 ? (
            <Card className="rounded-2xl p-4 shadow-card"><p className="text-sm text-muted-foreground text-center">Sem categorias cadastradas.</p></Card>
          ) : (
            <div className="space-y-2">
              {allocs.data!.map((a: any) => {
                const spent = expenses.data?.byCategory?.[a.category_id] ?? 0;
                const budget = Number(a.planned_amount);
                const pct = safePercent(spent, budget);
                const status = budgetStatus(pct);
                const barPct = pct === null ? 0 : Math.min(100, pct);
                return (
                  <Card key={a.id} className="rounded-2xl p-3 shadow-card">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="size-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: (a.categories?.color ?? "#FF6B57") + "22", color: a.categories?.color ?? "#FF6B57" }}>
                        <span className="text-[10px]">●</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.categories?.name ?? "Categoria"}</div>
                        <div className="text-[11px] text-muted-foreground">{formatBRL(spent)} de {formatBRL(budget)}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full transition-all ${status.key === "exceeded" ? "bg-destructive" : status.key === "close" ? "bg-orange-500" : status.key === "attention" ? "bg-yellow-500" : "bg-success"}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[11px]">
                      <span className="text-muted-foreground">{pct === null ? "Sem orçamento definido" : `${pct.toFixed(0)}% utilizado`}</span>
                      {pct !== null && pct > 100 && (
                        <span className="text-destructive flex items-center gap-1"><AlertTriangle className="size-3" /> Excedeu em {formatBRL(spent - budget)}</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {subs.data && (
            <section>
              <h3 className="font-semibold mb-2">Assinaturas Ativas</h3>
              <Card className="rounded-2xl p-4 shadow-card flex items-center justify-between">
                 <div>
                    <p className="font-medium text-sm">Custo Mensal Fixo</p>
                    <p className="text-xs text-muted-foreground">{subs.data.activeCount} assinaturas em andamento</p>
                 </div>
                 <div className="text-right">
                    <p className="font-bold">{formatBRL(subs.data.monthlyTotal)}</p>
                 </div>
              </Card>
            </section>
        )}

        <section>
          <h3 className="font-semibold mb-2">Despesas fixas previstas</h3>
          <Card className="rounded-2xl p-4 shadow-card flex items-center justify-between">
            <div><p className="font-medium text-sm">Contas fixas + assinaturas</p><p className="text-xs text-muted-foreground">Previsão mensal, sem alterar o realizado</p></div>
            <p className="font-bold">{formatBRL((fixedBills.data ?? 0) + (subs.data?.monthlyTotal ?? 0))}</p>
          </Card>
        </section>

        <Button asChild variant="outline" className="w-full rounded-2xl">
          <Link to="/app/financas/planejamento/novo" search={{ id: p.id }}>Editar planejamento</Link>
        </Button>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "safe" }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${tone === "danger" ? "text-destructive" : tone === "safe" ? "text-success" : ""}`}>{value}</div>
    </div>
  );
}
