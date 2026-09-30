import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/finance";
import {
  GoalContributionItem,
  calculateGoalProgress,
  parseGoalMetadata,
  buildGoalChartData,
  formatDateBR,
  deleteGoalContribution,
  deleteGoal,
  toggleGoalPause,
} from "@/lib/financial-goals";
import { useAuth } from "@/lib/auth";
import { useProfile, usePartner } from "@/lib/hooks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Target,
  Plus,
  Calendar,
  Clock,
  TrendingUp,
  AlertTriangle,
  Pause,
  Play,
  Trash2,
  Pencil,
  CheckCircle2,
  Users,
  User,
  ShieldCheck,
  Plane,
  ShoppingBag,
  Receipt,
  Briefcase,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { AddContributionDialog } from "./AddContributionDialog";
import { EditContributionDialog } from "./EditContributionDialog";
import { ExtendDeadlineDialog } from "./ExtendDeadlineDialog";

const CATEGORY_ICONS: Record<string, any> = {
  Reserva: ShieldCheck,
  Viagem: Plane,
  Compra: ShoppingBag,
  Emergência: AlertTriangle,
  Pagamento: Receipt,
  Projeto: Briefcase,
  Outro: Target,
};

interface GoalDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: any;
  onUpdate: () => void;
}

export function GoalDetailSheet({
  open,
  onOpenChange,
  goal,
  onUpdate,
}: GoalDetailSheetProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();

  const [contributions, setContributions] = useState<GoalContributionItem[]>([]);
  const [loadingContribs, setLoadingContribs] = useState(false);

  // Modais secundários
  const [addContribOpen, setAddContribOpen] = useState(false);
  const [editingContrib, setEditingContrib] = useState<GoalContributionItem | null>(null);
  const [extendDeadlineOpen, setExtendDeadlineOpen] = useState(false);

  useEffect(() => {
    if (open && goal?.id) {
      loadContributions();
    }
  }, [open, goal?.id]);

  async function loadContributions() {
    if (!goal?.id) return;
    try {
      setLoadingContribs(true);
      const { data, error } = await supabase
        .from("goal_contributions")
        .select("*")
        .eq("goal_id", goal.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContributions((data as GoalContributionItem[]) || []);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar histórico");
    } finally {
      setLoadingContribs(false);
    }
  }

  if (!goal) return null;

  const meta = parseGoalMetadata(goal);
  const pacing = calculateGoalProgress(goal);
  const chartData = buildGoalChartData(goal, contributions, pacing);

  const CategoryIcon = CATEGORY_ICONS[meta.category] || Target;

  // Participação por pessoa no casal
  const isShared = goal.visibility === "shared";
  const userTotal = contributions
    .filter((c) => c.user_id === user?.id)
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const partnerTotal = contributions
    .filter((c) => c.user_id !== user?.id)
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalContribAmount = userTotal + partnerTotal;
  const userPct =
    totalContribAmount > 0 ? Math.round((userTotal / totalContribAmount) * 100) : 0;
  const partnerPct = totalContribAmount > 0 ? 100 - userPct : 0;

  async function handleTogglePause() {
    try {
      await toggleGoalPause(goal.id, goal.status);
      toast.success(
        goal.status === "paused" ? "Meta reativada!" : "Meta pausada temporariamente."
      );
      onUpdate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar status");
    }
  }

  async function handleDeleteGoal() {
    if (!confirm(`Tem certeza que deseja excluir a meta "${goal.name}" e todo seu histórico?`)) {
      return;
    }
    try {
      await deleteGoal(goal.id);
      toast.success("Meta excluída com sucesso.");
      onOpenChange(false);
      onUpdate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir meta");
    }
  }

  async function handleDeleteContrib(item: GoalContributionItem) {
    if (!confirm(`Excluir aporte de ${formatBRL(item.amount)}?`)) return;
    try {
      await deleteGoalContribution({
        contributionId: item.id,
        goalId: goal.id,
      });
      toast.success("Aporte excluído!");
      loadContributions();
      onUpdate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir aporte");
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto p-4 sm:p-6 space-y-6"
        >
          {/* Header */}
          <SheetHeader className="text-left space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <CategoryIcon className="size-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <SheetTitle className="text-xl sm:text-2xl font-bold leading-tight">
                      {goal.name}
                    </SheetTitle>
                  </div>
                  <SheetDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                    <span>{meta.category || "Meta"}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      {isShared ? (
                        <>
                          <Users className="size-3" /> Meta do Casal
                        </>
                      ) : (
                        <>
                          <User className="size-3" /> Meta Individual
                        </>
                      )}
                    </span>
                  </SheetDescription>
                  {meta.cleanDescription && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {meta.cleanDescription}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Badges de Status e Ritmo */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${pacing.statusColor}`}
              >
                {pacing.statusLabel}
              </span>

              {pacing.deadline && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3" />
                  Prazo: {formatDateBR(pacing.deadline)} ({pacing.daysRemaining} dias restantes)
                </span>
              )}
            </div>
          </SheetHeader>

          {/* Barra de Progresso Principal */}
          <div className="rounded-2xl border border-border/80 p-4 bg-card shadow-xs space-y-2">
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-2xl font-extrabold text-foreground">
                  {formatBRL(pacing.currentAmount)}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">
                  de {formatBRL(pacing.targetAmount)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-primary">
                  {pacing.progressPct}%
                </span>
              </div>
            </div>

            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full gradient-coral transition-all rounded-full"
                style={{ width: `${pacing.displayPct}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>Início: {formatDateBR(pacing.startDate)}</span>
              {pacing.remainingAmount > 0 ? (
                <span className="font-medium text-foreground">
                  Falta {formatBRL(pacing.remainingAmount)}
                </span>
              ) : (
                <span className="font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" /> Meta Concluída!
                </span>
              )}
            </div>
          </div>

          {/* Ações Rápidas */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => setAddContribOpen(true)}
              className="flex-1 min-w-[140px] rounded-xl gradient-coral text-white border-0 h-10 font-semibold"
            >
              <Plus className="size-4 mr-1.5" /> + Adicionar Aporte
            </Button>

            <Button
              variant="outline"
              onClick={handleTogglePause}
              className="rounded-xl h-10"
            >
              {goal.status === "paused" ? (
                <>
                  <Play className="size-4 mr-1.5 text-success" /> Retomar
                </>
              ) : (
                <>
                  <Pause className="size-4 mr-1.5" /> Pausar
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => setExtendDeadlineOpen(true)}
              className="rounded-xl h-10"
            >
              <Calendar className="size-4 mr-1.5" /> Prorrogar Prazo
            </Button>

            <Button
              variant="outline"
              onClick={handleDeleteGoal}
              className="rounded-xl h-10 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          {/* Grid de Métricas de Ritmo */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
              Ritmo & Acompanhamento
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Card className="p-3 rounded-2xl bg-card border-border/80">
                <span className="text-[11px] text-muted-foreground block mb-0.5">
                  Restante
                </span>
                <span className="text-sm font-bold text-foreground truncate block">
                  {formatBRL(pacing.remainingAmount)}
                </span>
              </Card>

              <Card className="p-3 rounded-2xl bg-card border-border/80">
                <span className="text-[11px] text-muted-foreground block mb-0.5">
                  Dias Restantes
                </span>
                <span className="text-sm font-bold text-foreground block">
                  {pacing.deadline ? `${pacing.daysRemaining} dias` : "Sem prazo"}
                </span>
              </Card>

              <Card className="p-3 rounded-2xl bg-card border-border/80">
                <span className="text-[11px] text-muted-foreground block mb-0.5">
                  Necessário / dia
                </span>
                <span className="text-sm font-bold text-primary block truncate">
                  {pacing.daysRemaining > 0
                    ? formatBRL(pacing.neededPerDay)
                    : formatBRL(pacing.remainingAmount)}
                </span>
              </Card>

              <Card className="p-3 rounded-2xl bg-card border-border/80">
                <span className="text-[11px] text-muted-foreground block mb-0.5">
                  Necessário / sem
                </span>
                <span className="text-sm font-bold text-foreground block truncate">
                  {pacing.daysRemaining > 0
                    ? formatBRL(pacing.neededPerWeek)
                    : formatBRL(pacing.remainingAmount)}
                </span>
              </Card>
            </div>
          </div>

          {/* Caixa de Orientação Prática de Ritmo Diário */}
          <div className="rounded-2xl border border-border p-4 bg-muted/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1.5">
                <TrendingUp className="size-4 text-primary" />
                Orientação Diária Prática
              </span>
              <span className="text-muted-foreground">
                Hoje ({formatDateBR(new Date().toISOString())})
              </span>
            </div>

            <p className="text-xs text-foreground leading-relaxed">
              Para estar no ritmo perfeito hoje, o ideal é ter acumulado{" "}
              <strong>{formatBRL(pacing.targetToday)}</strong>.
            </p>

            <div className="text-xs">
              {pacing.pacingDiff > 0 ? (
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  🎉 Você está <strong>+{formatBRL(pacing.pacingDiff)}</strong> à frente do ritmo esperado!
                </div>
              ) : pacing.pacingDiff < 0 ? (
                <div className="p-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium">
                  ⚡ Você está <strong>{formatBRL(Math.abs(pacing.pacingDiff))}</strong> abaixo do ritmo para hoje.
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                  🎯 Você está exatamente no ritmo ideal previsto!
                </div>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1">
              <Clock className="size-3 shrink-0" />
              <span>{pacing.forecastMessage}</span>
            </div>
          </div>

          {/* Gráfico de Evolução: Planejado vs Realizado */}
          <div className="rounded-2xl border border-border/80 p-4 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Evolução no Tempo: Planejado vs Realizado
              </h4>
            </div>

            <div className="h-[210px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `R$ ${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatBRL(Number(val)), ""]}
                    labelStyle={{ fontSize: 11, fontWeight: "bold" }}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  <Line
                    type="monotone"
                    dataKey="planejado"
                    name="Planejado"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="realizado"
                    name="Realizado"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    connectNulls={false}
                    dot={{ r: 3, fill: "#f97316" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Participação do Casal (quando meta compartilhada) */}
          {isShared && totalContribAmount > 0 && (
            <div className="rounded-2xl border border-border p-4 bg-card space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Users className="size-3.5 text-primary" />
                  Divisão de Aportes do Casal
                </span>
                <span className="text-xs text-muted-foreground">
                  Total: {formatBRL(totalContribAmount)}
                </span>
              </div>

              <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${userPct}%` }}
                />
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${partnerPct}%` }}
                />
              </div>

              <div className="flex justify-between text-xs pt-1">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-primary" />
                  <span>
                    {profile?.full_name || "Você"}: <strong>{formatBRL(userTotal)}</strong> ({userPct}%)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-purple-500" />
                  <span>
                    {partner?.full_name || "Parceiro(a)"}: <strong>{formatBRL(partnerTotal)}</strong> ({partnerPct}%)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Histórico de Aportes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Histórico de Aportes ({contributions.length})
              </h4>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAddContribOpen(true)}
                className="text-xs text-primary h-7 px-2"
              >
                <Plus className="size-3 mr-1" /> Adicionar
              </Button>
            </div>

            {loadingContribs ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                Carregando histórico...
              </div>
            ) : contributions.length === 0 ? (
              <Card className="p-4 rounded-2xl text-center text-xs text-muted-foreground border-dashed">
                Nenhum aporte registrado nesta meta. Clique em "+ Adicionar Aporte" para começar!
              </Card>
            ) : (
              <div className="space-y-2">
                {contributions.map((c) => {
                  const isAuthor = c.user_id === user?.id;
                  const authorName = isAuthor
                    ? "Você"
                    : partner?.full_name || "Parceiro(a)";

                  return (
                    <div
                      key={c.id}
                      className="p-3 rounded-2xl border border-border/80 bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-sm text-foreground">
                            +{formatBRL(Number(c.amount))}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDateBR(c.date)}
                          </span>
                          {isShared && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                              {authorName}
                            </Badge>
                          )}
                        </div>
                        {c.note && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {c.note}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingContrib(c)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 rounded-lg text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteContrib(c)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Subdialogs */}
      <AddContributionDialog
        open={addContribOpen}
        onOpenChange={setAddContribOpen}
        goalId={goal.id}
        goalName={goal.name}
        remainingAmount={pacing.remainingAmount}
        onSuccess={() => {
          loadContributions();
          onUpdate();
        }}
      />

      <EditContributionDialog
        open={!!editingContrib}
        onOpenChange={(op) => !op && setEditingContrib(null)}
        contribution={editingContrib}
        onSuccess={() => {
          loadContributions();
          onUpdate();
        }}
      />

      <ExtendDeadlineDialog
        open={extendDeadlineOpen}
        onOpenChange={setExtendDeadlineOpen}
        goalId={goal.id}
        goalName={goal.name}
        currentDeadline={goal.deadline}
        onSuccess={onUpdate}
      />
    </>
  );
}
