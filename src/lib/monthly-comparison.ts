import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter, type Space } from "@/lib/space";
import { formatBRL, monthRange } from "@/lib/finance";
import { formatDateOnly, getLocalISODate, formatReferenceMonth } from "@/lib/date-utils";
import { differenceInCalendarDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { getFinancialSnapshot } from "@/lib/financial-engine";
import { computeSavingsRate, formatSavingsRate, fetchMonthlyClosing } from "@/lib/monthly-closing";
import { useQuery } from "@tanstack/react-query";

export interface ComparisonSpaceOpts {
  space: Space;
  userId: string;
  coupleId: string | null;
}

export interface MetricComparison {
  monthA: number;
  monthB: number;
  diffAmount: number;
  diffPercent: number;
  diffPercentFormatted: string;
  isPositiveBetter?: boolean;
}

export interface SavingsComparison extends MetricComparison {
  rateMonthA: number;
  rateMonthB: number;
  rateMonthAFormatted: string;
  rateMonthBFormatted: string;
  rateDiff: number;
}

export interface CategoryComparisonItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amountA: number;
  amountB: number;
  diffAmount: number;
  diffPercent: number;
  diffPercentFormatted: string;
  direction: "up" | "down" | "flat";
}

export interface AnomalyItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  historicalAverage: number;
  currentSpent: number;
  excessAmount: number;
  diffPercent: number;
  message: string;
  severity: "warning" | "critical";
}

export interface DuplicateTransactionItem {
  id: string;
  transactionA: any;
  transactionB: any;
  amount: number;
  description: string;
  dateA: string;
  dateB: string;
  daysApart: number;
  reason: string;
}

export interface MonthlyComparisonResult {
  monthA: {
    date: Date;
    key: string;
    label: string;
    yearMonth: string;
  };
  monthB: {
    date: Date;
    key: string;
    label: string;
    yearMonth: string;
  };
  summary: {
    income: MetricComparison;
    expenses: MetricComparison;
    cardInvoices: MetricComparison;
    savings: SavingsComparison;
  };
  categories: CategoryComparisonItem[];
  anomalies: AnomalyItem[];
  potentialDuplicates: DuplicateTransactionItem[];
}

/**
 * Calcula a variação percentual entre dois valores:
 * ((valA - valB) / valB) * 100
 */
export function calculatePercentDiff(valA: number, valB: number): number {
  if (valB === 0) {
    return valA > 0 ? 100 : valA < 0 ? -100 : 0;
  }
  const diff = ((valA - valB) / Math.abs(valB)) * 100;
  return Math.round(diff * 10) / 10;
}

/**
 * Formata percentual com sinal explícito (ex: "+8%", "-5%", "0%")
 */
export function formatPercentDiff(diff: number): string {
  const rounded = Math.round(diff);
  if (rounded > 0) return `+${rounded}%`;
  return `${rounded}%`;
}

/**
 * Normaliza e busca os dados de um mês específico (usando fechamento histórico ou motor financeiro)
 */
async function fetchMonthOverview(
  date: Date,
  opts: ComparisonSpaceOpts
): Promise<{
  totalIncome: number;
  totalExpenses: number;
  cardExpenses: number;
  monthlyBalance: number;
  savingsRate: number;
  byCategory: Record<string, { name: string; color: string; amount: number }>;
  transactions: any[];
}> {
  const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  // 1. Tenta carregar do Fechamento histórico do mês
  const closedRecord = await fetchMonthlyClosing(date, opts);
  const isClosed = closedRecord?.status === "closed";

  // 2. Consulta o Snapshot do Motor Financeiro Canônico
  const snapshot = await getFinancialSnapshot(date, opts);

  const totalIncome = isClosed
    ? Number(closedRecord.total_income || 0)
    : snapshot.summary.totalIncome;

  const totalExpenses = isClosed
    ? Number(closedRecord.total_expenses || 0)
    : snapshot.summary.totalExpenses;

  const cardExpenses = isClosed
    ? Number(closedRecord.breakdown.cardExpenses || 0)
    : snapshot.summary.breakdown.cardExpenses;

  const monthlyBalance = isClosed
    ? Number(closedRecord.monthly_balance || 0)
    : snapshot.summary.monthlyBalance;

  const savingsRate = isClosed
    ? Number(closedRecord.savings_rate || 0)
    : computeSavingsRate(totalIncome, totalExpenses);

  // 3. Consulta transações detalhadas do mês para análise por categoria e duplicidades
  const { start, end } = monthRange(date);

  let qt: any = supabase
    .from("transactions")
    .select("id,description,amount,type,date,category_id,account_id,credit_card_id,categories(id,name,color)")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false });

  qt = applySpaceFilter(qt, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: txData } = await qt;
  const transactions = (txData ?? []) as any[];

  // Agrupa despesas por categoria
  const byCategory: Record<string, { name: string; color: string; amount: number }> = {};

  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const catId = t.category_id || "uncategorized";
    const catName = t.categories?.name || "Sem categoria";
    const catColor = t.categories?.color || "#94A3B8";
    const amt = Number(t.amount || 0);

    if (!byCategory[catId]) {
      byCategory[catId] = { name: catName, color: catColor, amount: 0 };
    }
    byCategory[catId].amount += amt;
  }

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    cardExpenses: Math.round(cardExpenses * 100) / 100,
    monthlyBalance: Math.round(monthlyBalance * 100) / 100,
    savingsRate: Math.round(savingsRate * 100) / 100,
    byCategory,
    transactions,
  };
}

