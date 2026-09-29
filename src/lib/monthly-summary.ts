import { supabase } from "@/integrations/supabase/client";
import type { SpaceOpts } from "@/lib/finance";
import { monthlyAmount, monthRange, fetchAccountsTotal } from "@/lib/finance";
import { fetchSubscriptions, buildSummary } from "@/lib/subscriptions";
import { resolveCardInvoiceCycle } from "@/lib/date-utils";
import { applySpaceFilter } from "@/lib/space";

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
 *
 * Consolida:
 * - Receitas estruturais ativas + receitas avulsas reais do mês não duplicadas
 * - Despesas fixas ativas da estrutura financeira
 * - Despesas variáveis ativas da estrutura financeira
 * - Assinaturas ativas do mês
 * - Faturas/gastos de cartão pertencentes estritamente ao mês de referência
 * - Outras despesas reais avulsas (excluindo cartões, pagamentos de fatura e itens já previstos)
 * - Exclui TOTALMENTE Dívidas (debts)
 * - Respeita o seletor Meu (privado) e Nosso (casal compartilhado)
 */
export async function getHomeMonthlySummary(ref: Date, opts: SpaceOpts): Promise<HomeMonthlySummary> {
  const { start, end } = monthRange(ref);
  const targetMonthKey = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;

  // 1. Busca paralela de todos os dados necessários
  const [
    accountsBalance,
    incomeSourcesRes,
    txIncomeRes,
    fixedBillsRes,
    variableExpensesRes,
    subscriptionsRes,
    cardsRes,
    purchasesRes,
    invoicesRes,
    otherExpensesRes,
  ] = await Promise.all([
    // Contas bancárias
    fetchAccountsTotal(opts).catch(() => 0),

    // Receitas estruturais ativas
    (async () => {
      let q = supabase
        .from("income_sources")
        .select("id,name,amount,frequency,is_active")
        .eq("is_active", true);
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) console.warn("Erro ao buscar income_sources para resumo mensal:", error);
      return (data ?? []) as any[];
    })(),

    // Receitas reais do mês (para capturar receitas avulsas não estruturais)
    (async () => {
      let q = supabase
        .from("transactions")
        .select("id,amount,description,category_id,source,date")
        .eq("type", "income")
        .gte("date", start)
        .lte("date", end);
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) console.warn("Erro ao buscar tx income para resumo mensal:", error);
      return (data ?? []) as any[];
    })(),

    // Despesas fixas da estrutura
    (async () => {
      let q = supabase
        .from("future_bills")
        .select("id,title,amount,recurrence,is_active,category_id")
        .eq("is_active", true)
        .neq("recurrence", "once");
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) console.warn("Erro ao buscar future_bills para resumo mensal:", error);
      return (data ?? []) as any[];
    })(),

    // Despesas variáveis da estrutura
    (async () => {
      try {
        let q = supabase
          .from("variable_expenses")
          .select("id,name,estimated_amount,is_active,category_id")
          .eq("is_active", true);
        q = applySpaceFilter(q, opts);
        const { data, error } = await q;
        if (error) return [];
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    })(),

    // Assinaturas ativas
    (async () => {
      try {
        const subs = await fetchSubscriptions(opts);
        const summary = buildSummary(subs);
        return summary.monthlyTotal || 0;
      } catch {
        return 0;
      }
    })(),

    // Cartões de crédito do espaço
    (async () => {
      let q = supabase.from("credit_cards").select("id,name,bank,closing_day,due_day,color");
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // Compras no cartão
    (async () => {
      let q = supabase
        .from("transactions")
        .select("*, installments(*)")
        .not("credit_card_id", "is", null);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // Faturas gravadas no banco para o mês
    (async () => {
      let q = supabase
        .from("card_invoices")
        .select("*")
        .like("reference_month", `${targetMonthKey}%`);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // Transações de despesa reais do mês
    (async () => {
      let q = supabase
        .from("transactions")
        .select("id,amount,description,category_id,is_card_payment,credit_card_id,date")
        .eq("type", "expense")
        .is("credit_card_id", null)
        .gte("date", start)
        .lte("date", end);
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) console.warn("Erro ao buscar other tx expenses:", error);
      return (data ?? []) as any[];
    })(),
  ]);

  // 2. Receitas Estruturais
  const structuredIncome = incomeSourcesRes.reduce(
    (sum: number, source: any) => sum + monthlyAmount(source.amount, source.frequency),
    0
  );

  // 3. Receitas Avulsas / Extras (deduplicadas de receitas estruturais materializadas)
  const structuredIncomeNames = incomeSourcesRes
    .map((s: any) => s.name?.toLowerCase().trim())
    .filter(Boolean);

  let extraIncome = 0;
  for (const t of txIncomeRes) {
    const tDesc = (t.description || "").toLowerCase().trim();
    const isMaterialized = structuredIncomeNames.some(
      (name: string) => tDesc === name || tDesc.includes(name) || name.includes(tDesc)
    );
    if (!isMaterialized) {
      extraIncome += Number(t.amount || 0);
    }
  }

  const totalIncome = structuredIncome + extraIncome;

  // 4. Despesas Fixas
  const fixedExpenses = fixedBillsRes.reduce(
    (sum: number, bill: any) => sum + monthlyAmount(bill.amount, bill.recurrence),
    0
  );

  // 5. Despesas Variáveis
  const variableExpenses = variableExpensesRes.reduce(
    (sum: number, varExp: any) => sum + Number(varExp.estimated_amount || 0),
    0
  );

  // 6. Assinaturas
  const subscriptionsTotal = Number(subscriptionsRes || 0);

  // 7. Cartões de Crédito (apenas ciclo do mês de referência)
  let cardExpenses = 0;
  const cardsList = cardsRes;
  const cardInvoicesList = invoicesRes;
  const cardPurchasesList = purchasesRes;

  for (const card of cardsList) {
    // 1. Procura se há fatura no banco para esse mês
    const existingInv = cardInvoicesList.find(
      (inv: any) => inv.card_id === card.id && String(inv.reference_month).startsWith(targetMonthKey)
    );

    if (existingInv) {
      cardExpenses += Number(existingInv.total_amount || 0);
    } else {
      // 2. Se não houver fatura fechada, calcula as compras e parcelas correspondentes ao mês
      let cardMonthSum = 0;
      const cardPurchases = cardPurchasesList.filter(
        (p: any) => p.credit_card_id === card.id && !p.is_card_payment
      );

      for (const p of cardPurchases) {
        const insts = p.installments ?? [];
        if (insts.length > 0) {
          for (const inst of insts) {
            const instDue = String(inst.due_date || "");
            const cycle = resolveCardInvoiceCycle(p.date, card.closing_day ?? 1, card.due_day ?? 10, inst.installment_number || 1);
            const refM = instDue.substring(0, 7) || cycle.referenceMonth.substring(0, 7);
            if (refM === targetMonthKey) {
              cardMonthSum += Number(inst.amount || 0);
            }
          }
        } else {
          // À vista
          const cycle = resolveCardInvoiceCycle(p.date, card.closing_day ?? 1, card.due_day ?? 10, 1);
          if (cycle.referenceMonth.substring(0, 7) === targetMonthKey) {
            cardMonthSum += Number(p.amount || 0);
          }
        }
      }
      cardExpenses += cardMonthSum;
    }
  }

  // 8. Outras Despesas Reais (deduplicadas para evitar contagem dupla)
  const fixedBillNames = fixedBillsRes.map((b: any) => (b.title || "").toLowerCase().trim()).filter(Boolean);
  const varCatIds = new Set(variableExpensesRes.map((v: any) => v.category_id).filter(Boolean));
  const varNames = variableExpensesRes.map((v: any) => (v.name || "").toLowerCase().trim()).filter(Boolean);

  let otherExpenses = 0;
  for (const t of otherExpensesRes) {
    // Regra 10: NUNCA somar pagamentos de fatura
    if (t.is_card_payment) continue;
    // Regra 9: Não somar compras de cartão (já estão no cardExpenses)
    if (t.credit_card_id) continue;

    const tDesc = (t.description || "").toLowerCase().trim();

    // Regra 12: Deduplicação de despesas fixas (ex: "Internet")
    const isFixedBill = fixedBillNames.some(
      (name: string) => tDesc === name || tDesc.includes(name) || name.includes(tDesc)
    );
    if (isFixedBill) continue;

    // Regra 13: Deduplicação com variáveis (ex: despesa de mercado real já coberta pelo orçamento de mercado)
    const isVariable = (t.category_id && varCatIds.has(t.category_id)) || varNames.some((name: string) => tDesc === name || tDesc.includes(name));
    if (isVariable) continue;

    otherExpenses += Number(t.amount || 0);
  }

  // Regra 15: Dívidas (debts) NÃO ENTRAM no cálculo do Resumo da Home

  const totalExpenses = fixedExpenses + variableExpenses + subscriptionsTotal + cardExpenses + otherExpenses;
  const monthlyBalance = totalIncome - totalExpenses;

  return {
    income: totalIncome,
    expenses: totalExpenses,
    accountsBalance: Number(accountsBalance || 0),
    monthlyBalance,
    breakdown: {
      structuredIncome,
      extraIncome,
      fixedExpenses,
      variableExpenses,
      subscriptions: subscriptionsTotal,
      cardExpenses,
      otherExpenses,
    },
  };
}
