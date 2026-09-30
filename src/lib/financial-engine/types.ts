import type { Space } from "@/lib/space";

export interface SpaceFilterOpts {
  space: Space;
  userId: string;
  coupleId: string | null;
}

/**
 * 1. REALIZADO (Actuals)
 * Transações efetivamente liquidadas/ocorridas no mês.
 * Exclusões estritas:
 * - Pagamentos de faturas (is_card_payment)
 * - Compras no cartão de crédito (pertencem ao ciclo de faturas/compromissos)
 * - Transferências internas
 * - Transações canceladas/excluídas
 * - Movimentações de patrimônio (investimentos e amortização de dívidas)
 */
export interface ActualTransactionItem {
  id: string;
  amount: number;
  description: string | null;
  date: string;
  type: "income" | "expense";
  categoryId: string | null;
  categoryName?: string;
  accountId: string | null;
  isCardPayment: boolean;
  creditCardId: string | null;
}

export interface MonthlyActuals {
  totalIncome: number;
  totalExpenses: number;
  netActual: number;
  incomeCount: number;
  expenseCount: number;
  incomeTransactions: ActualTransactionItem[];
  expenseTransactions: ActualTransactionItem[];
  byCategory: Record<string, number>;
  cardInvoicePaymentsTotal: number; // Informativo: total pago em faturas de cartão no mês
}

/**
 * 2. PREVISTO (Forecast)
 * Estrutura orçamentária e previsões recorrentes para o mês.
 * Inclui:
 * - Receitas previstas ativas (income_sources normalizadas)
 * - Despesas fixas ativas (future_bills recorrentes)
 * - Despesas variáveis orçadas ativas (variable_expenses)
 * - Assinaturas mensais ativas (subscriptions)
 * - Contas pontuais com vencimento no mês (future_bills com recurrence='once')
 */
export interface ForecastIncomeItem {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  monthlyAmount: number;
  isActive: boolean;
}

export interface ForecastBillItem {
  id: string;
  title: string;
  amount: number;
  recurrence: string;
  monthlyAmount: number;
  dueDate?: string | null;
  categoryId?: string | null;
}

export interface ForecastVariableItem {
  id: string;
  name: string;
  estimatedAmount: number;
  categoryId?: string | null;
}

export interface MonthlyForecast {
  plannedIncome: number;
  fixedBills: number;
  variableExpenses: number;
  subscriptions: number;
  futureBillsOnce: number;
  totalForecastExpenses: number;
  netForecast: number;
  incomeSources: ForecastIncomeItem[];
  fixedBillsList: ForecastBillItem[];
  variableExpensesList: ForecastVariableItem[];
  subscriptionsTotal: number;
}

/**
 * 3. COMPROMETIDO (Commitments)
 * Obrigações de cartões de crédito e parcelamentos.
 * - Faturas do mês de referência (fechadas no banco ou calculadas por ciclo)
 * - Parcelas futuras vincendas (meses seguintes)
 */
export interface CardCommitmentItem {
  cardId: string;
  cardName: string;
  bank?: string | null;
  closingDay: number;
  dueDay: number;
  currentInvoiceAmount: number;
  isInvoiceClosed: boolean;
  futureInstallmentsAmount: number;
  totalCardCommitted: number;
}

export interface MonthlyCommitments {
  currentMonthInvoices: number;
  futureInstallments: number;
  totalCommitments: number;
  cards: CardCommitmentItem[];
}

/**
 * 4. PATRIMÔNIO (Patrimony & Net Worth)
 * Recursos acumulados e passivos totais.
 * ESTRITAMENTE ISOLADO DO FLUXO DE CAIXA MENSAL.
 */
export interface AccountBalanceItem {
  id: string;
  name: string;
  type: string | null;
  balance: number;
  color?: string | null;
  icon?: string | null;
  source: string;
}

export interface AccountsBalance {
  total: number;
  accounts: AccountBalanceItem[];
}

export interface InvestmentItem {
  id: string;
  name: string;
  institution: string;
  investmentType: string;
  amount: number;
  investmentDate: string;
  responsibleUserId?: string | null;
}

export interface DebtItem {
  id: string;
  creditor: string;
  description: string;
  originalAmount: number;
  currentAmount: number;
  debtDate: string;
  responsibleUserId?: string | null;
}

export interface NetWorth {
  accountsBalance: number;
  investments: number;
  otherAssets: number;
  totalAssets: number;
  debts: number;
  netWorth: number;
  investmentsList: InvestmentItem[];
  debtsList: DebtItem[];
}

/**
 * 5. CONSOLIDADO (Financial Snapshot)
 * Fonte Única da Verdade para Home, Financeiro e Projeção.
 * Elimina qualquer cálculo concorrente.
 */
export interface ConsolidatedSummary {
  totalIncome: number;
  totalExpenses: number;
  monthlyBalance: number;
  cashOnHand: number;
  breakdown: {
    structuredIncome: number;
    extraIncome: number;
    fixedExpenses: number;
    variableExpenses: number;
    subscriptions: number;
    cardExpenses: number;
    otherExpenses: number;
  };
}

export interface FinancialSnapshot {
  refDate: Date;
  monthKey: string; // YYYY-MM
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  actuals: MonthlyActuals;
  forecast: MonthlyForecast;
  commitments: MonthlyCommitments;
  accounts: AccountsBalance;
  patrimony: NetWorth;
  summary: ConsolidatedSummary;
}
