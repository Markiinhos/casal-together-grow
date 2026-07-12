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
import { Textarea } from "@/components/ui/textarea";
import { RISK_COLORS, RISK_LABELS, PAYMENT_LABELS, type PaymentMethod, type RiskLevel } from "@/lib/simulator";
import { Sparkles, Trash2, Archive, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown } from "lucide-react";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

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

  async function handleDecision(id: string, decision: "approved" | "rejected") {
    const { error } = await supabase.from("expense_simulations").update({
      decision_status: decision,
      decision_by: user!.id,
      decision_at: new Date().toISOString(),
      partner_comment: comment.trim() || null
    }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(decision === "approved" ? "Simulação aprovada" : "Simulação rejeitada");
      setComment("");
      qc.invalidateQueries({ queryKey: ["expense_simulations"] });
    }
  }

  return (
    <>
      <AppHeader title="Simulações" subtitle="Histórico de simulações de despesa" />
      <div className="px-4 py-4 space-y-4 pb-20">
        <div className="flex gap-2 justify-between">
          <Button asChild size="sm">
            <Link to="/app/financas/simular" search={(prev: any) => prev}><Sparkles className="size-4 mr-1" /> Nova</Link>
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
            {filtered.map((s: any) => {
              const isExpanded = expandedId === s.id;
              const isPartner = s.user_id !== user?.id && s.visibility === "shared";
              
              return (
                <Card key={s.id} className="rounded-2xl p-4 transition-all duration-200">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0" onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap cursor-pointer">
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
                        {s.decision_status === "approved" && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/20 text-success">
                            Aprovada pelo parceiro
                          </span>
                        )}
                        {s.decision_status === "rejected" && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/20 text-destructive">
                            Rejeitada pelo parceiro
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground cursor-pointer">
                        {PAYMENT_LABELS[s.payment_method as PaymentMethod] ?? s.payment_method}
                        {s.installments > 1 ? ` · ${s.installments}x` : ""} ·{" "}
                        {new Date(s.created_at).toLocaleDateString("pt-BR")}
                      </p>
                      <p className="text-lg font-bold mt-1 cursor-pointer flex items-center gap-2">
                        {formatBRL(Number(s.amount))}
                        {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                      </p>
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

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Categoria:</span> {s.category}</div>
                        {s.interest_enabled && <div><span className="text-muted-foreground">Juros:</span> {s.interest_rate}% a.m.</div>}
                        <div><span className="text-muted-foreground">Valor final:</span> {formatBRL(Number(s.final_amount))}</div>
                        {s.installments > 1 && s.simulation_result && <div><span className="text-muted-foreground">Parcela:</span> {formatBRL(Number(s.simulation_result.installmentAmount))}</div>}
                      </div>

                      {s.simulation_result && (
                        <div className="p-3 bg-muted/50 rounded-xl space-y-2">
                          <p className="font-medium text-xs">Análise de Risco</p>
                          <p className="text-muted-foreground text-xs">{s.simulation_result.riskMessage}</p>
                          <p className="text-xs">💡 {s.simulation_result.suggestion}</p>
                        </div>
                      )}

                      {/* Partner Decision Area */}
                      {s.visibility === "shared" && (
                        <div className="pt-2">
                          {s.decision_status === "pending" && isPartner ? (
                            <div className="space-y-2">
                              <p className="text-xs font-medium">Seu parceiro sugeriu essa compra. O que acha?</p>
                              <Textarea 
                                placeholder="Adicione um comentário (opcional)..." 
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                className="text-xs min-h-[60px]"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" className="flex-1 bg-success hover:bg-success/90" onClick={() => handleDecision(s.id, "approved")}>
                                  <ThumbsUp className="size-3.5 mr-1" /> Aprovar
                                </Button>
                                <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleDecision(s.id, "rejected")}>
                                  <ThumbsDown className="size-3.5 mr-1" /> Rejeitar
                                </Button>
                              </div>
                            </div>
                          ) : s.decision_status !== "pending" ? (
                            <div className={`p-3 rounded-xl border ${s.decision_status === "approved" ? "bg-success/10 border-success/20 text-success-foreground" : "bg-destructive/10 border-destructive/20 text-destructive-foreground"}`}>
                              <p className="text-xs font-semibold flex items-center gap-1">
                                {s.decision_status === "approved" ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
                                {s.decision_status === "approved" ? "Aprovado pelo parceiro" : "Rejeitado pelo parceiro"}
                              </p>
                              {s.partner_comment && (
                                <p className="text-xs mt-1 italic">"{s.partner_comment}"</p>
                              )}
                            </div>
                          ) : s.decision_status === "pending" && !isPartner ? (
                            <p className="text-xs text-muted-foreground italic">Aguardando opinião do parceiro...</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
