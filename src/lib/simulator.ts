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
  card?: { closing_day: number; due_day: number; limit_amount?: number; used_amount?: number } | null;
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
  let purchaseDay = now.getDate();
  let purchaseMonthOffset = 0;
  if (input.purchaseDate) {
    const pDate = new Date(input.purchaseDate);
    // Using UTC to avoid timezone shift on YYYY-MM-DD strings
    purchaseDay = pDate.getUTCDate();
    purchaseMonthOffset = (pDate.getUTCFullYear() - now.getFullYear()) * 12 + (pDate.getUTCMonth() - now.getMonth());
  }

  if (input.paymentMethod === "credit" || input.paymentMethod === "credit_installments") {
    if (input.card && input.card.closing_day) {
      startMonth = purchaseMonthOffset + (purchaseDay >= input.card.closing_day ? 1 : 0);
    } else {
      startMonth = purchaseMonthOffset;
    }
    startMonth = Math.max(0, startMonth);
  } else if ((input.paymentMethod === "boleto" || input.paymentMethod === "financing") && input.firstPaymentDate) {
    const first = new Date(input.firstPaymentDate);
    startMonth = Math.max(
      0,
      (first.getUTCFullYear() - now.getFullYear()) * 12 + (first.getUTCMonth() - now.getMonth())
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
  let riskMessage = "Essa compra parece caber no seu orçamento atual.";
  const isCredit = input.paymentMethod === "credit" || input.paymentMethod === "credit_installments";
  
  const cardLimitExceeded = isCredit && input.card?.limit_amount 
    ? ((input.card.used_amount || 0) + input.amount > input.card.limit_amount) 
    : false;

  if (balanceAfter < 0) {
    risk = "critico";
    riskMessage = "Crítico: Essa compra deixará seu saldo projetado negativo.";
  } else if (cardLimitExceeded) {
    risk = "critico";
    riskMessage = "Crítico: Essa compra ultrapassará o limite do seu cartão de crédito.";
  } else if (budgetPctAfter > 100) {
    risk = "critico";
    riskMessage = `Crítico: O orçamento mensal será excedido (${Math.round(budgetPctAfter)}%).`;
  } else if (budgetPctAfter >= 85) {
    risk = "arriscado";
    riskMessage = `Arriscado: A compra elevará o uso do orçamento para ${Math.round(budgetPctAfter)}% e comprometerá meses futuros.`;
  } else if (budgetPctAfter >= 70) {
    risk = "atencao";
    riskMessage = `Atenção: Seu orçamento chegará a ${Math.round(budgetPctAfter)}%. Avalie se é uma prioridade agora.`;
  }

  if (risk === "arriscado" && n > 6) {
    riskMessage += ` Terá impacto prolongado por ${n} meses.`;
  }

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
    riskMessage,
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