/**
 * Detecta despesas que estão fora do padrão com base na média histórica (3 a 6 meses passados)
 */
async function detectHistoricalAnomalies(
  currentMonthDate: Date,
  currentCategoryExpenses: Record<string, { name: string; color: string; amount: number }>,
  opts: ComparisonSpaceOpts
): Promise<AnomalyItem[]> {
  const anomalies: AnomalyItem[] = [];

  // Considera os 3 meses anteriores ao mês corrente
  const historyStart = startOfMonth(subMonths(currentMonthDate, 3));
  const historyEnd = endOfMonth(subMonths(currentMonthDate, 1));

  let qh: any = supabase
    .from("transactions")
    .select("id,description,amount,type,date,category_id,categories(id,name,color)")
    .gte("date", getLocalISODate(historyStart))
    .lte("date", getLocalISODate(historyEnd))
    .eq("type", "expense");

  qh = applySpaceFilter(qh, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: histData } = await qh;
  const historyTxs = (histData ?? []) as any[];

  // Agrupa gastos passados por categoria e por mês (para calcular média real dos meses com atividade)
  const categoryPastMonthlySums: Record<string, Record<string, number>> = {};
  const categoryMeta: Record<string, { name: string; color: string }> = {};

  for (const t of historyTxs) {
    const catId = t.category_id || "uncategorized";
    const ym = String(t.date || "").substring(0, 7);
    const amt = Number(t.amount || 0);

    if (!categoryPastMonthlySums[catId]) {
      categoryPastMonthlySums[catId] = {};
      categoryMeta[catId] = {
        name: t.categories?.name || "Sem categoria",
        color: t.categories?.color || "#94A3B8",
      };
    }
    categoryPastMonthlySums[catId][ym] = (categoryPastMonthlySums[catId][ym] || 0) + amt;
  }

  // Avalia cada categoria do mês atual contra seu histórico
  for (const [catId, cur] of Object.entries(currentCategoryExpenses)) {
    const pastMonthly = categoryPastMonthlySums[catId];
    if (!pastMonthly) continue;

    const pastMonthsKeys = Object.keys(pastMonthly);
    if (pastMonthsKeys.length === 0) continue;

    const totalPastSum = pastMonthsKeys.reduce((acc, ym) => acc + pastMonthly[ym], 0);
    // Média móvel dos meses anteriores com atividade (mínimo divisor 2 para amortecer oscilações)
    const divisor = Math.max(2, pastMonthsKeys.length);
    const historicalAverage = Math.round((totalPastSum / divisor) * 100) / 100;

    const currentSpent = Math.round(cur.amount * 100) / 100;
    const excessAmount = Math.round((currentSpent - historicalAverage) * 100) / 100;

    // Regra canônica: se o gasto do mês estiver significativamente acima da média (ex: >= 30%)
    // e o excesso financeiro for relevante (>= R$ 50 e média >= R$ 60)
    if (historicalAverage >= 60 && currentSpent > historicalAverage * 1.3 && excessAmount >= 50) {
      const diffPercent = Math.round(((currentSpent - historicalAverage) / historicalAverage) * 100);
      const isCritical = diffPercent >= 50;

      anomalies.push({
        id: `anomaly-${catId}-${diffPercent}`,
        categoryId: catId,
        categoryName: cur.name,
        categoryColor: cur.color,
        historicalAverage,
        currentSpent,
        excessAmount,
        diffPercent,
        message: `${cur.name} está ${diffPercent}% acima da média recente.`,
        severity: isCritical ? "critical" : "warning",
      });
    }
  }

  // Ordena por maior excesso percentual
  return anomalies.sort((a, b) => b.diffPercent - a.diffPercent);
}

