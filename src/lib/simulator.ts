// Simulador de Despesas — cálculo puro
export type PaymentMethod =
  | "pix"
  | "cash"
  | "debit"
  | "credit"
  | "credit_installments"
  | "boleto"
  | "financing"
  | "other";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Cartão de crédito",
  credit_installments: "Cartão parcelado",
  boleto: "Boleto",
  financing: "Financiamento",
  other: "Outro",
};

export interface SimulationInput {
  title: string;
  amount: number;
  paymentMethod: PaymentMethod;
  installments: number;
  interestEnabled: boolean;
  interestRate?: number; // % ao mês
  purchaseDate: string; // yyyy-mm-dd
  firstPaymentDate?: string; // yyyy-mm-dd
  card?: { closing_day: number; due_day: number } | null;
}

export interface FinancialContext {
  monthIncome: number;
  monthExpense: number;
  monthlyBudget?: number; // opcional
  existingUpcomingInstallments?: number[]; // parcelas já existentes por mês (12)
}

export type RiskLevel = "seguro" | "atencao" | "arriscado" | "critico";

export interface SimulationResult {
  installmentAmount: number;
  totalCost: number;
  monthlyImpact: number[]; // 12 meses (mês 0 = mês atual)
  monthLabels: string[];
  balanceBefore: number;
  balanceAfter: number;
  expenseBefore: number;
  expenseAfter: number;
  budgetPctBefore: number;
  budgetPctAfter: number;
  cardImpact: number; // impacto na próxima fatura
  risk: RiskLevel;
  riskMessage: string;
  suggestion: string;
}

function monthKey(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "short" });
}

function pricePayment(principal: number, ratePct: number, n: number): number {
  const i = ratePct / 100;
  if (i === 0) return principal / n;
  return (principal * i) / (1 - Math.pow(1 + i, -n));
}

export function simulate(input: SimulationInput, ctx: FinancialContext): SimulationResult {
  const now = new Date();
  const labels: string[] = [];
  for (let m = 0; m < 12; m++) {
    labels.push(monthKey(new Date(now.getFullYear(), now.getMonth() + m, 1)));
  }

  const n = Math.max(1, input.installments || 1);
  let installmentAmount = input.amount / n;
  let totalCost = input.amount;
  if (input.interestEnabled && input.interestRate && input.interestRate > 0) {
    installmentAmount = pricePayment(input.amount, input.interestRate, n);
    totalCost = installmentAmount * n;
  }

  const monthlyImpact = Array(12).fill(0) as number[];
  const existing = ctx.existingUpcomingInstallments ?? [];

  let startMonth = 0;
  if (input.paymentMethod === "credit" || input.paymentMethod === "credit_installments") {
    // impacta primeira fatura relativa ao fechamento
    if (input.card) {
      const day = now.getDate();
      startMonth = day > input.card.closing_day ? 1 : 0;
    } else {
      startMonth = 0;
    }
  } else if (input.paymentMethod === "boleto" && input.firstPaymentDate) {
    const first = new Date(input.firstPaymentDate);
    startMonth = Math.max(
      0,
      (first.getFullYear() - now.getFullYear()) * 12 + (first.getMonth() - now.getMonth()),
    );
  } else if (input.paymentMethod === "financing" && input.firstPaymentDate) {
    const first = new Date(input.firstPaymentDate);
    startMonth = Math.max(
      0,
      (first.getFullYear() - now.getFullYear()) * 12 + (first.getMonth() - now.getMonth()),
    );
  }

  const isImmediate =
    input.paymentMethod === "pix" ||
    input.paymentMethod === "cash" ||
    input.paymentMethod === "debit";

  if (isImmediate) {
    monthlyImpact[0] += input.amount;
  } else {
    for (let k = 0; k < n; k++) {
      const m = startMonth + k;
      if (m < 12) monthlyImpact[m] += installmentAmount;
    }
  }

  const impactThisMonth = monthlyImpact[0] + (existing[0] ?? 0);
  const expenseBefore = ctx.monthExpense;
  const expenseAfter = ctx.monthExpense + monthlyImpact[0];
  const balanceBefore = ctx.monthIncome - ctx.monthExpense;
  const balanceAfter = balanceBefore - monthlyImpact[0];

  const budget = ctx.monthlyBudget && ctx.monthlyBudget > 0 ? ctx.monthlyBudget : ctx.monthIncome;
  const budgetPctBefore = budget > 0 ? (expenseBefore / budget) * 100 : 0;
  const budgetPctAfter = budget > 0 ? (expenseAfter / budget) * 100 : 0;

  const cardImpact =
    input.paymentMethod === "credit" || input.paymentMethod === "credit_installments"
      ? installmentAmount
      : 0;

  // Risco
  let risk: RiskLevel = "seguro";
  const incomeRatio = ctx.monthIncome > 0 ? monthlyImpact[0] / ctx.monthIncome : 1;
  if (balanceAfter < 0) risk = "critico";
  else if (budgetPctAfter >= 95 || incomeRatio >= 0.4) risk = "arriscado";
  else if (budgetPctAfter >= 75 || incomeRatio >= 0.2) risk = "atencao";

  const riskMessages: Record<RiskLevel, string> = {
    seguro: "Essa compra parece caber no seu orçamento atual.",
    atencao: "Essa compra vai reduzir bastante sua sobra mensal. Avalie se é prioridade.",
    arriscado: "Essa compra pode comprometer seu orçamento dos próximos meses.",
    critico: "Essa compra pode deixar seu saldo negativo ou ultrapassar seu limite financeiro.",
  };

  const suggestions: string[] = [];
  if (isImmediate && input.amount > ctx.monthIncome * 0.15) {
    suggestions.push("Considere parcelar no cartão para diluir o impacto no mês.");
  }
  if (
    (input.paymentMethod === "credit_installments" || input.paymentMethod === "financing") &&
    n < 12 &&
    installmentAmount > ctx.monthIncome * 0.2
  ) {
    suggestions.push("Parcelar em mais vezes reduz o impacto mensal, mas prolonga a dívida.");
  }
  if (risk === "arriscado" || risk === "critico") {
    suggestions.push("Aguardar até o próximo mês pode ser mais seguro.");
  }
  if (input.paymentMethod === "credit_installments" && n > 12) {
    suggestions.push("Muitas parcelas comprometem seu orçamento por muito tempo.");
  }
  if (suggestions.length === 0) {
    suggestions.push("Essa compra parece equilibrada com sua situação atual.");
  }

  return {
    installmentAmount,
    totalCost,
    monthlyImpact,
    monthLabels: labels,
    balanceBefore,
    balanceAfter,
    expenseBefore,
    expenseAfter,
    budgetPctBefore,
    budgetPctAfter,
    cardImpact,
    risk,
    riskMessage: riskMessages[risk],
    suggestion: suggestions.join(" "),
  };
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  seguro: "#22c55e",
  atencao: "#eab308",
  arriscado: "#f97316",
  critico: "#ef4444",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  seguro: "Seguro",
  atencao: "Atenção",
  arriscado: "Arriscado",
  critico: "Crítico",
};
