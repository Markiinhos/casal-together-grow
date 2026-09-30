// Helpers financeiros — cálculos e queries reutilizáveis
import { supabase } from "@/integrations/supabase/client";
import type { Space } from "@/lib/space";
import { getLocalISODate } from "./date-utils";
import { getAccountsBalance, getMonthlyActuals, getMonthlyForecast } from "@/lib/financial-engine";

export function monthRange(ref: Date): { start: string; end: string; startDate: Date; endDate: Date } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return {
    start: getLocalISODate(start),
    end: getLocalISODate(end),
    startDate: start,
    endDate: end,
  };
}

export function monthLabel(ref: Date): string {
  return ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function firstOfMonth(ref: Date): string {
  return getLocalISODate(new Date(ref.getFullYear(), ref.getMonth(), 1));
}

export function daysRemaining(ref: Date): number {
  const now = new Date();
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  if (
    ref.getFullYear() < now.getFullYear() ||
    (ref.getFullYear() === now.getFullYear() && ref.getMonth() < now.getMonth())
  ) {
    return 0; // mês passado
  }
  if (ref.getFullYear() > now.getFullYear() || ref.getMonth() > now.getMonth()) {
    return end.getDate(); // mês futuro
  }
  const remaining = end.getDate() - now.getDate() + 1;
  return Math.max(0, remaining);
}

export function safePercent(spent: number, budget: number): number | null {
  if (!budget || budget <= 0) return null;
  return (spent / budget) * 100;
}

export function budgetStatus(pct: number | null): {
  key: "no_budget" | "safe" | "attention" | "close" | "exceeded";
  label: string;
  color: string;
} {
  if (pct === null) return { key: "no_budget", label: "Sem orçamento", color: "bg-muted text-muted-foreground" };
  if (pct >= 100) return { key: "exceeded", label: "Limite excedido", color: "bg-destructive/10 text-destructive" };
  if (pct >= 90) return { key: "close", label: "Próximo do limite", color: "bg-orange-500/10 text-orange-600" };
  if (pct >= 70) return { key: "attention", label: "Atenção", color: "bg-yellow-500/10 text-yellow-700" };
  return { key: "safe", label: "Dentro do planejado", color: "bg-success/10 text-success" };
}

export interface SpaceOpts {
  space: Space;
  userId: string;
  coupleId: string | null;
}

export type PlanningFrequency = "once" | "weekly" | "biweekly" | "monthly" | "annual" | "yearly" | "variable";

/** Normaliza uma recorrência para seu equivalente mensal de planejamento. */
export function monthlyAmount(amount: number, frequency: PlanningFrequency | string): number {
  const value = Number(amount) || 0;
  switch (frequency) {
    case "weekly": return value * 52 / 12;
    case "biweekly": return value * 26 / 12;
    case "annual":
    case "yearly": return value / 12;
    case "once": return 0;
    default: return value;
  }
}

export function planningFrequencyLabel(frequency: string): string {
  const labels: Record<string, string> = {
    once: "Única", weekly: "Semanal", biweekly: "Quinzenal",
    monthly: "Mensal", annual: "Anual", yearly: "Anual", variable: "Variável",
  };
  return labels[frequency] ?? frequency;
}

export async function fetchPlannedIncome(opts: SpaceOpts): Promise<number> {
  const forecast = await getMonthlyForecast(new Date(), {
    space: opts.space,
    userId: opts.userId,
    coupleId: opts.coupleId,
  });
  return forecast.plannedIncome;
}

/** Soma saldos das contas ativas conforme espaço usando o motor financeiro central */
export async function fetchAccountsTotal(opts: SpaceOpts): Promise<number> {
  const accounts = await getAccountsBalance({
    space: opts.space,
    userId: opts.userId,
    coupleId: opts.coupleId,
  });
  return accounts.total;
}

/**
 * Despesas realizadas do mês pelo motor financeiro central.
 */
export async function getCategoryExpenses(
  ref: Date,
  opts: SpaceOpts
): Promise<{ total: number; byCategory: Record<string, number> }> {
  const actuals = await getMonthlyActuals(ref, {
    space: opts.space,
    userId: opts.userId,
    coupleId: opts.coupleId,
  });
  return { total: actuals.totalExpenses, byCategory: actuals.byCategory };
}

export async function fetchMonthIncome(ref: Date, opts: SpaceOpts): Promise<number> {
  const actuals = await getMonthlyActuals(ref, {
    space: opts.space,
    userId: opts.userId,
    coupleId: opts.coupleId,
  });
  return actuals.totalIncome;
}

export function formatBRL(v: number | null | undefined): string {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function hideOrShow(v: number, hidden: boolean): string {
  return hidden ? "R$ ••••" : formatBRL(v);
}

/**
 * Converte strings em formato monetário (ex: "280,00", "280.00", "1.280,50") para number float seguro.
 */
export function parseCurrencyInput(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  let str = String(value).trim();
  if (!str) return 0;
  str = str.replace(/R\$\s?/g, "").trim();
  if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

export { getHomeMonthlySummary, type HomeMonthlySummary, type MonthlySummaryBreakdown } from "./monthly-summary";
export * from "./financial-engine";