/**
 * Detecta possíveis transações duplicadas dentro das movimentações do mês.
 * REGRA ESTRITA: "Não excluir nada automaticamente." Apenas aponta para conferência.
 */
function findPotentialDuplicates(transactions: any[]): DuplicateTransactionItem[] {
  const duplicates: DuplicateTransactionItem[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < transactions.length; i++) {
    for (let j = i + 1; j < transactions.length; j++) {
      const t1 = transactions[i];
      const t2 = transactions[j];

      if (!t1 || !t2 || t1.id === t2.id) continue;

      // 1. Mesmo valor monetário exato
      const amt1 = Math.abs(Number(t1.amount || 0));
      const amt2 = Math.abs(Number(t2.amount || 0));
      if (Math.abs(amt1 - amt2) > 0.001 || amt1 === 0) continue;

      // 2. Mesmo tipo (expense ou income)
      if (t1.type !== t2.type) continue;

      // 3. Proximidade de datas (mesmo dia ou até 2 dias de diferença)
      const d1 = new Date(String(t1.date || "").substring(0, 10) + "T12:00:00");
      const d2 = new Date(String(t2.date || "").substring(0, 10) + "T12:00:00");
      const daysApart = Math.abs(differenceInCalendarDays(d1, d2));
      if (daysApart > 2) continue;

      // 4. Descrição idêntica ou altamente similar
      const desc1 = (t1.description || "").toLowerCase().trim();
      const desc2 = (t2.description || "").toLowerCase().trim();

      const isSameDesc = desc1 === desc2 && desc1.length > 2;
      const isSameCategory = t1.category_id && t1.category_id === t2.category_id;
      const isSameAccountOrCard =
        (t1.account_id && t1.account_id === t2.account_id) ||
        (t1.credit_card_id && t1.credit_card_id === t2.credit_card_id);

      if (isSameDesc || (isSameCategory && isSameAccountOrCard && daysApart <= 1)) {
        const pairKey = [t1.id, t2.id].sort().join("::");
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const reason =
          daysApart === 0
            ? `Cobrança de ${formatBRL(amt1)} realizada duas vezes no mesmo dia (${formatDateOnly(t1.date)})`
            : `Cobrança de ${formatBRL(amt1)} com descrição igual em intervalo de ${daysApart} dia(s)`;

        duplicates.push({
          id: `dup-${t1.id}-${t2.id}`,
          transactionA: t1,
          transactionB: t2,
          amount: amt1,
          description: t1.description || t2.description || "Lançamento",
          dateA: t1.date,
          dateB: t2.date,
          daysApart,
          reason,
        });
      }
    }
  }

  return duplicates;
}

/**
 * Função central de comparação entre dois meses (Mês A x Mês B)
 */
