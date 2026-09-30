import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace, applySpaceFilter } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { Target, Plus, Sparkles, CheckCircle2, PauseCircle } from "lucide-react";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalFormDialog } from "@/components/goals/GoalFormDialog";
import { GoalDetailSheet } from "@/components/goals/GoalDetailSheet";
import { AddContributionDialog } from "@/components/goals/AddContributionDialog";
import { ExtendDeadlineDialog } from "@/components/goals/ExtendDeadlineDialog";
import { EmergencyFundCard } from "@/components/goals/EmergencyFundCard";
import { calculateGoalProgress } from "@/lib/financial-goals";
import { useEmergencyFund } from "@/lib/emergency-fund";

export const Route = createFileRoute("/app/metas")({
  component: GoalsPage,
});

function GoalsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const qc = useQueryClient();

  // Modais e gaveta de detalhes
  const [openNewGoal, setOpenNewGoal] = useState(false);
  const [selectedGoalForDetail, setSelectedGoalForDetail] = useState<any | null>(null);
  const [selectedGoalForContribution, setSelectedGoalForContribution] = useState<any | null>(null);
  const [selectedGoalForExtend, setSelectedGoalForExtend] = useState<any | null>(null);

  // Filtro de abas: "all" | "active" | "completed" | "paused"
  const [activeTab, setActiveTab] = useState<string>("all");

  const opts = { space, userId: user?.id ?? "", coupleId };

  const { data: emergencyFundData, refetch: refetchEmergencyFund } = useEmergencyFund(
    opts,
    !!user
  );

  const { data: goals = [], refetch } = useQuery({
    queryKey: ["goals", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase
        .from("goals")
        .select("*")
        .order("created_at", { ascending: false });
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Atualização em tempo real para goals, aportes e despesas essenciais
  useEffect(() => {
    const invalidateGoalsAndEmergency = () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["emergency-fund"] });
      qc.invalidateQueries({ queryKey: ["home-goals"] });
      qc.invalidateQueries({ queryKey: ["spending-power"] });
    };

    const ch = supabase
      .channel("goals-page-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, invalidateGoalsAndEmergency)
      .on("postgres_changes", { event: "*", schema: "public", table: "goal_contributions" }, invalidateGoalsAndEmergency)
      .on("postgres_changes", { event: "*", schema: "public", table: "future_bills" }, () => qc.invalidateQueries({ queryKey: ["emergency-fund"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "variable_expenses" }, () => qc.invalidateQueries({ queryKey: ["emergency-fund"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => qc.invalidateQueries({ queryKey: ["emergency-fund"] }))
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Se a meta selecionada para detalhes for atualizada, atualizar a referência
  useEffect(() => {
    if (selectedGoalForDetail) {
      const updated = goals.find((g: any) => g.id === selectedGoalForDetail.id);
      if (updated) setSelectedGoalForDetail(updated);
    }
  }, [goals]);

  // Estatísticas globais
  const totalTarget = goals.reduce((acc: number, g: any) => acc + Number(g.target_amount || 0), 0);
  const totalAccumulated = goals.reduce((acc: number, g: any) => acc + Number(g.current_amount || 0), 0);
  const totalRemaining = Math.max(0, totalTarget - totalAccumulated);
  const completedGoalsCount = goals.filter((g: any) => g.status === "completed" || Number(g.current_amount) >= Number(g.target_amount)).length;
  const activeGoalsCount = goals.filter((g: any) => g.status !== "completed" && g.status !== "paused").length;

  // Filtragem por aba
  const filteredGoals = goals.filter((g: any) => {
    const isCompleted = g.status === "completed" || Number(g.current_amount) >= Number(g.target_amount);
    const isPaused = g.status === "paused";

    if (activeTab === "active") return !isCompleted && !isPaused;
    if (activeTab === "completed") return isCompleted;
    if (activeTab === "paused") return isPaused;
    return true;
  });

  return (
    <>
      <AppHeader
        title="Metas Financeiras"
        subtitle="Planeje, acompanhe o ritmo e realize seus sonhos"
      />

      <div className="px-4 py-4 space-y-4 max-w-4xl mx-auto pb-24">
        {/* ETAPA 5: Meta Especial de Reserva de Emergência */}
        {emergencyFundData && (
          <EmergencyFundCard
            data={emergencyFundData}
            opts={opts}
            onOpenAddContribution={(g) => setSelectedGoalForContribution(g)}
            onOpenDetail={(g) => setSelectedGoalForDetail(g)}
            onRefetch={() => {
              refetch();
              refetchEmergencyFund();
              qc.invalidateQueries({ queryKey: ["goals"] });
              qc.invalidateQueries({ queryKey: ["emergency-fund"] });
            }}
          />
        )}

        {/* Botão de Criação */}
        <Button
          onClick={() => setOpenNewGoal(true)}
          className="w-full rounded-2xl gradient-coral text-white border-0 h-12 text-sm font-semibold shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="size-5" /> Nova Meta Financeira
        </Button>

        {/* Resumo Rápido de Metas */}
        {goals.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            <Card className="p-3 rounded-2xl border border-border/80 bg-card shadow-xs">
              <span className="text-[11px] text-muted-foreground block mb-0.5">Acumulado</span>
              <span className="text-sm sm:text-base font-bold text-foreground block truncate">
                {formatBRL(totalAccumulated)}
              </span>
            </Card>

            <Card className="p-3 rounded-2xl border border-border/80 bg-card shadow-xs">
              <span className="text-[11px] text-muted-foreground block mb-0.5">Restante</span>
              <span className="text-sm sm:text-base font-bold text-primary block truncate">
                {formatBRL(totalRemaining)}
              </span>
            </Card>

            <Card className="p-3 rounded-2xl border border-border/80 bg-card shadow-xs">
              <span className="text-[11px] text-muted-foreground block mb-0.5">Concluídas</span>
              <span className="text-sm sm:text-base font-bold text-success block truncate">
                {completedGoalsCount} de {goals.length}
              </span>
            </Card>
          </div>
        )}

        {/* Abas de Navegação */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-4 rounded-2xl p-1 bg-muted/60 h-10">
            <TabsTrigger value="all" className="rounded-xl text-xs">
              Todas ({goals.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="rounded-xl text-xs">
              Ativas ({activeGoalsCount})
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-xl text-xs">
              Concluídas ({completedGoalsCount})
            </TabsTrigger>
            <TabsTrigger value="paused" className="rounded-xl text-xs">
              Pausadas
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-3">
            {(() => {
              const regularGoals = filteredGoals.filter((g: any) => g.id !== emergencyFundData?.goalId);
              if (regularGoals.length === 0) {
                return (
                  <Card className="rounded-3xl p-8 shadow-card text-center border-dashed">
                    <EmptyState
                      icon={Target}
                      title={
                        activeTab === "completed"
                          ? "Nenhuma meta concluída ainda"
                          : activeTab === "paused"
                          ? "Nenhuma meta pausada"
                          : "Nenhuma outra meta criada"
                      }
                      description={
                        activeTab === "all"
                          ? "Sua Reserva de Emergência está em destaque acima! Crie metas adicionais para viagens, compras e projetos do casal."
                          : "Alterne o filtro ou crie um novo objetivo."
                      }
                    />
                  </Card>
                );
              }

              return regularGoals.map((g: any) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onOpenDetail={(goal) => setSelectedGoalForDetail(goal)}
                  onAddContribution={(goal) => setSelectedGoalForContribution(goal)}
                  onExtendDeadline={(goal) => setSelectedGoalForExtend(goal)}
                  onUpdate={() => {
                    refetch();
                    refetchEmergencyFund();
                    qc.invalidateQueries({ queryKey: ["goals"] });
                    qc.invalidateQueries({ queryKey: ["emergency-fund"] });
                  }}
                />
              ));
            })()}
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal: Nova Meta Financeira */}
      <GoalFormDialog
        open={openNewGoal}
        onOpenChange={setOpenNewGoal}
        onSuccess={() => {
          refetch();
          qc.invalidateQueries({ queryKey: ["goals"] });
        }}
      />

      {/* Sheet: Detalhes e Ritmo da Meta */}
      <GoalDetailSheet
        open={!!selectedGoalForDetail}
        onOpenChange={(op) => !op && setSelectedGoalForDetail(null)}
        goal={selectedGoalForDetail}
        onUpdate={() => {
          refetch();
          qc.invalidateQueries({ queryKey: ["goals"] });
        }}
      />

      {/* Modal: Aporte Rápido */}
      {selectedGoalForContribution && (
        <AddContributionDialog
          open={!!selectedGoalForContribution}
          onOpenChange={(op) => !op && setSelectedGoalForContribution(null)}
          goalId={selectedGoalForContribution.id}
          goalName={selectedGoalForContribution.name}
          remainingAmount={calculateGoalProgress(selectedGoalForContribution).remainingAmount}
          onSuccess={() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["goals"] });
          }}
        />
      )}

      {/* Modal: Prorrogar Prazo */}
      {selectedGoalForExtend && (
        <ExtendDeadlineDialog
          open={!!selectedGoalForExtend}
          onOpenChange={(op) => !op && setSelectedGoalForExtend(null)}
          goalId={selectedGoalForExtend.id}
          goalName={selectedGoalForExtend.name}
          currentDeadline={selectedGoalForExtend.deadline}
          onSuccess={() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["goals"] });
          }}
        />
      )}
    </>
  );
}
