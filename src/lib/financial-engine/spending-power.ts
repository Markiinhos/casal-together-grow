import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import { monthRange } from "@/lib/finance";
import { getFinancialSnapshot } from "./snapshot";
import type { SpaceFilterOpts, FinancialSnapshot } from "./types";
import { useQuery } from "@tanstack/react-query";

export interface SpendingPowerBreakdown {
  /** Receita disponível prevista do mês (fontes ativas normalizadas + receitas extras realizadas) */
  plannedIncome: number;
  /** Despesas obrigatórias totais (fixas recorrentes + assinaturas + contas futuras pontuais) */
  mandatoryExpenses: number;
  /** Contas fixas recorrentes */
  fixedBills: number;
  /** Assinaturas ativas */
  subscriptions: number;
  /** Contas pontuais com vencimento no mês */
  futureBillsOnce: number;
  /** Compromissos (faturas de cartão de crédito e parcelas do período) */
  commitments: number;
  /** Reservas e metas definidas (valor reservado para metas / reserva planejada) */
  goalsAndReserves: number;
  /** Detalhe da reserva planejada do plano do mês */
  plannedReserve: number;
  /** Detalhe das metas planejadas do plano do mês */
  plannedGoals: number;
  /** Aportes realizados em metas no mês */
  monthGoalContributions: number;
  /** Despesas variáveis / gastos do dia a dia realizados à vista (Pix, débito, etc.) */
  variableSpent: number;
  /** Orçamento de despesas variáveis cadastradas na estrutura (informativo) */
  variableBudget: number;
  /** Total de deduções consideradas no mês */
  totalDeductions: number;
}

