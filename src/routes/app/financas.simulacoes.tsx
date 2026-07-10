import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace, applySpaceFilter } from "@/lib/space";
import { formatBRL } from "@/lib/couple";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { RISK_COLORS, RISK_LABELS, PAYMENT_LABELS, type PaymentMethod, type RiskLevel } from "@/lib/simulator";
import { Sparkles, Trash2, Archive } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/financas/simulacoes")({
  component: HistoryPage,
});

type Filter = "all" | "shared" | "private" | "converted" | "archived" | "high_risk" | "low_risk";

const FILTERS: { k: Filter; label: string }[] = [
  { k: "all", label: "Todas" },
  { k: "private", label: "Privadas" },
  { k: "shared", label: "Compartilhadas" },
  { k: "converted", label: "Convertidas" },
  { k: "archived", label: "Arquivadas" },
  { k: "high_risk", label: "Alto risco" },
  { k: "low_risk", label: "Baixo risco" },
];

function HistoryPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: sims = [], isLoading } = useQuery({
    queryKey: ["expense_simulations", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("expense_simulations").select("*").order("created_at", { ascending: false });
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    return (sims as any[]).filter((s) => {
      switch (filter) {
        case "shared": return s.visibility === "shared";
        case "private": return s.visibility === "private";
        case "converted": return s.status === "converted";
        case "archived": return s.status === "archived";
        case "high_risk": return s.risk_level === "arriscado" || s.risk_level === "critico";
        case "low_risk": return s.risk_level === "seguro" || s.risk_level === "atencao";
        default: return true;
      }
    });
  }, [sims, filter]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir simulação?")) return;
    const { error } = await supabase.from("expense_simulations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluída"); qc.invalidateQueries({ queryKey: ["expense_simulations"] }); }
  }
  async function handleArchive(id: string) {
    const { error } = await supabase.from("expense_simulations").update({ status: "archived" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Arquivada"); qc.invalidateQueries({ queryKey: ["expense_simulations"] }); }
  }

  return (
    <>
      <AppHeader title="Simulações" subtitle="Histórico de simulações de despesa" />
      <div className="px-4 py-4 space-y-4">
        <div className="flex gap-2 justify-between">
          <Button asChild size="sm">
            <Link to="/app/financas/simular"><Sparkles className="size-4 mr-1" /> Nova</Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`px-3 py-1 rounded-full text-xs border ${
                filter === f.k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Sparkles} title="Sem simulações" description="Crie sua primeira simulação para ver aqui." />
        ) : (
          <div className="space-y-3">
            {filtered.map((s: any) => (
              <Card key={s.id} className="rounded-2xl p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-semibold truncate">{s.title}</p>
                      {s.risk_level && (
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                          style={{ backgroundColor: RISK_COLORS[s.risk_level as RiskLevel] }}
                        >
                          {RISK_LABELS[s.risk_level as RiskLevel]}
                        </span>
                      )}
                      {s.status === "converted" && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/20 text-success">
                          Convertida
                        </span>
                      )}
                      {s.status === "archived" && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                          Arquivada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {PAYMENT_LABELS[s.payment_method as PaymentMethod] ?? s.payment_method}
                      {s.installments > 1 ? ` · ${s.installments}x` : ""} ·{" "}
                      {new Date(s.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-lg font-bold mt-1">{formatBRL(Number(s.amount))}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {s.status !== "archived" && (
                      <Button size="icon" variant="ghost" onClick={() => handleArchive(s.id)}>
                        <Archive className="size-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
