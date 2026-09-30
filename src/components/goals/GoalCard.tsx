import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatBRL } from "@/lib/finance";
import {
  calculateGoalProgress,
  parseGoalMetadata,
  formatDateBR,
  toggleGoalPause,
  deleteGoal,
} from "@/lib/financial-goals";
import { toast } from "sonner";
import {
  Target,
  Plus,
  Calendar,
  MoreVertical,
  Pause,
  Play,
  Trash2,
  Users,
  User,
  ShieldCheck,
  Plane,
  ShoppingBag,
  AlertTriangle,
  Receipt,
  Briefcase,
  TrendingUp,
  Clock,
  ChevronRight,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, any> = {
  Reserva: ShieldCheck,
  Viagem: Plane,
  Compra: ShoppingBag,
  Emergência: AlertTriangle,
  Pagamento: Receipt,
  Projeto: Briefcase,
  Outro: Target,
};

interface GoalCardProps {
  goal: any;
  onOpenDetail: (goal: any) => void;
  onAddContribution: (goal: any) => void;
  onExtendDeadline: (goal: any) => void;
  onUpdate: () => void;
}

export function GoalCard({
  goal,
  onOpenDetail,
  onAddContribution,
  onExtendDeadline,
  onUpdate,
}: GoalCardProps) {
  const meta = parseGoalMetadata(goal);
  const pacing = calculateGoalProgress(goal);
  const CategoryIcon = CATEGORY_ICONS[meta.category] || Target;
  const isShared = goal.visibility === "shared";

  async function handleTogglePause() {
    try {
      await toggleGoalPause(goal.id, goal.status);
      toast.success(goal.status === "paused" ? "Meta reativada!" : "Meta pausada.");
      onUpdate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar status");
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir a meta "${goal.name}" e seus registros?`)) return;
    try {
      await deleteGoal(goal.id);
      toast.success("Meta excluída com sucesso.");
      onUpdate();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir");
    }
  }

  return (
    <Card className="rounded-3xl p-4 sm:p-5 shadow-card hover:shadow-md transition-all border border-border/80 bg-card">
      {/* Header do Card */}
      <div className="flex items-start gap-3 mb-3">
        <div className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <CategoryIcon className="size-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              onClick={() => onOpenDetail(goal)}
              className="font-bold text-base text-foreground truncate cursor-pointer hover:text-primary transition-colors"
            >
              {goal.name}
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{meta.category || "Geral"}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              {isShared ? (
                <>
                  <Users className="size-3" /> Casal
                </>
              ) : (
                <>
                  <User className="size-3" /> Individual
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span
            className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${pacing.statusColor}`}
          >
            {pacing.statusLabel}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8 rounded-xl text-muted-foreground">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl">
              <DropdownMenuItem onClick={() => onOpenDetail(goal)}>
                Ver detalhes e evolução
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddContribution(goal)}>
                Registrar aporte
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExtendDeadline(goal)}>
                Prorrogar prazo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleTogglePause}>
                {goal.status === "paused" ? (
                  <>
                    <Play className="size-4 mr-2 text-success" /> Retomar meta
                  </>
                ) : (
                  <>
                    <Pause className="size-4 mr-2" /> Pausar meta
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="size-4 mr-2" /> Excluir meta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Valores e Barra de Progresso */}
      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between items-baseline">
          <div className="text-sm">
            <span className="font-bold text-foreground">{formatBRL(pacing.currentAmount)}</span>
            <span className="text-xs text-muted-foreground ml-1">
              de {formatBRL(pacing.targetAmount)}
            </span>
          </div>
          <span className="text-xs font-bold text-primary">{pacing.progressPct}%</span>
        </div>

        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full gradient-coral transition-all rounded-full"
            style={{ width: `${pacing.displayPct}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          {pacing.remainingAmount > 0 ? (
            <span>Falta <strong>{formatBRL(pacing.remainingAmount)}</strong></span>
          ) : (
            <span className="text-success font-semibold">Meta Atingida! 🎉</span>
          )}

          {pacing.deadline ? (
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {pacing.daysRemaining > 0
                ? `${pacing.daysRemaining} dias restantes`
                : "Prazo encerrado"}
            </span>
          ) : (
            <span>Sem prazo</span>
          )}
        </div>
      </div>

      {/* Caixa de Ritmo Necessário Diário (se em andamento) */}
      {!pacing.isCompleted && !pacing.isPaused && (
        <div className="rounded-2xl bg-muted/40 p-2.5 mb-3 text-xs border border-border/60 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="size-3.5 text-primary" />
              Necessário por dia:
            </span>
            <span className="font-bold text-primary">
              {pacing.daysRemaining > 0
                ? `${formatBRL(pacing.neededPerDay)} / dia`
                : formatBRL(pacing.remainingAmount)}
            </span>
          </div>

          {pacing.deadline && (
            <div className="text-[11px] text-muted-foreground pt-0.5 flex justify-between items-center">
              <span>
                Hoje: meta de <strong>{formatBRL(pacing.targetToday)}</strong>
              </span>
              <span>
                {pacing.pacingDiff > 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    +{formatBRL(pacing.pacingDiff)} adiantado
                  </span>
                ) : pacing.pacingDiff < 0 ? (
                  <span className="text-orange-600 dark:text-orange-400 font-semibold">
                    -{formatBRL(Math.abs(pacing.pacingDiff))} do ritmo
                  </span>
                ) : (
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    no ritmo
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Botões de Ação */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          onClick={() => onAddContribution(goal)}
          className="flex-1 rounded-xl gradient-coral text-white border-0 h-9 font-semibold text-xs"
        >
          <Plus className="size-3.5 mr-1" /> + Aporte
        </Button>

        <Button
          variant="outline"
          onClick={() => onOpenDetail(goal)}
          className="rounded-xl h-9 text-xs"
        >
          Detalhes <ChevronRight className="size-3.5 ml-1" />
        </Button>
      </div>
    </Card>
  );
}
