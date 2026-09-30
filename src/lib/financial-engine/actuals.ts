import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import { monthRange } from "@/lib/finance";
import type { SpaceFilterOpts, MonthlyActuals, ActualTransactionItem } from "./types";

/**
 * Função pura para filtrar e computar os valores REALIZADOS de uma lista de transações.
 */
export function computeMonthlyActualsFromRows(
  transactions: any[],
  categoriesMap?: Record<string, string>
): MonthlyActuals {
  let totalIncome = 0;
  let totalExpenses = 0;
  let cardInvoicePaymentsTotal = 0;
  const incomeTransactions: ActualTransactionItem[] = [];
  const expenseTransactions: ActualTransactionItem[] = [];
  const byCategory: Record<string, number> = {};

  for (const t of transactions) {
    if (!t || t.status === "cancelled" || t.deleted_at) continue;

    const amount = Math.abs(Number(t.amount || 0));
    if (isNaN(amount) || amount === 0) continue;

    const isCardPayment = Boolean(t.is_card_payment);
    const hasCreditCard = Boolean(t.credit_card_id);
    const isTransfer =
      Boolean(t.is_transfer) ||
      t.type === "transfer" ||
      t.source === "transfer" ||
      (t.description || "").toLowerCase().includes("transferência entre contas");

    // Transferências internas nunca são despesas nem receitas operacionais
    if (isTransfer) continue;

    if (t.type === "income") {
      totalIncome += amount;
      incomeTransactions.push({
        id: t.id,
        amount,
        description: t.description || null,
        date: t.date,
        type: "income",
        categoryId: t.category_id || null,
        categoryName: t.category_id && categoriesMap ? categoriesMap[t.category_id] : undefined,
        accountId: t.account_id || null,
        isCardPayment: false,
        creditCardId: null,
      });

      if (t.category_id) {
        byCategory[t.category_id] = (byCategory[t.category_id] || 0) + amount;
      }
    } else if (t.type === "expense") {
      // Regra Canônica: Pagamentos de fatura são rastreados à parte e NUNCA somados
      // diretamente como despesa de consumo, pois a fatura/compra é a obrigação real.
      if (isCardPayment) {
        cardInvoicePaymentsTotal += amount;
        continue;
      }

      // Compras efetuadas via cartão pertencem ao ecossistema do cartão (fatura/compromissos)
      // e não devem duplicar o fluxo de caixa à vista da conta corrente.
      if (hasCreditCard) {
        continue;
      }

      totalExpenses += amount;
      expenseTransactions.push({
        id: t.id,
        amount,
        description: t.description || null,
        date: t.date,
        type: "expense",
        categoryId: t.category_id || null,
        categoryName: t.category_id && categoriesMap ? categoriesMap[t.category_id] : undefined,
        accountId: t.account_id || null,
        isCardPayment: false,
        creditCardId: null,
      });

      if (t.category_id) {
        byCategory[t.category_id] = (byCategory[t.category_id] || 0) + amount;
      }
    }
  }

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netActual: Math.round((totalIncome - totalExpenses) * 100) / 100,
    incomeCount: incomeTransactions.length,
    expenseCount: expenseTransactions.length,
    incomeTransactions,
    expenseTransactions,
    byCategory,
    cardInvoicePaymentsTotal: Math.round(cardInvoicePaymentsTotal * 100) / 100,
  };
}

/**
 * Consulta o Supabase e retorna os valores REALIZADOS do mês para o espaço dado.
 */
export async function getMonthlyActuals(
  ref: Date,
  opts: SpaceFilterOpts,
  prefetchedRows?: any[]
): Promise<MonthlyActuals> {
  if (prefetchedRows) {
    return computeMonthlyActualsFromRows(prefetchedRows);
  }

  const { start, end } = monthRange(ref);

  let q = supabase
    .from("transactions")
    .select("id, amount, description, type, category_id, account_id, is_card_payment, credit_card_id, date, status, source")
    .gte("date", start)
    .lte("date", end);

  q = applySpaceFilter(q, opts);

  const { data, error } = await q;
  if (error) {
    console.error("Erro ao buscar transações em getMonthlyActuals:", error);
    return {
      totalIncome: 0,
      totalExpenses: 0,
      netActual: 0,
      incomeCount: 0,
      expenseCount: 0,
      incomeTransactions: [],
      expenseTransactions: [],
      byCategory: {},
      cardInvoicePaymentsTotal: 0,
    };
  }

  return computeMonthlyActualsFromRows(data ?? []);
}
