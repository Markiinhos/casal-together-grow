import type { SpaceOpts } from "@/lib/finance";
import { getFinancialSnapshot } from "@/lib/financial-engine";

export interface MonthlySummaryBreakdown {
  structuredIncome: number;
  extraIncome: number;
  fixedExpenses: number;
  variableExpenses: number;
  subscriptions: number;
  cardExpenses: number;
  otherExpenses: number;
}

export interface HomeMonthlySummary {
  income: number;
  expenses: number;
  accountsBalance: number;
  monthlyBalance: number;
  breakdown: MonthlySummaryBreakdown;
}

/**
 * Fonte centralizada para o Resumo do Mês da Home e do Financeiro Central.
 * Delega diretamente para o Motor Financeiro Canônico (src/lib/financial-engine).
 */
export async function getHomeMonthlySummary(
  ref: Date,
  opts: SpaceOpts
): Promise<HomeMonthlySummary> {
  const snapshot = await getFinancialSnapshot(ref, {
    space: opts.space,
    userId: opts.userId,
    coupleId: opts.coupleId,
  });

  return {
    income: snapshot.summary.totalIncome,
    expenses: snapshot.summary.totalExpenses,
    accountsBalance: snapshot.accounts.total,
    monthlyBalance: snapshot.summary.monthlyBalance,
    breakdown: snapshot.summary.breakdown,
  };
}
