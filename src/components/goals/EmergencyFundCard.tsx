import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/finance";
import {
  EmergencyFundCalculation,
  saveEmergencyFundGoal,
} from "@/lib/emergency-fund";
import { EssentialExpensesDialog } from "./EssentialExpensesDialog";
import { toast } from "sonner";
import {
  ShieldCheck,
  SlidersHorizontal,
  Plus,
  Sparkles,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  Target,
  Clock,
  Layers,
} from "lucide-react";
import type { SpaceFilterOpts } from "@/lib/financial-engine/types";

interface EmergencyFundCardProps {
  data: EmergencyFundCalculation;
  opts: SpaceFilterOpts;
  onOpenAddContribution: (goal: any) => void;
  onOpenDetail: (goal: any) => void;
  onRefetch: () => void;
}

export function EmergencyFundCard({
  data,
  opts,
  onOpenAddContribution,
  onOpenDetail,
  onRefetch,
}: EmergencyFundCardProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const [customMonthsInput, setCustomMonthsInput] = useState(
    String(data.targetMonths || 6)
  );
  const [loadingAction, setLoadingAction] = useState(false);

  const {
    goal,
    currentReserve,
    monthlyEssentialCost,
    coverageMonths,
    targetMonths,
    targetAmount,
    remainingAmount,
    progressPct,
    isCompleted,
    essentialSummary,
  } = data;

  // Atualizar a meta de meses (3, 6, 12 ou custom)
  const handleSelectMonths = async (months: number) => {
    if (months <= 0) return;
    setLoadingAction(true);
    const newTargetAmount = Math.round(months * monthlyEssentialCost * 100) / 100;

    try {
      await saveEmergencyFundGoal({
        goalId: goal?.id,
        targetMonths: months,
        targetAmount: newTargetAmount,
        opts,
      });
      toast.success(`Meta definida para ${months} meses (${formatBRL(newTargetAmount)})`);
      setIsEditingCustom(false);
      onRefetch();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar meta");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(customMonthsInput.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Informe um número de meses válido maior que zero");
      return;
    }
    handleSelectMonths(parsed);
  };

  const isPresetSelected = (months: number) => {
    return !isEditingCustom && targetMonths === months;
  };

  return (
    <>
      <Card className="rounded-3xl p-5 sm:p-6 shadow-card border border-emerald-500/20 bg-gradient-to-br from-card via-card to-emerald-500/[0.04] relative overflow-hidden">
        {/* Glow de proteção de fundo */}
        <div className="absolute -right-16 -top-16 size-44 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        {/* Topo do Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-xs border border-emerald-500/20">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold"
                >
                  Meta Especial
                </Badge>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Blindagem do Casal
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                Reserva de Emergência
              </h2>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigOpen(true)}
            className="rounded-full text-xs font-medium h-8 px-3 border-border/80 hover:bg-muted/60 self-start sm:self-auto flex items-center gap-1.5"
          >
            <SlidersHorizontal className="size-3.5 text-primary" />
            <span>Configurar despesas</span>
          </Button>
        </div>

        {/* 3 Indicadores Principais */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 my-4 relative z-10">
          {/* 1. Custo essencial mensal */}
          <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/50">
            <span className="text-[11px] text-muted-foreground font-medium block truncate">
              Custo essencial mensal
            </span>
            <div className="text-base sm:text-xl font-extrabold text-foreground mt-1 truncate">
              {formatBRL(monthlyEssentialCost)}
            </div>
            <span className="text-[10px] text-muted-foreground block mt-0.5 truncate">
              Fixas + variáveis + subs
            </span>
          </div>

          {/* 2. Reserva atual */}
          <div className="p-3.5 rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/20">
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium block truncate">
              Reserva atual
            </span>
            <div className="text-base sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 truncate">
              {formatBRL(currentReserve)}
            </div>
            <span className="text-[10px] text-muted-foreground block mt-0.5 truncate">
              Saldo acumulado
            </span>
          </div>

          {/* 3. Cobertura */}
          <div className="p-3.5 rounded-2xl bg-primary/[0.08] border border-primary/20">
            <span className="text-[11px] text-primary font-medium block truncate">
              Cobertura
            </span>
            <div className="text-base sm:text-xl font-extrabold text-primary mt-1 truncate">
              {coverageMonths > 0
                ? `${coverageMonths.toFixed(1).replace(".", ",")} meses`
                : "0 meses"}
            </div>
            <span className="text-[10px] text-muted-foreground block mt-0.5 truncate">
              de tranquilidade
            </span>
          </div>
        </div>

        {/* Seletor de Metas de Cobertura */}
        <div className="mt-4 pt-4 border-t border-border/60 relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Target className="size-3.5 text-primary" />
              Escolha a cobertura da sua meta:
            </span>
            {targetMonths && (
              <span className="text-xs text-muted-foreground">
                Atual: <b>{targetMonths} meses</b>
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {[3, 6, 12].map((m) => {
              const active = isPresetSelected(m);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={loadingAction}
                  onClick={() => {
                    setIsEditingCustom(false);
                    handleSelectMonths(m);
                  }}
                  className={`py-2 px-1 rounded-2xl text-xs font-semibold transition-all border text-center relative ${
                    active
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {m === 6 && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-600 text-white font-bold uppercase tracking-wider scale-90">
                      Ideal
                    </span>
                  )}
                  {m} meses
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setIsEditingCustom(true)}
              className={`py-2 px-1 rounded-2xl text-xs font-semibold transition-all border text-center ${
                isEditingCustom || ![3, 6, 12].includes(targetMonths)
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground"
              }`}
            >
              Personalizado
            </button>
          </div>

          {/* Form para meses customizados */}
          {isEditingCustom && (
            <form
              onSubmit={handleCustomSubmit}
              className="flex items-center gap-2 p-2 rounded-2xl bg-muted/50 border border-border/60 text-xs"
            >
              <span className="text-muted-foreground pl-1">Meses de reserva:</span>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="60"
                value={customMonthsInput}
                onChange={(e) => setCustomMonthsInput(e.target.value)}
                placeholder="Ex: 9"
                className="h-8 w-20 rounded-xl bg-card text-center"
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 rounded-xl gradient-coral text-white border-0 px-3 ml-auto"
                disabled={loadingAction}
              >
                Salvar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-xl text-muted-foreground px-2"
                onClick={() => setIsEditingCustom(false)}
              >
                Cancelar
              </Button>
            </form>
          )}
        </div>

        {/* Resumo da Meta Ativa: Meta de X meses | Faltam */}
        <div className="mt-4 p-4 rounded-2xl bg-muted/30 border border-border/60 relative z-10 space-y-2.5">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <div>
              <span className="text-muted-foreground block text-[11px]">
                Meta de {targetMonths} meses
              </span>
              <span className="text-base sm:text-lg font-bold text-foreground">
                {formatBRL(targetAmount)}
              </span>
            </div>

            <div className="text-right">
              <span className="text-muted-foreground block text-[11px]">
                {isCompleted ? "Status" : "Faltam"}
              </span>
              <span
                className={`text-base sm:text-lg font-bold ${
                  isCompleted ? "text-emerald-600" : "text-primary"
                }`}
              >
                {isCompleted ? "Meta Concluída! 🎉" : formatBRL(remainingAmount)}
              </span>
            </div>
          </div>

          {/* Barra de Progresso de Cobertura */}
          <div className="space-y-1">
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isCompleted ? "bg-emerald-500" : "gradient-coral"
                }`}
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{progressPct.toFixed(1)}% do objetivo alcançado</span>
              <span>
                {coverageMonths.toFixed(1)} de {targetMonths} meses
              </span>
            </div>
          </div>
        </div>

        {/* Ações Integradas */}
        <div className="flex flex-col sm:flex-row items-center gap-2 mt-4 pt-3 border-t border-border/60 relative z-10">
          <Button
            onClick={() => {
              if (goal) {
                onOpenAddContribution(goal);
              } else {
                // Cria a meta primeiro se não existia
                handleSelectMonths(targetMonths || 6);
              }
            }}
            className="w-full sm:flex-1 rounded-2xl gradient-coral text-white border-0 h-11 text-xs font-semibold shadow-xs hover:opacity-95 transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="size-4" />
            <span>Guardar na Reserva</span>
          </Button>

          {goal && (
            <Button
              variant="outline"
              onClick={() => onOpenDetail(goal)}
              className="w-full sm:w-auto rounded-2xl text-xs font-medium h-11 px-4 border-border/80 hover:bg-muted/60 flex items-center justify-center gap-1.5"
            >
              <span>Ver Ritmo & Aportes</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </Card>

      {/* Modal para configurar quais despesas são essenciais */}
      <EssentialExpensesDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        summary={essentialSummary}
        onUpdated={() => onRefetch()}
      />
    </>
  );
}
