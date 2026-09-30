import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/finance";
import type { SpendingPower } from "@/lib/financial-engine/spending-power";
import {
  Sparkles,
  Info,
  Calendar,
  CalendarDays,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Target,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Layers,
  CheckCircle2,
} from "lucide-react";

interface SpendingPowerCardProps {
  data?: SpendingPower;
  isLoading: boolean;
  isPrivate?: boolean;
}

export function SpendingPowerCard({ data, isLoading, isPrivate = false }: SpendingPowerCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <Card className="rounded-3xl p-5 shadow-card border border-border/60">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
            <Skeleton className="size-8 rounded-full" />
          </div>
          <Skeleton className="h-10 w-48 rounded-xl" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        </div>
      </Card>
    );
  }

  const { availableToSpend, perWeek, perDay, daysRemaining, isDeficit, breakdown, monthName } = data;

  return (
    <>
      <Card className="rounded-3xl p-5 shadow-card border border-border/60 relative overflow-hidden bg-gradient-to-br from-card via-card to-primary/[0.03]">
        {/* Glow sutil de fundo */}
        <div
          className={`absolute -right-12 -top-12 size-36 rounded-full blur-3xl pointer-events-none opacity-40 ${
            isDeficit ? "bg-destructive" : "bg-emerald-500"
          }`}
        />

        {/* Cabeçalho */}
        <div className="flex items-start justify-between relative z-10 mb-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-0.5">
              <Sparkles className="size-3.5" />
              <span>{isPrivate ? "Meu limite seguro" : "Quanto podemos gastar?"}</span>
            </div>
            <h3 className="text-base font-bold tracking-tight text-foreground">
              Disponível para gastar
            </h3>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetailsOpen(true)}
            className="h-8 px-2.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1"
          >
            <Info className="size-3.5 text-primary" />
            <span className="hidden xs:inline">Como é calculado?</span>
            <span className="xs:hidden">Cálculo</span>
          </Button>
        </div>

        {/* Valor Principal em destaque */}
        <div className="relative z-10 my-2">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
                isDeficit ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {formatBRL(availableToSpend)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>até o final do mês</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              restam {daysRemaining} {daysRemaining === 1 ? "dia" : "dias"}
            </span>
          </div>
        </div>

        {/* Aviso de déficit se o orçamento foi estourado */}
        {isDeficit && (
          <div className="mt-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-start gap-2.5 text-xs text-destructive">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Atenção: limite do mês ultrapassado</p>
              <p className="opacity-90">
                Os compromissos e despesas superaram a receita prevista em {formatBRL(Math.abs(availableToSpend))}. Evite novos gastos não essenciais.
              </p>
            </div>
          </div>
        )}

        {/* Cards complementares: Por semana e Por dia */}
        <div className="grid grid-cols-2 gap-2.5 mt-4 pt-3 border-t border-border/50 relative z-10">
          <div className="rounded-2xl p-3 bg-muted/40 hover:bg-muted/60 transition-colors border border-border/40">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1">
              <span>Por semana</span>
              <Calendar className="size-3.5 text-muted-foreground/80" />
            </div>
            <div className={`text-base sm:text-lg font-bold ${isDeficit ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {formatBRL(perWeek)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {daysRemaining <= 7 ? "saldo final da semana" : "ritmo seguro semanal"}
            </div>
          </div>

          <div className="rounded-2xl p-3 bg-muted/40 hover:bg-muted/60 transition-colors border border-border/40">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1">
              <span>Por dia</span>
              <CalendarDays className="size-3.5 text-muted-foreground/80" />
            </div>
            <div className={`text-base sm:text-lg font-bold ${isDeficit ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {formatBRL(perDay)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              até fechar {monthName}
            </div>
          </div>
        </div>

        {/* Rodapé de atalhos rápidos */}
        <div className="flex items-center justify-between mt-3.5 pt-2.5 text-xs relative z-10">
          <Link
            to="/app/adicionar"
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" />
            Registrar gasto
          </Link>

          <Link
            to="/app/financas/estrutura"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Layers className="size-3.5" />
            Ver estrutura
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </Card>

      {/* Modal explicativo e transparente do cálculo */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
              <ShieldCheck className="size-4" />
              <span>Transparência Financeira</span>
            </div>
            <DialogTitle className="text-xl font-bold">
              Como calculamos seu disponível?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Fórmula dinâmica que protege suas contas obrigatórias, cartões e metas antes de liberar o valor para gastos do dia a dia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-sm">
            {/* Linhas da Fórmula */}
            <div className="space-y-2 rounded-2xl bg-muted/40 p-4 border border-border/50 text-xs">
              {/* 1. Receita */}
              <div className="flex items-center justify-between font-medium">
                <span className="flex items-center gap-1.5 text-foreground">
                  <TrendingUp className="size-3.5 text-success" />
                  Receita disponível prevista
                </span>
                <span className="text-success font-semibold">
                  +{formatBRL(breakdown.plannedIncome)}
                </span>
              </div>

              {/* 2. Despesas obrigatórias */}
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5 pl-2">
                  <TrendingDown className="size-3 text-destructive" />
                  (-) Despesas obrigatórias
                </span>
                <span className="text-destructive font-medium">
                  -{formatBRL(breakdown.mandatoryExpenses)}
                </span>
              </div>
              <div className="pl-6 text-[11px] text-muted-foreground/80 space-y-0.5">
                <div className="flex justify-between">
                  <span>Contas fixas recorrentes:</span>
                  <span>{formatBRL(breakdown.fixedBills)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Assinaturas ativas:</span>
                  <span>{formatBRL(breakdown.subscriptions)}</span>
                </div>
                {breakdown.futureBillsOnce > 0 && (
                  <div className="flex justify-between">
                    <span>Contas pontuais do mês:</span>
                    <span>{formatBRL(breakdown.futureBillsOnce)}</span>
                  </div>
                )}
              </div>

              {/* 3. Compromissos (Cartões) */}
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5 pl-2">
                  <CreditCard className="size-3 text-orange-500" />
                  (-) Faturas e parcelas de cartão
                </span>
                <span className="text-orange-500 font-medium">
                  -{formatBRL(breakdown.commitments)}
                </span>
              </div>

              {/* 4. Reservas e metas */}
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5 pl-2">
                  <Target className="size-3 text-accent-purple" />
                  (-) Reservas e metas definidas
                </span>
                <span className="text-accent-purple font-medium">
                  -{formatBRL(breakdown.goalsAndReserves)}
                </span>
              </div>

              {/* 5. Despesas variáveis do dia a dia já realizadas */}
              {breakdown.variableSpent > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5 pl-2">
                    <TrendingDown className="size-3 text-rose-500" />
                    (-) Gastos à vista já realizados (Pix/débito)
                  </span>
                  <span className="text-rose-500 font-medium">
                    -{formatBRL(breakdown.variableSpent)}
                  </span>
                </div>
              )}

              {/* Linha divisória */}
              <div className="pt-2 border-t border-border/70 flex items-center justify-between font-bold text-sm">
                <span className="text-foreground">(=) Valor livre para gastar</span>
                <span
                  className={
                    isDeficit
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400"
                  }
                >
                  {formatBRL(availableToSpend)}
                </span>
              </div>
            </div>

            {/* Regras arquiteturais explicadas amigavelmente */}
            <div className="rounded-2xl bg-primary/5 p-3.5 border border-primary/10 space-y-1.5 text-xs text-muted-foreground">
              <div className="font-semibold text-primary flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5" />
                Regras de proteção do cálculo:
              </div>
              <ul className="space-y-1 pl-4 list-disc text-[11px]">
                <li>
                  <b>Sem pagamentos duplicados:</b> O pagamento de uma fatura não é somado com a fatura do cartão.
                </li>
                <li>
                  <b>Sem dívidas de longo prazo:</b> O saldo total de dívidas e financiamentos futuros não consome o caixa do mês corrente.
                </li>
                <li>
                  <b>Investimentos isolados:</b> O patrimônio que você já tem investido não é considerado receita operacional.
                </li>
                <li>
                  <b>Atualização em tempo real:</b> Cada despesa nova registrada abate automaticamente do valor livre.
                </li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              className="rounded-xl w-full gradient-coral text-white border-0"
              onClick={() => setDetailsOpen(false)}
            >
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
