import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import { monthlyAmount, monthRange } from "@/lib/finance";
import { fetchSubscriptions, buildSummary } from "@/lib/subscriptions";
import type {
  SpaceFilterOpts,
  MonthlyForecast,
  ForecastIncomeItem,
  ForecastBillItem,
  ForecastVariableItem,
} from "./types";

/**
 * Função pura para computar PREVISÕES orçamentárias a partir de dados brutos.
 */
export function computeMonthlyForecastFromData({
  incomeSources,
  fixedBills,
  variableExpenses,
  subscriptionsTotal,
  targetMonthKey,
}: {
  incomeSources: any[];
  fixedBills: any[];
  variableExpenses: any[];
  subscriptionsTotal: number;
  targetMonthKey?: string;
}): MonthlyForecast {
  let plannedIncome = 0;
  const incomeList: ForecastIncomeItem[] = [];

  for (const inc of incomeSources) {
    if (!inc.is_active) continue;
    const mAmount = monthlyAmount(inc.amount, inc.frequency);
    plannedIncome += mAmount;
    incomeList.push({
      id: inc.id,
      name: inc.name,
      amount: Number(inc.amount || 0),
      frequency: inc.frequency,
      monthlyAmount: Math.round(mAmount * 100) / 100,
      isActive: Boolean(inc.is_active),
    });
  }

  let fixedBillsSum = 0;
  let futureBillsOnceSum = 0;
  const billsList: ForecastBillItem[] = [];

  for (const bill of fixedBills) {
    if (!bill.is_active) continue;
    const isOnce = bill.recurrence === "once";
    const billDue = bill.due_date ? String(bill.due_date).substring(0, 7) : null;

    if (isOnce) {
      // Contas pontuais só entram se forem do mês de referência
      if (!targetMonthKey || (billDue && billDue === targetMonthKey)) {
        const amt = Number(bill.amount || 0);
        futureBillsOnceSum += amt;
        billsList.push({
          id: bill.id,
          title: bill.title,
          amount: amt,
          recurrence: "once",
          monthlyAmount: amt,
          dueDate: bill.due_date,
          categoryId: bill.category_id,
        });
      }
    } else {
      const mAmount = monthlyAmount(bill.amount, bill.recurrence);
      fixedBillsSum += mAmount;
      billsList.push({
        id: bill.id,
        title: bill.title,
        amount: Number(bill.amount || 0),
        recurrence: bill.recurrence,
        monthlyAmount: Math.round(mAmount * 100) / 100,
        dueDate: bill.due_date,
        categoryId: bill.category_id,
      });
    }
  }

  let variableSum = 0;
  const variableList: ForecastVariableItem[] = [];

  for (const v of variableExpenses) {
    if (!v.is_active) continue;
    const estAmount = Number(v.estimated_amount || 0);
    variableSum += estAmount;
    variableList.push({
      id: v.id,
      name: v.name,
      estimatedAmount: estAmount,
      categoryId: v.category_id,
    });
  }

  const subsTotal = Math.max(0, Number(subscriptionsTotal || 0));
  const totalForecastExpenses = fixedBillsSum + variableSum + subsTotal + futureBillsOnceSum;

  return {
    plannedIncome: Math.round(plannedIncome * 100) / 100,
    fixedBills: Math.round(fixedBillsSum * 100) / 100,
    variableExpenses: Math.round(variableSum * 100) / 100,
    subscriptions: Math.round(subsTotal * 100) / 100,
    futureBillsOnce: Math.round(futureBillsOnceSum * 100) / 100,
    totalForecastExpenses: Math.round(totalForecastExpenses * 100) / 100,
    netForecast: Math.round((plannedIncome - totalForecastExpenses) * 100) / 100,
    incomeSources: incomeList,
    fixedBillsList: billsList,
    variableExpensesList: variableList,
    subscriptionsTotal: Math.round(subsTotal * 100) / 100,
  };
}

/**
 * Consulta o Supabase e retorna os valores PREVISTOS do mês para o espaço dado.
 */
export async function getMonthlyForecast(
  ref: Date,
  opts: SpaceFilterOpts,
  prefetchedData?: {
    incomeSources?: any[];
    fixedBills?: any[];
    variableExpenses?: any[];
    subscriptionsTotal?: number;
  }
): Promise<MonthlyForecast> {
  const targetMonthKey = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;

  if (
    prefetchedData &&
    prefetchedData.incomeSources &&
    prefetchedData.fixedBills &&
    prefetchedData.variableExpenses !== undefined &&
    prefetchedData.subscriptionsTotal !== undefined
  ) {
    return computeMonthlyForecastFromData({
      incomeSources: prefetchedData.incomeSources,
      fixedBills: prefetchedData.fixedBills,
      variableExpenses: prefetchedData.variableExpenses,
      subscriptionsTotal: prefetchedData.subscriptionsTotal,
      targetMonthKey,
    });
  }

  const [incomesRes, billsRes, variableRes, subsRes] = await Promise.all([
    (async () => {
      let q = supabase
        .from("income_sources")
        .select("id, name, amount, frequency, is_active")
        .eq("is_active", true);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    (async () => {
      let q = supabase
        .from("future_bills")
        .select("id, title, amount, recurrence, is_active, due_date, category_id")
        .eq("is_active", true);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    (async () => {
      try {
        let q = supabase
          .from("variable_expenses")
          .select("id, name, estimated_amount, is_active, category_id")
          .eq("is_active", true);
        q = applySpaceFilter(q, opts);
        const { data, error } = await q;
        if (error) return [];
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    })(),

    (async () => {
      try {
        const subs = await fetchSubscriptions(opts);
        const summary = buildSummary(subs);
        return summary.monthlyTotal || 0;
      } catch {
        return 0;
      }
    })(),
  ]);

  return computeMonthlyForecastFromData({
    incomeSources: incomesRes,
    fixedBills: billsRes,
    variableExpenses: variableRes,
    subscriptionsTotal: subsRes,
    targetMonthKey,
  });
}