export async function compareTwoMonths(
  dateA: Date,
  dateB: Date,
  opts: ComparisonSpaceOpts
): Promise<MonthlyComparisonResult> {
  const [dataA, dataB] = await Promise.all([
    fetchMonthOverview(dateA, opts),
    fetchMonthOverview(dateB, opts),
  ]);

  const ymA = `${dateA.getFullYear()}-${String(dateA.getMonth() + 1).padStart(2, "0")}`;
  const ymB = `${dateB.getFullYear()}-${String(dateB.getMonth() + 1).padStart(2, "0")}`;

  // 1. Resumo Comparativo: Receitas
  const diffIncome = dataA.totalIncome - dataB.totalIncome;
  const pctIncome = calculatePercentDiff(dataA.totalIncome, dataB.totalIncome);
  const incomeMetric: MetricComparison = {
    monthA: dataA.totalIncome,
    monthB: dataB.totalIncome,
    diffAmount: Math.round(diffIncome * 100) / 100,
    diffPercent: pctIncome,
    diffPercentFormatted: formatPercentDiff(pctIncome),
    isPositiveBetter: true,
  };

  // 2. Resumo Comparativo: Despesas
  const diffExpenses = dataA.totalExpenses - dataB.totalExpenses;
  const pctExpenses = calculatePercentDiff(dataA.totalExpenses, dataB.totalExpenses);
  const expensesMetric: MetricComparison = {
    monthA: dataA.totalExpenses,
    monthB: dataB.totalExpenses,
    diffAmount: Math.round(diffExpenses * 100) / 100,
    diffPercent: pctExpenses,
    diffPercentFormatted: formatPercentDiff(pctExpenses),
    isPositiveBetter: false,
  };

  // 3. Resumo Comparativo: Cartões
  const diffCards = dataA.cardExpenses - dataB.cardExpenses;
  const pctCards = calculatePercentDiff(dataA.cardExpenses, dataB.cardExpenses);
  const cardsMetric: MetricComparison = {
    monthA: dataA.cardExpenses,
    monthB: dataB.cardExpenses,
    diffAmount: Math.round(diffCards * 100) / 100,
    diffPercent: pctCards,
    diffPercentFormatted: formatPercentDiff(pctCards),
    isPositiveBetter: false,
  };

  // 4. Resumo Comparativo: Economia e Taxa de Poupança
  const diffSavings = dataA.monthlyBalance - dataB.monthlyBalance;
  const pctSavings = calculatePercentDiff(dataA.monthlyBalance, dataB.monthlyBalance);
  const rateDiff = Math.round((dataA.savingsRate - dataB.savingsRate) * 100) / 100;
  const savingsMetric: SavingsComparison = {
    monthA: dataA.monthlyBalance,
    monthB: dataB.monthlyBalance,
    diffAmount: Math.round(diffSavings * 100) / 100,
    diffPercent: pctSavings,
    diffPercentFormatted: formatPercentDiff(pctSavings),
    isPositiveBetter: true,
    rateMonthA: dataA.savingsRate,
    rateMonthB: dataB.savingsRate,
    rateMonthAFormatted: formatSavingsRate(dataA.savingsRate),
    rateMonthBFormatted: formatSavingsRate(dataB.savingsRate),
    rateDiff,
  };

  // 5. Comparação por Categoria (Mercado +14%, Combustível -18%, etc.)
  const allCatIds = new Set([
    ...Object.keys(dataA.byCategory),
    ...Object.keys(dataB.byCategory),
  ]);

  const categories: CategoryComparisonItem[] = [];

  for (const catId of allCatIds) {
    const itemA = dataA.byCategory[catId];
    const itemB = dataB.byCategory[catId];

    const amountA = Math.round((itemA?.amount ?? 0) * 100) / 100;
    const amountB = Math.round((itemB?.amount ?? 0) * 100) / 100;
    const diff = Math.round((amountA - amountB) * 100) / 100;
    const pct = calculatePercentDiff(amountA, amountB);

    const name = itemA?.name || itemB?.name || "Sem categoria";
    const color = itemA?.color || itemB?.color || "#94A3B8";

    categories.push({
      categoryId: catId,
      categoryName: name,
      categoryColor: color,
      amountA,
      amountB,
      diffAmount: diff,
      diffPercent: pct,
      diffPercentFormatted: formatPercentDiff(pct),
      direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
    });
  }

  // Ordena por maior valor gasto no mês de referência (Mês A)
  categories.sort((a, b) => b.amountA - a.amountA);

  // 6. Detecção de Anomalias baseada no histórico recente
  const anomalies = await detectHistoricalAnomalies(dateA, dataA.byCategory, opts);

  // 7. Detecção de possíveis duplicidades (sem excluir nada automaticamente)
  const potentialDuplicates = findPotentialDuplicates(dataA.transactions);

  return {
    monthA: {
      date: dateA,
      key: ymA,
      label: formatReferenceMonth(ymA),
      yearMonth: ymA,
    },
    monthB: {
      date: dateB,
      key: ymB,
      label: formatReferenceMonth(ymB),
      yearMonth: ymB,
    },
    summary: {
      income: incomeMetric,
      expenses: expensesMetric,
      cardInvoices: cardsMetric,
      savings: savingsMetric,
    },
    categories,
    anomalies,
    potentialDuplicates,
  };
}

/**
 * Hook React Query para a Comparação Mensal e Anomalias
 */
export function useMonthlyComparison(
  dateA: Date,
  dateB: Date,
  opts: ComparisonSpaceOpts
) {
  const keyA = `${dateA.getFullYear()}-${dateA.getMonth()}`;
  const keyB = `${dateB.getFullYear()}-${dateB.getMonth()}`;

  return useQuery({
    queryKey: ["monthly-comparison", keyA, keyB, opts.space, opts.coupleId, opts.userId],
    queryFn: () => compareTwoMonths(dateA, dateB, opts),
    enabled: !!opts.userId,
    staleTime: 1000 * 30, // 30s
  });
}
