import { monthRange } from "@/lib/finance";
import { getMonthlyActuals } from "./actuals";
import { getMonthlyForecast } from "./forecast";
import { getMonthlyCommitments } from "./commitments";
import { getAccountsBalance, getNetWorth } from "./patrimony";
import type {
  SpaceFilterOpts,
  FinancialSnapshot,
  MonthlyActuals,
  MonthlyForecast,
  MonthlyCommitments,
  AccountsBalance,
  NetWorth,
  ConsolidatedSummary,
} from "./types";

/**
 * Função pura para reconciliar e consolidar os 4 pilares em um FinancialSnapshot unificado.
 */
export function computeFinancialSnapshotFromComponents({
  refDate,
  actuals,
  forecast,
  commitments,
  accounts,
  patrimony,
}: {
  refDate: Date;
  actuals: MonthlyActuals;
  forecast: MonthlyForecast;
  commitments: MonthlyCommitments;
  accounts: AccountsBalance;
  patrimony: NetWorth;
}): FinancialSnapshot {
  const { start, end } = monthRange(refDate);
  const monthKey = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}`;

  // 1. Receitas Consolidadas
  // Receita estrutural prevista + Receitas extras realizadas (deduplicando salários já materializados)
  const structuredIncome = forecast.plannedIncome;
  const structuredNames = forecast.incomeSources
    .map((s) => s.name.toLowerCase().trim())
    .filter(Boolean);

  let extraIncome = 0;
  for (const t of actuals.incomeTransactions) {
    const desc = (t.description || "").toLowerCase().trim();
    const isMaterialized = structuredNames.some(
      (name) => desc === name || desc.includes(name) || name.includes(desc)
    );
    if (!isMaterialized) {
      extraIncome += t.amount;
    }
  }

  const totalIncome = Math.round((structuredIncome + extraIncome) * 100) / 100;

  // 2. Despesas Consolidadas
  const fixedExpenses = forecast.fixedBills;
  const variableExpenses = forecast.variableExpenses;
  const subscriptions = forecast.subscriptions;
  const cardExpenses = commitments.currentMonthInvoices;

  // Outras despesas reais de conta (deduplicando itens fixos e categorias já orçadas em variáveis)
  const fixedNames = forecast.fixedBillsList
    .map((b) => b.title.toLowerCase().trim())
    .filter(Boolean);
  const varCatIds = new Set(
    forecast.variableExpensesList.map((v) => v.categoryId).filter(Boolean)
  );
  const varNames = forecast.variableExpensesList
    .map((v) => v.name.toLowerCase().trim())
    .filter(Boolean);

  let otherExpenses = 0;
  for (const t of actuals.expenseTransactions) {
    // Pagamentos de fatura e compras no cartão já foram excluídos em getMonthlyActuals
    const desc = (t.description || "").toLowerCase().trim();

    const isFixed = fixedNames.some(
      (name) => desc === name || desc.includes(name) || name.includes(desc)
    );
    if (isFixed) continue;

    const isVar =
      (t.categoryId && varCatIds.has(t.categoryId)) ||
      varNames.some((name) => desc === name || desc.includes(name));
    if (isVar) continue;

    otherExpenses += t.amount;
  }

  otherExpenses = Math.round(otherExpenses * 100) / 100;

  const totalExpenses =
    Math.round(
      (fixedExpenses + variableExpenses + subscriptions + cardExpenses + otherExpenses) * 100
    ) / 100;

  const monthlyBalance = Math.round((totalIncome - totalExpenses) * 100) / 100;
  const cashOnHand = accounts.total;

  const summary: ConsolidatedSummary = {
    totalIncome,
    totalExpenses,
    monthlyBalance,
    cashOnHand,
    breakdown: {
      structuredIncome,
      extraIncome: Math.round(extraIncome * 100) / 100,
      fixedExpenses,
      variableExpenses,
      subscriptions,
      cardExpenses,
      otherExpenses,
    },
  };

  return {
    refDate,
    monthKey,
    startDate: start,
    endDate: end,
    actuals,
    forecast,
    commitments,
    accounts,
    patrimony,
    summary,
  };
}

/**
 * Consulta unificada e canônica do MOTOR FINANCEIRO.
 * Garante que todas as telas (Home, Financeiro, Projeção, Estrutura)
 * utilizem exatamente as mesmas queries e a mesma lógica de reconciliação.
 */
export async function getFinancialSnapshot(
  ref: Date,
  opts: SpaceFilterOpts
): Promise<FinancialSnapshot> {
  // Executa todas as consultas dos pilares em paralelo de forma eficiente
  const [actuals, forecast, commitments, accounts, patrimony] = await Promise.all([
    getMonthlyActuals(ref, opts),
    getMonthlyForecast(ref, opts),
    getMonthlyCommitments(ref, opts),
    getAccountsBalance(opts),
    getNetWorth(opts),
  ]);

  return computeFinancialSnapshotFromComponents({
    refDate: ref,
    actuals,
    forecast,
    commitments,
    accounts,
    patrimony,
  });
}
