import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import { monthRange } from "@/lib/finance";
import { getAccountsBalance } from "@/lib/financial-engine/patrimony";
import { getMonthlyCommitments } from "@/lib/financial-engine/commitments";
import { fetchSubscriptions, monthlyEquivalent } from "@/lib/subscriptions";
import { useQuery } from "@tanstack/react-query";
import type { SpaceFilterOpts } from "@/lib/financial-engine/types";
import { formatReferenceMonth } from "@/lib/date-utils";

export type FinancialEventType =
  | "salary"
  | "income"
  | "fixed_bill"
  | "variable_expense"
  | "subscription"
  | "credit_card"
  | "goal"
  | "transaction";

export interface FinancialEvent {
  id: string;
  date: string; // YYYY-MM-DD
  day: number; // 1 a 31
  title: string;
  amount: number; // positivo
  type: "income" | "expense";
  sourceType: FinancialEventType;
  categoryName?: string;
  isPaidOrRealized: boolean;
  projectedBalanceAfter: number;
  isDeficit: boolean;
  formattedDate: string; // "01/10"
}

export interface DayFinancialSummary {
  date: string; // YYYY-MM-DD
  day: number;
  dayOfWeek: string;
  isToday: boolean;
  isPast: boolean;
  events: FinancialEvent[];
  totalIncome: number;
  totalExpense: number;
  netDay: number;
  endOfDayBalance: number;
  hasDeficit: boolean;
  lowestBalance: number;
}

export interface MonthlyFinancialCalendar {
  refDate: Date;
  monthKey: string; // "YYYY-MM"
  monthLabel: string;
  currentBankBalance: number;
  startingBalance: number;
  projectedEndingBalance: number;
  totalProjectedIncome: number;
  totalProjectedExpenses: number;
  lowestProjectedBalance: {
    amount: number;
    date: string;
    day: number;
  };
  hasAnyDeficit: boolean;
  daysWithDeficitCount: number;
  criticalDay: DayFinancialSummary | null;
  events: FinancialEvent[];
  days: DayFinancialSummary[];
}

const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Consulta e calcula o Calendário Financeiro com projeção de saldo evento a evento.
 */
