import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, Plus, RefreshCw, ShoppingCart } from "lucide-react";
import { PRIORITIES, STATUSES, fmtBRL, labelFor, priorityBadge, statusBadge } from "@/lib/household";

export const Route = createFileRoute("/app/casa/compras/")({
  component: ComprasList,
});

type Filter = "all" | "pending" | "urgent" | "this_month" | "purchased" | "done";

function ComprasList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["household_needs", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("household_needs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return (items as any[]).filter((i) => {
      if (filter === "pending") return !["purchased", "done", "cancelled"].includes(i.status);
      if (filter === "urgent") return i.priority === "urgent";
      if (filter === "purchased") return i.status === "purchased";
      if (filter === "done") return i.status === "done";
      if (filter === "this_month") {
        const d = i.planned_date ? new Date(i.planned_date) : i.planned_month ? new Date(i.planned_month) : null;
        return d && d >= monthStart && d <= monthEnd;
      }
      return true;
    });
  }, [items, filter]);

  const summary = useMemo(() => {
    const pending = (items as any[]).filter((i) => !["purchased", "done", "cancelled"].includes(i.status));
    const totalEstimated = pending.reduce((s, i) => s + (Number(i.estimated_amount) || 0), 0);
    const urgent = pending.filter((i) => i.priority === "urgent").length;
    const done = (items as any[]).filter((i) => ["purchased", "done"].includes(i.status)).length;
    return { count: pending.length, totalEstimated, urgent, done };
  }, [items]);

  const filters: { v: Filter; label: string }[] = [
    { v: "all", label: "Todos" },
    { v: "pending", label: "Pendentes" },
    { v: "urgent", label: "Urgentes" },
    { v: "this_month", label: "Este mês" },
    { v: "purchased", label: "Comprados" },
    { v: "done", label: "Concluídos" },
  ];

  const handleNewItem = () => {
    navigate({ to: "/app/casa/compras/nova" });
  };

  return (
    <>
      <PageHeader title="Compras para Casa" subtitle="Planeje compras e manutenções" fallbackRoute="/app/nosso" />
      <div className="px-4 py-3 flex justify-end">
        <Button onClick={handleNewItem} size="sm" className="rounded-full gradient-coral text-white border-0 gap-1"><Plus className="size-4" /> Novo</Button>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Card className="rounded-2xl p-3 text-center shadow-card">
            <div className="text-xs text-muted-foreground">Pendentes</div>
            <div className="text-lg font-bold">{summary.count}</div>
          </Card>
          <Card className="rounded-2xl p-3 text-center shadow-card">
            <div className="text-xs text-muted-foreground">Previsto</div>
            <div className="text-sm font-bold">{fmtBRL(summary.totalEstimated)}</div>
          </Card>
          <Card className="rounded-2xl p-3 text-center shadow-card">
            <div className="text-xs text-muted-foreground">Urgentes</div>
            <div className="text-lg font-bold text-destructive">{summary.urgent}</div>
          </Card>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {filters.map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
                filter === f.v ? "bg-primary text-white border-primary" : "bg-background border-border text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(n => (
              <Card key={n} className="rounded-2xl p-4 shadow-card animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                  <div className="h-5 bg-muted rounded w-16" />
                </div>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <Card className="rounded-2xl p-6 shadow-card text-center space-y-3">
            <p className="text-sm text-destructive">Não foi possível carregar os itens da casa.</p>
            <Button variant="outline" onClick={() => refetch()} className="rounded-xl gap-2">
              <RefreshCw className="size-4" /> Tentar novamente
            </Button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState
              icon={ShoppingCart}
              title="Nenhum item"
              description={
                filter === "all"
                  ? "Você ainda não adicionou nenhuma compra ou manutenção para a casa."
                  : "Nenhum item encontrado com este filtro."
              }
              action={
                filter === "all"
                  ? <Button onClick={handleNewItem} className="rounded-xl gradient-coral text-white border-0">Adicionar primeiro item</Button>
                  : <Button variant="outline" className="rounded-xl" onClick={() => setFilter("all")}>Limpar filtro</Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((i) => (
              <Link key={i.id} to="/app/casa/compras/$id" params={{ id: i.id }}>
                <Card className="rounded-2xl p-4 shadow-card active:scale-[0.99] transition">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{i.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityBadge(i.priority)}`}>
                          {labelFor(PRIORITIES, i.priority)}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge(i.status)}`}>
                          {labelFor(STATUSES, i.status)}
                        </span>
                      </div>
                      {i.category && <div className="text-xs text-muted-foreground mt-0.5">{i.category}</div>}
                      <div className="text-xs text-muted-foreground mt-1">
                        {i.planned_date ? new Date(i.planned_date).toLocaleDateString("pt-BR") :
                          i.planned_month ? new Date(i.planned_month).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) :
                          "Sem data"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{fmtBRL(Number(i.actual_amount ?? i.estimated_amount))}</div>
                      {i.actual_amount && i.estimated_amount && Number(i.actual_amount) !== Number(i.estimated_amount) && (
                        <div className={`text-[10px] ${Number(i.actual_amount) > Number(i.estimated_amount) ? "text-destructive" : "text-success"}`}>
                          {Number(i.actual_amount) > Number(i.estimated_amount) ? "+" : ""}
                          {fmtBRL(Number(i.actual_amount) - Number(i.estimated_amount))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