export interface SpendingPower {
  /** Valor livre: quanto ainda pode ser gasto no mês sem comprometer o orçamento */
  availableToSpend: number;
  /** Disponível por semana */
  perWeek: number;
  /** Disponível por dia */
  perDay: number;
  /** Dias restantes no mês incluindo hoje */
  daysRemaining: number;
  /** Semanas restantes até o final do mês */
  weeksRemaining: number;
  /** Nome do mês de referência (ex: "outubro") */
  monthName: string;
  /** Ano de referência */
  year: number;
  /** Último dia do mês */
  lastDayOfMonth: number;
  /** Indica se o valor disponível está no negativo */
  isDeficit: boolean;
  /** Detalhamento de cada item do cálculo */
  breakdown: SpendingPowerBreakdown;
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

/**
 * Função pura para calcular o "Quanto podemos gastar?" a partir do snapshot e dados de metas/planejamento.
 */
export function computeSpendingPowerFromSnapshot({
  refDate,
  snapshot,
  planData,
  monthGoalContributions = 0,
}: {
  refDate: Date;
  snapshot: FinancialSnapshot;
  planData?: {
    planned_reserve?: number | null;
    planned_goals?: number | null;
    expected_income?: number | null;
  } | null;
  monthGoalContributions?: number;
}): SpendingPower {
  // 1. Receita disponível prevista
  let plannedIncome = snapshot.summary.totalIncome;
  if (plannedIncome === 0 && planData?.expected_income) {
    plannedIncome = Number(planData.expected_income || 0);
  }

  // 2. Despesas obrigatórias (Fixas + Assinaturas + Contas futuras pontuais)
  const fixedBills = snapshot.forecast.fixedBills;
  const subscriptions = snapshot.forecast.subscriptions;
  const futureBillsOnce = snapshot.forecast.futureBillsOnce;
  const mandatoryExpenses = Math.round((fixedBills + subscriptions + futureBillsOnce) * 100) / 100;

  // 3. Compromissos (Faturas do cartão e parcelas do período)
  const commitments = Math.round(snapshot.commitments.currentMonthInvoices * 100) / 100;

  // 4. Reservas / Metas definidas
  const plannedReserve = Number(planData?.planned_reserve || 0);
  const plannedGoals = Number(planData?.planned_goals || 0);
  const planTotal = plannedReserve + plannedGoals;
  const goalsAndReserves = Math.round(Math.max(planTotal, monthGoalContributions) * 100) / 100;

  // 5. Despesas variáveis já realizadas à vista (não-cartão, não-transferência, não-pagamento de fatura)
  const variableSpent = Math.round(snapshot.summary.breakdown.otherExpenses * 100) / 100;
  const variableBudget = Math.round(snapshot.forecast.variableExpenses * 100) / 100;

  // Total de deduções acumuladas
  const totalDeductions = Math.round(
    (mandatoryExpenses + commitments + goalsAndReserves + variableSpent) * 100
  ) / 100;

  // 6. VALOR LIVRE (Disponível para gastar)
  const availableToSpend = Math.round((plannedIncome - totalDeductions) * 100) / 100;
  const isDeficit = availableToSpend < 0;

  // 7. Cálculos de dias e semanas restantes
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth();
  const currentDay = refDate.getDate();
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Dias restantes no mês (incluindo o dia de hoje)
  const daysRemaining = Math.max(1, lastDayOfMonth - currentDay + 1);
  const weeksRemaining = Math.max(1, Math.round((daysRemaining / 7) * 10) / 10);

  // Por dia
  const perDay = availableToSpend > 0
    ? Math.round((availableToSpend / daysRemaining) * 100) / 100
    : 0;

  // Por semana: se restam menos de 7 dias, o limite da semana é o saldo total restante até o fim do mês
  const perWeek = availableToSpend > 0
    ? (daysRemaining <= 7 ? availableToSpend : Math.round((perDay * 7) * 100) / 100)
    : 0;

  return {
    availableToSpend,
    perWeek,
    perDay,
    daysRemaining,
    weeksRemaining,
    monthName: MONTH_NAMES[currentMonth] || "mês",
    year: currentYear,
    lastDayOfMonth,
    isDeficit,
    breakdown: {
      plannedIncome: Math.round(plannedIncome * 100) / 100,
      mandatoryExpenses,
      fixedBills,
      subscriptions,
      futureBillsOnce,
      commitments,
      goalsAndReserves,
      plannedReserve,
      plannedGoals,
      monthGoalContributions: Math.round(monthGoalContributions * 100) / 100,
      variableSpent,
      variableBudget,
      totalDeductions,
    },
  };
}

/**
 * Consulta unificada para obter o indicador dinâmico "Quanto podemos gastar?".
 */
export async function getSpendingPower(
  ref: Date,
  opts: SpaceFilterOpts
): Promise<SpendingPower> {
  const targetMonthStart = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-01`;
  const { start, end } = monthRange(ref);

  const [snapshot, planRes, contribsRes, goalsRes] = await Promise.all([
    getFinancialSnapshot(ref, opts),

    // 1. Planejamento financeiro mensal
    (async () => {
      let q = supabase
        .from("monthly_financial_plans")
        .select("planned_reserve, planned_goals, expected_income, spending_limit")
        .eq("reference_month", targetMonthStart)
        .eq("status", "active");
      q = applySpaceFilter(q, opts);
      const { data } = await q.maybeSingle();
      return data;
    })(),

    // 2. Aportes em metas no mês de referência
    (async () => {
      let q = supabase
        .from("goal_contributions")
        .select("id, amount, date, user_id, goal_id")
        .gte("date", start)
        .lte("date", end);

      if (opts.space === "private") {
        q = q.eq("user_id", opts.userId);
      }
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // 3. Metas ativas do espaço
    (async () => {
      let q = supabase
        .from("goals")
        .select("id, status")
        .eq("status", "active");
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),
  ]);

  const activeGoalIds = new Set((goalsRes ?? []).map((g) => g.id));
  const monthGoalContribs = (contribsRes ?? [])
    .filter((c) => activeGoalIds.has(c.goal_id))
    .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

  return computeSpendingPowerFromSnapshot({
    refDate: ref,
    snapshot,
    planData: planRes,
    monthGoalContributions: monthGoalContribs,
  });
}

/**
 * Hook React Query para "Quanto podemos gastar?".
 * Reage automaticamente às invalidações em tempo real de transações, faturas e contas.
 */
export function useSpendingPower(
  ref: Date = new Date(),
  opts: SpaceFilterOpts,
  enabled: boolean = true
) {
  const monthKey = `${ref.getFullYear()}-${ref.getMonth()}`;
  return useQuery({
    queryKey: ["spending-power", monthKey, opts.space, opts.coupleId, opts.userId],
    queryFn: () => getSpendingPower(ref, opts),
    enabled: enabled && !!opts.userId,
    staleTime: 1000 * 15, // 15s cache
  });
}
