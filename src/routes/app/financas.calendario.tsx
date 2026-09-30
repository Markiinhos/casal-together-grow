import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { formatBRL, useFinancialCalendar } from "@/lib/finance";
import type {
  FinancialEvent,
  DayFinancialSummary,
  FinancialEventType,
} from "@/lib/financial-calendar";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Calendar as CalendarIcon,
  ListOrdered,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Briefcase,
  Home,
  Tv,
  Layers,
  ArrowRight,
  Plus,
  ShieldAlert,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/app/financas/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário Financeiro — CASAL" },
      { name: "description", content: "Visão mensal de fluxo de caixa e projeção de saldo diário evento a evento." },
    ],
  }),
  component: FinancialCalendarPage,
});

const EVENT_TYPE_CONFIG: Record<
  FinancialEventType,
  { label: string; icon: any; colorClass: string; bgClass: string }
> = {
  salary: {
    label: "Salário",
    icon: Briefcase,
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10 border-emerald-500/20",
  },
  income: {
    label: "Receita",
    icon: TrendingUp,
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10 border-emerald-500/20",
  },
  credit_card: {
    label: "Cartão",
    icon: CreditCard,
    colorClass: "text-orange-600 dark:text-orange-400",
    bgClass: "bg-orange-500/10 border-orange-500/20",
  },
  fixed_bill: {
    label: "Conta Fixa",
    icon: Home,
    colorClass: "text-rose-600 dark:text-rose-400",
    bgClass: "bg-rose-500/10 border-rose-500/20",
  },
  subscription: {
    label: "Assinatura",
    icon: Tv,
    colorClass: "text-purple-600 dark:text-purple-400",
    bgClass: "bg-purple-500/10 border-purple-500/20",
  },
  variable_expense: {
    label: "Variável",
    icon: Layers,
    colorClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10 border-amber-500/20",
  },
  goal: {
    label: "Meta",
    icon: Wallet,
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10 border-blue-500/20",
  },
  transaction: {
    label: "Transação",
    icon: TrendingDown,
    colorClass: "text-muted-foreground",
    bgClass: "bg-muted border-border/60",
  },
};

function FinancialCalendarPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const qc = useQueryClient();

  // Mês de navegação (padrão mês atual)
  const [refDate, setRefDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"timeline" | "grid">("timeline");
  const [filterType, setFilterType] = useState<"all" | "deficit" | "expense" | "income">("all");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const opts = { space, userId: user?.id ?? "", coupleId };

  const { data: calendar, isLoading, refetch } = useFinancialCalendar(
    refDate,
    opts,
    !!user
  );

  // Invalidação em tempo real
  useEffect(() => {
    if (!user) return;

    const invalidateCalendar = () => {
      qc.invalidateQueries({ queryKey: ["financial-calendar"] });
      qc.invalidateQueries({ queryKey: ["spending-power"] });
      qc.invalidateQueries({ queryKey: ["financial-snapshot"] });
    };

    const ch = supabase
      .channel("fin-calendar-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, invalidateCalendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "future_bills" }, invalidateCalendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "income_sources" }, invalidateCalendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, invalidateCalendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_cards" }, invalidateCalendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_invoices" }, invalidateCalendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_accounts" }, invalidateCalendar)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  const handlePrevMonth = () => {
    setRefDate(new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1));
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    setRefDate(new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1));
    setSelectedDay(null);
  };

  const handleCurrentMonth = () => {
    setRefDate(new Date());
    setSelectedDay(null);
  };

  // Filtragem de dias e eventos
  const filteredDays = useMemo(() => {
    if (!calendar) return [];
    let list = calendar.days;

    if (selectedDay !== null) {
      list = list.filter((d) => d.day === selectedDay);
    }

    if (filterType === "deficit") {
      list = list.filter((d) => d.hasDeficit);
    } else if (filterType === "expense") {
      list = list.filter((d) => d.totalExpense > 0);
    } else if (filterType === "income") {
      list = list.filter((d) => d.totalIncome > 0);
    }

    return list;
  }, [calendar, selectedDay, filterType]);

  const daysWithEvents = useMemo(() => {
    return filteredDays.filter((d) => d.events.length > 0);
  }, [filteredDays]);

  // Cálculos do grid mensal
  const gridCells = useMemo(() => {
    if (!calendar) return [];
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const firstDayWeekday = new Date(year, month, 1).getDay(); // 0 = Dom
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{
      day: number | null;
      summary: DayFinancialSummary | null;
      isPadding: boolean;
    }> = [];

    // Células de preenchimento inicial
    for (let i = 0; i < firstDayWeekday; i++) {
      cells.push({ day: null, summary: null, isPadding: true });
    }

    // Dias do mês
    for (let d = 1; d <= lastDayOfMonth; d++) {
      const summary = calendar.days.find((day) => day.day === d) || null;
      cells.push({ day: d, summary, isPadding: false });
    }

    return cells;
  }, [calendar, refDate]);

  return (
    <>
      <PageHeader
        title="Calendário Financeiro"
        subtitle="Fluxo diário e projeção de saldo evento a evento"
        fallbackRoute="/app/financas"
      />

      <div className="px-4 py-4 space-y-4 max-w-4xl mx-auto pb-24">
        {/* Seletor de Mês e Controles */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevMonth}
              className="size-9 rounded-full border-border/80"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <span className="text-base sm:text-lg font-bold capitalize px-2 min-w-36 text-center">
              {calendar?.monthLabel || "Carregando..."}
            </span>

            <Button
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
              className="size-9 rounded-full border-border/80"
              aria-label="Próximo mês"
            >
              <ChevronRight className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCurrentMonth}
              className="text-xs text-primary font-medium h-8 rounded-full ml-1"
            >
              Hoje
            </Button>
          </div>

          {/* Alternador de Modo de Visão */}
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-2xl self-start sm:self-auto border border-border/60">
            <button
              onClick={() => setViewMode("timeline")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "timeline"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListOrdered className="size-3.5" />
              <span>Linha do Tempo</span>
            </button>

            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "grid"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="size-3.5" />
              <span>Grade do Mês</span>
            </button>
          </div>
        </div>

        {/* Banner de Diagnóstico: "Teremos dinheiro suficiente quando a conta vencer?" */}
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-3xl" />
        ) : calendar && calendar.hasAnyDeficit ? (
          <Card className="rounded-3xl p-5 border-destructive/30 bg-gradient-to-br from-destructive/[0.08] via-card to-destructive/[0.03] shadow-card">
            <div className="flex items-start gap-3.5">
              <div className="size-11 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0 border border-destructive/20 mt-0.5">
                <AlertTriangle className="size-6" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                    Risco de Déficit
                  </Badge>
                  <span className="text-xs font-medium text-destructive">
                    {calendar.daysWithDeficitCount} {calendar.daysWithDeficitCount === 1 ? "dia crítico" : "dias críticos"}
                  </span>
                </div>
                <h3 className="text-base font-bold text-foreground">
                  Atenção: Saldo insuficiente previsto no mês
                </h3>
                <p className="text-xs text-muted-foreground">
                  O momento mais crítico será no dia <b>{calendar.lowestProjectedBalance.day}</b> de{" "}
                  {calendar.monthLabel}, quando o saldo projetado chegará a{" "}
                  <b className="text-destructive font-bold">
                    {formatBRL(calendar.lowestProjectedBalance.amount)}
                  </b>
                  . Considere antecipar receitas ou renegociar o vencimento das contas para evitar juros.
                </p>
              </div>
            </div>
          </Card>
        ) : calendar ? (
          <Card className="rounded-3xl p-5 border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-card to-emerald-500/[0.02] shadow-card">
            <div className="flex items-start gap-3.5">
              <div className="size-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 mt-0.5">
                <CheckCircle2 className="size-6" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-600 text-white text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                    Fluxo Seguro
                  </Badge>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    100% Coberto
                  </span>
                </div>
                <h3 className="text-base font-bold text-foreground">
                  Você terá dinheiro para todas as contas deste mês!
                </h3>
                <p className="text-xs text-muted-foreground">
                  Nenhuma conta deixará o saldo no negativo na data de vencimento. O menor saldo projetado será de{" "}
                  <b className="text-foreground font-semibold">
                    {formatBRL(calendar.lowestProjectedBalance.amount)}
                  </b>{" "}
                  no dia {calendar.lowestProjectedBalance.day}.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {/* 4 Cards de Métricas Principais */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : calendar ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-3.5 rounded-2xl bg-card border border-border/80 shadow-xs">
              <span className="text-muted-foreground block text-[11px] mb-1">
                Saldo Atual em Caixa
              </span>
              <span className="text-base sm:text-lg font-bold text-foreground block truncate">
                {formatBRL(calendar.currentBankBalance)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-500/[0.05] border border-emerald-500/20 shadow-xs">
              <span className="text-emerald-700 dark:text-emerald-300 block text-[11px] mb-1">
                Total de Entradas
              </span>
              <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 block truncate">
                +{formatBRL(calendar.totalProjectedIncome)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-destructive/[0.05] border border-destructive/20 shadow-xs">
              <span className="text-destructive block text-[11px] mb-1">
                Total de Saídas
              </span>
              <span className="text-base sm:text-lg font-bold text-destructive block truncate">
                -{formatBRL(calendar.totalProjectedExpenses)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-primary/[0.05] border border-primary/20 shadow-xs">
              <span className="text-primary block text-[11px] mb-1">
                Saldo Final Previsto
              </span>
              <span
                className={`text-base sm:text-lg font-bold block truncate ${
                  calendar.projectedEndingBalance < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {formatBRL(calendar.projectedEndingBalance)}
              </span>
            </div>
          </div>
        ) : null}

        {/* Barra de Filtros Rápida */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <Button
            variant={filterType === "all" && selectedDay === null ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilterType("all");
              setSelectedDay(null);
            }}
            className="rounded-full text-xs h-7 px-3 shrink-0"
          >
            Todos os eventos
          </Button>

          {calendar && calendar.hasAnyDeficit && (
            <Button
              variant={filterType === "deficit" ? "destructive" : "outline"}
              size="sm"
              onClick={() => {
                setFilterType("deficit");
                setSelectedDay(null);
              }}
              className="rounded-full text-xs h-7 px-3 shrink-0 text-destructive border-destructive/40"
            >
              ⚠️ Dias com déficit ({calendar.daysWithDeficitCount})
            </Button>
          )}

          <Button
            variant={filterType === "expense" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilterType("expense");
              setSelectedDay(null);
            }}
            className="rounded-full text-xs h-7 px-3 shrink-0"
          >
            Apenas saídas
          </Button>

          <Button
            variant={filterType === "income" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilterType("income");
              setSelectedDay(null);
            }}
            className="rounded-full text-xs h-7 px-3 shrink-0"
          >
            Apenas entradas
          </Button>

          {selectedDay !== null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDay(null)}
              className="rounded-full text-xs h-7 px-2 text-primary"
            >
              Limpar filtro dia {selectedDay} ✕
            </Button>
          )}
        </div>

        {/* ── MODO 1: LINHA DO TEMPO (Timeline Evento a Evento) ───────────── */}
        {viewMode === "timeline" && (
          <div className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-3xl" />
                ))}
              </div>
            ) : daysWithEvents.length === 0 ? (
              <Card className="rounded-3xl p-8 shadow-card text-center border-dashed">
                <EmptyState
                  icon={CalendarIcon}
                  title="Nenhum evento financeiro encontrado"
                  description="Não há contas, salários ou faturas programadas para este filtro no mês selecionado."
                />
              </Card>
            ) : (
              daysWithEvents.map((daySummary) => {
                const dateFormatted = `${String(daySummary.day).padStart(2, "0")}/${String(
                  refDate.getMonth() + 1
                ).padStart(2, "0")}`;

                return (
                  <div key={daySummary.date} className="space-y-2">
                    {/* Cabeçalho do Dia */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          {dateFormatted}
                        </span>
                        <span className="text-xs text-muted-foreground uppercase font-medium">
                          {daySummary.dayOfWeek}
                        </span>
                        {daySummary.isToday && (
                          <Badge className="bg-primary text-white text-[10px] px-2 py-0 rounded-full font-bold">
                            Hoje
                          </Badge>
                        )}
                        {daySummary.hasDeficit && (
                          <Badge variant="destructive" className="text-[10px] px-2 py-0 rounded-full">
                            ⚠️ Déficit no dia
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Saldo fim do dia:{" "}
                        <b
                          className={
                            daySummary.endOfDayBalance < 0
                              ? "text-destructive font-bold"
                              : "text-foreground font-semibold"
                          }
                        >
                          {formatBRL(daySummary.endOfDayBalance)}
                        </b>
                      </div>
                    </div>

                    {/* Lista de Eventos do Dia */}
                    <Card
                      className={`rounded-3xl divide-y divide-border/60 shadow-card overflow-hidden border ${
                        daySummary.hasDeficit
                          ? "border-destructive/40 bg-destructive/[0.01]"
                          : "border-border/80 bg-card"
                      }`}
                    >
                      {daySummary.events.map((event) => {
                        const cfg = EVENT_TYPE_CONFIG[event.sourceType] || EVENT_TYPE_CONFIG.transaction;
                        const Icon = cfg.icon;
                        const isIncome = event.type === "income";

                        return (
                          <div
                            key={event.id}
                            className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              event.isDeficit ? "bg-destructive/[0.06]" : ""
                            }`}
                          >
                            {/* Esquerda: Ícone e Descrição */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`size-10 rounded-2xl flex items-center justify-center shrink-0 border ${cfg.bgClass}`}
                              >
                                <Icon className={`size-5 ${cfg.colorClass}`} />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground truncate">
                                    {event.title}
                                  </span>
                                  {event.isPaidOrRealized && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 font-medium">
                                      Concluído
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span>{cfg.label}</span>
                                  {event.categoryName && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate">{event.categoryName}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Direita: Valor e Saldo Projetado Imediatamente Após */}
                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40 shrink-0">
                              <div
                                className={`text-base font-bold ${
                                  isIncome
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-foreground"
                                }`}
                              >
                                {isIncome ? "+" : "-"}
                                {formatBRL(event.amount)}
                              </div>

                              <div className="text-xs flex items-center gap-1.5 mt-0.5">
                                <span className="text-muted-foreground text-[11px]">
                                  Saldo projetado:
                                </span>
                                <span
                                  className={`font-bold ${
                                    event.isDeficit
                                      ? "text-destructive"
                                      : "text-muted-foreground dark:text-muted-foreground/90"
                                  }`}
                                >
                                  {formatBRL(event.projectedBalanceAfter)}
                                </span>
                              </div>

                              {event.isDeficit && (
                                <span className="text-[10px] text-destructive font-semibold flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="size-3" /> Faltará saldo nesta data
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </Card>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── MODO 2: GRADE DO MÊS (Visão Calendário Mensal) ─────────────── */}
        {viewMode === "grid" && calendar && (
          <Card className="rounded-3xl p-4 sm:p-5 shadow-card border border-border/80">
            {/* Dias da Semana (Dom a Sáb) */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground mb-2">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Células da Grade */}
            <div className="grid grid-cols-7 gap-1.5">
              {gridCells.map((cell, idx) => {
                if (cell.isPadding || !cell.day || !cell.summary) {
                  return (
                    <div
                      key={`pad-${idx}`}
                      className="min-h-16 sm:min-h-20 rounded-2xl bg-muted/20 border border-transparent opacity-30"
                    />
                  );
                }

                const s = cell.summary;
                const isSelected = selectedDay === cell.day;
                const hasEvents = s.events.length > 0;

                return (
                  <button
                    key={s.date}
                    type="button"
                    onClick={() => {
                      if (hasEvents) {
                        setSelectedDay(cell.day === selectedDay ? null : cell.day);
                        setViewMode("timeline");
                      }
                    }}
                    disabled={!hasEvents}
                    className={`min-h-16 sm:min-h-20 p-1.5 sm:p-2 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? "ring-2 ring-primary border-primary bg-primary/[0.06]"
                        : s.hasDeficit
                        ? "bg-destructive/[0.08] border-destructive/40 hover:bg-destructive/[0.12]"
                        : s.isToday
                        ? "bg-primary/[0.06] border-primary/40 font-bold"
                        : hasEvents
                        ? "bg-card border-border/80 hover:bg-muted/40 cursor-pointer"
                        : "bg-muted/20 border-border/30 opacity-60 cursor-default"
                    }`}
                  >
                    {/* Topo da Célula: Dia */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          s.isToday
                            ? "size-5 rounded-full bg-primary text-white flex items-center justify-center text-[11px]"
                            : s.hasDeficit
                            ? "text-destructive font-bold"
                            : "text-foreground"
                        }`}
                      >
                        {cell.day}
                      </span>

                      {s.hasDeficit && (
                        <AlertTriangle className="size-3 text-destructive shrink-0" />
                      )}
                    </div>

                    {/* Meio: Badges de Entradas / Saídas */}
                    {hasEvents && (
                      <div className="space-y-0.5 my-1">
                        {s.totalIncome > 0 && (
                          <div className="text-[9px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                            +{formatBRL(s.totalIncome)}
                          </div>
                        )}
                        {s.totalExpense > 0 && (
                          <div className="text-[9px] sm:text-[10px] text-destructive font-semibold truncate">
                            -{formatBRL(s.totalExpense)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rodapé: Saldo Final do Dia */}
                    <div className="text-[9px] sm:text-[10px] text-right truncate">
                      <span
                        className={`font-semibold ${
                          s.endOfDayBalance < 0
                            ? "text-destructive font-bold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatBRL(s.endOfDayBalance)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground mt-4 pt-3 border-t border-border/60">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-destructive" />
                Dias em vermelho possuem déficit previsto
              </span>
              <span>Clique em qualquer dia com eventos para abrir os detalhes</span>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