export async function getFinancialCalendar(
  refDate: Date,
  opts: SpaceFilterOpts
): Promise<MonthlyFinancialCalendar> {
  const year = refDate.getFullYear();
  const month = refDate.getMonth(); // 0-11
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const { start, end } = monthRange(refDate);

  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const todayObj = new Date();
  const isCurrentMonth = todayObj.getFullYear() === year && todayObj.getMonth() === month;
  const todayDay = isCurrentMonth ? todayObj.getDate() : -1;
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;

  // Executa as consultas necessárias em paralelo
  const [
    accountsBalance,
    commitments,
    incomeSourcesRes,
    futureBillsRes,
    subscriptionsRes,
    transactionsRes,
    variableExpensesRes,
  ] = await Promise.all([
    // 1. Saldo atual das contas bancárias
    getAccountsBalance(opts),

    // 2. Compromissos de cartões (compras e faturas calculadas com seus due_day)
    getMonthlyCommitments(refDate, opts),

    // 3. Fontes de receita previstas ativas
    (async () => {
      let q = supabase
        .from("income_sources")
        .select("id, name, amount, frequency, receipt_day, income_type, is_active")
        .eq("is_active", true);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // 4. Contas fixas e pontuais ativas
    (async () => {
      let q = supabase
        .from("future_bills")
        .select("id, title, amount, recurrence, due_date, paid, is_active, category_id, categories(name)")
        .eq("is_active", true);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // 5. Assinaturas ativas
    (async () => {
      const subs = await fetchSubscriptions({
        space: opts.space,
        userId: opts.userId,
        coupleId: opts.coupleId,
      });
      return subs.filter((s) => s.status === "active");
    })(),

    // 6. Transações reais do mês (para histórico e conciliação)
    (async () => {
      let q = supabase
        .from("transactions")
        .select("id, amount, description, type, date, is_card_payment, credit_card_id")
        .gte("date", start)
        .lte("date", end);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // 7. Despesas variáveis configuradas
    (async () => {
      let q = supabase
        .from("variable_expenses")
        .select("id, name, estimated_amount, is_active, category_id, categories!variable_expenses_category_id_fkey(name)")
        .eq("is_active", true);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),
  ]);

  const rawEvents: Array<{
    id: string;
    day: number;
    title: string;
    amount: number;
    type: "income" | "expense";
    sourceType: FinancialEventType;
    categoryName?: string;
    isPaidOrRealized: boolean;
  }> = [];

  // ── A. Receitas Previstas (Salários e Fontes Recorrentes) ──────────────
  const realizedIncomes = (transactionsRes ?? []).filter((t) => t.type === "income");

  for (const inc of incomeSourcesRes) {
    let day = inc.receipt_day ? Number(inc.receipt_day) : 5;
    if (day < 1) day = 1;
    if (day > lastDayOfMonth) day = lastDayOfMonth;

    const amt = Number(inc.amount || 0);
    if (amt <= 0) continue;

    // Verifica se já foi recebido (materializado em transação)
    const isRealized = realizedIncomes.some((t) => {
      const tDay = parseInt(t.date.slice(8, 10), 10);
      const desc = (t.description || "").toLowerCase();
      const name = inc.name.toLowerCase();
      return Math.abs(tDay - day) <= 4 && (desc.includes(name) || name.includes(desc));
    });

    rawEvents.push({
      id: `income-${inc.id}`,
      day,
      title: inc.name || (inc.income_type === "salary" ? "Salário" : "Receita Prevista"),
      amount: amt,
      type: "income",
      sourceType: inc.income_type === "salary" ? "salary" : "income",
      isPaidOrRealized: isRealized || (isCurrentMonth && day < todayDay),
    });
  }

  // Receitas extras já realizadas que não vieram de income_sources
  for (const t of realizedIncomes) {
    const tDay = parseInt(t.date.slice(8, 10), 10);
    const desc = (t.description || "").toLowerCase();
    const isCovered = incomeSourcesRes.some((inc) => {
      const name = inc.name.toLowerCase();
      return desc.includes(name) || name.includes(desc);
    });

    if (!isCovered) {
      rawEvents.push({
        id: `tx-income-${t.id}`,
        day: tDay,
        title: t.description || "Receita Extra",
        amount: Math.abs(Number(t.amount || 0)),
        type: "income",
        sourceType: "transaction",
        isPaidOrRealized: true,
      });
    }
  }

  // ── B. Vencimentos de Cartões de Crédito (Faturas e Parcelas) ───────────
  for (const card of commitments.cards) {
    const amt = card.currentInvoiceAmount;
    if (amt <= 0) continue;

    let day = card.dueDay ? Number(card.dueDay) : 10;
    if (day < 1) day = 1;
    if (day > lastDayOfMonth) day = lastDayOfMonth;

    rawEvents.push({
      id: `card-${card.cardId}`,
      day,
      title: `Fatura ${card.cardName}`,
      amount: amt,
      type: "expense",
      sourceType: "credit_card",
      isPaidOrRealized: card.isInvoiceClosed && isCurrentMonth && day < todayDay,
    });
  }

  // ── C. Despesas Fixas e Contas Futuras (future_bills) ──────────────────
  for (const bill of futureBillsRes) {
    const amt = Number(bill.amount || 0);
    if (amt <= 0) continue;

    let day = 10;
    if (bill.due_date) {
      const parts = String(bill.due_date).slice(0, 10).split("-");
      if (parts.length === 3) {
        day = parseInt(parts[2], 10);
      }
    }
    if (day < 1) day = 1;
    if (day > lastDayOfMonth) day = lastDayOfMonth;

    // Se for pontual, só inclui se pertencer a este mês
    if (bill.recurrence === "once" && bill.due_date) {
      const bMonth = String(bill.due_date).substring(0, 7);
      if (bMonth !== monthKey) continue;
    }

    rawEvents.push({
      id: `bill-${bill.id}`,
      day,
      title: bill.title || "Conta Fixa",
      amount: amt,
      type: "expense",
      sourceType: "fixed_bill",
      categoryName: bill.categories?.name,
      isPaidOrRealized: Boolean(bill.paid) || (isCurrentMonth && day < todayDay),
    });
  }

  // ── D. Assinaturas Ativas ──────────────────────────────────────────────
  for (const sub of subscriptionsRes) {
    const amt = sub.amount;
    if (amt <= 0) continue;

    let day = sub.billing_day || 1;
    if (!sub.billing_day && sub.next_billing_date) {
      const parts = sub.next_billing_date.slice(0, 10).split("-");
      if (parts.length === 3) day = parseInt(parts[2], 10);
    }
    if (day < 1) day = 1;
    if (day > lastDayOfMonth) day = lastDayOfMonth;

    rawEvents.push({
      id: `sub-${sub.id}`,
      day,
      title: sub.name,
      amount: amt,
      type: "expense",
      sourceType: "subscription",
      categoryName: sub.categories?.name,
      isPaidOrRealized: isCurrentMonth && day < todayDay,
    });
  }

  // Ordena os eventos por dia do mês e prioriza receitas no início do dia
  rawEvents.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    // Receitas entram antes de despesas no mesmo dia
    if (a.type !== b.type) return a.type === "income" ? -1 : 1;
    return b.amount - a.amount;
  });

  // ── E. Projeção Cronológica do Saldo e Deteção de Déficit ──────────────
  const currentBankBalance = accountsBalance.total;

  // Calcula o saldo retroativo do dia 1 do mês para consistência
  let pastIncomeSum = 0;
  let pastExpenseSum = 0;

  if (isCurrentMonth) {
    for (const ev of rawEvents) {
      if (ev.day < todayDay) {
        if (ev.type === "income") pastIncomeSum += ev.amount;
        else pastExpenseSum += ev.amount;
      }
    }
  }

  // Saldo aproximado no início do mês
  const startingBalance = isCurrentMonth
    ? Math.round((currentBankBalance - pastIncomeSum + pastExpenseSum) * 100) / 100
    : currentBankBalance;

  let runningBalance = isCurrentMonth && todayDay > 1 ? startingBalance : currentBankBalance;

  const processedEvents: FinancialEvent[] = [];
  let lowestAmount = runningBalance;
  let lowestDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  let lowestDay = 1;
  let totalProjectedIncome = 0;
  let totalProjectedExpenses = 0;

  for (const ev of rawEvents) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(ev.day).padStart(2, "0")}`;
    const formattedDate = `${String(ev.day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}`;

    if (ev.type === "income") {
      runningBalance += ev.amount;
      totalProjectedIncome += ev.amount;
    } else {
      runningBalance -= ev.amount;
      totalProjectedExpenses += ev.amount;
    }

    runningBalance = Math.round(runningBalance * 100) / 100;

    const isDeficit = runningBalance < 0;

    if (runningBalance < lowestAmount) {
      lowestAmount = runningBalance;
      lowestDate = dateStr;
      lowestDay = ev.day;
    }

    processedEvents.push({
      id: ev.id,
      date: dateStr,
      day: ev.day,
      title: ev.title,
      amount: Math.round(ev.amount * 100) / 100,
      type: ev.type,
      sourceType: ev.sourceType,
      categoryName: ev.categoryName,
      isPaidOrRealized: ev.isPaidOrRealized,
      projectedBalanceAfter: runningBalance,
      isDeficit,
      formattedDate,
    });
  }

  // ── F. Agrupamento por Dias do Mês (1 a lastDayOfMonth) ─────────────────
  const days: DayFinancialSummary[] = [];
  let dayRunningBalance = startingBalance;
  let daysWithDeficitCount = 0;
  let criticalDay: DayFinancialSummary | null = null;

  for (let d = 1; d <= lastDayOfMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(year, month, d);
    const dayOfWeek = WEEKDAY_NAMES[dateObj.getDay()] || "";
    const isToday = isCurrentMonth && d === todayDay;
    const isPast = isCurrentMonth ? d < todayDay : false;

    const dayEvents = processedEvents.filter((e) => e.day === d);
    let dayIncome = 0;
    let dayExpense = 0;
    let dayLowest = dayRunningBalance;
    let dayHasDeficit = false;

    for (const e of dayEvents) {
      if (e.type === "income") dayIncome += e.amount;
      else dayExpense += e.amount;

      if (e.projectedBalanceAfter < dayLowest) {
        dayLowest = e.projectedBalanceAfter;
      }
      if (e.isDeficit) {
        dayHasDeficit = true;
      }
      dayRunningBalance = e.projectedBalanceAfter;
    }

    if (dayHasDeficit) {
      daysWithDeficitCount++;
    }

    const daySummary: DayFinancialSummary = {
      date: dStr,
      day: d,
      dayOfWeek,
      isToday,
      isPast,
      events: dayEvents,
      totalIncome: Math.round(dayIncome * 100) / 100,
      totalExpense: Math.round(dayExpense * 100) / 100,
      netDay: Math.round((dayIncome - dayExpense) * 100) / 100,
      endOfDayBalance: dayRunningBalance,
      hasDeficit: dayHasDeficit,
      lowestBalance: dayLowest,
    };

    if (dayLowest === lowestAmount && !criticalDay) {
      criticalDay = daySummary;
    }

    days.push(daySummary);
  }

  const projectedEndingBalance = dayRunningBalance;
  const hasAnyDeficit = lowestAmount < 0;

  return {
    refDate,
    monthKey,
    monthLabel: formatReferenceMonth(monthKey),
    currentBankBalance,
    startingBalance,
    projectedEndingBalance,
    totalProjectedIncome: Math.round(totalProjectedIncome * 100) / 100,
    totalProjectedExpenses: Math.round(totalProjectedExpenses * 100) / 100,
    lowestProjectedBalance: {
      amount: lowestAmount,
      date: lowestDate,
      day: lowestDay,
    },
    hasAnyDeficit,
    daysWithDeficitCount,
    criticalDay,
    events: processedEvents,
    days,
  };
}

/**
 * Hook React Query para o Calendário Financeiro Mensal
 */
export function useFinancialCalendar(
  refDate: Date = new Date(),
  opts: SpaceFilterOpts,
  enabled: boolean = true
) {
  const monthKey = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}`;
  return useQuery({
    queryKey: ["financial-calendar", monthKey, opts.space, opts.coupleId, opts.userId],
    queryFn: () => getFinancialCalendar(refDate, opts),
    enabled: enabled && !!opts.userId,
    staleTime: 1000 * 20, // 20s
  });
}
