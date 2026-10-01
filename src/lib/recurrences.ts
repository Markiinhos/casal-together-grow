import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter, type Space } from "@/lib/space";
import { monthlyAmount } from "@/lib/finance";
import {
  fetchSubscriptions,
  monthlyEquivalent,
  annualProjection,
  frequencyLabel,
  type Subscription,
} from "@/lib/subscriptions";
import {
  formatDateOnly,
  getLocalISODate,
  resolveCardInvoiceCycle,
} from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";

export interface RecurrenceSpaceOpts {
  space: Space;
  userId: string;
  coupleId: string | null;
}

export type RecurrenceType =
  | "fixed_bill"
  | "subscription"
  | "installment"
  | "future_bill"
  | "income";

export interface UnifiedRecurrenceItem {
  id: string;
  title: string;
  type: RecurrenceType;
  typeLabel: string;
  amount: number;
  monthlyAmount: number;
  annualAmount: number;
  frequency: string;
  frequencyLabel: string;
  dayOfMonth: number | null;
  nextDueDate: string | null;
  dueDateFormatted: string;
  categoryName?: string;
  categoryColor?: string;
  paymentMethod?: string;
  detail?: string;
  status: "active" | "trial" | "paused" | "pending";
  responsible?: string;
  isIncome: boolean;
  raw?: any;
}

export interface RecurrencesSummary {
  /** Compromisso mensal recorrente total (Despesas fixas + Assinaturas + Parcelamentos do mês) */
  monthlyCommitment: number;
  /** Compromisso anual estimado total (12x fixas + projeção assinaturas + parcelas vincendas) */
  annualCommitment: number;
  /** Receita recorrente mensal */
  monthlyRecurringIncome: number;
  /** Receita recorrente anual estimada */
  annualRecurringIncome: number;
  /** Saldo mensal recorrente (Receita - Compromisso) */
  recurringNetMonthly: number;
  /** Saldo anual recorrente estimado */
  recurringNetAnnual: number;
  /** Detalhamento mensal */
  breakdown: {
    fixedBillsMonthly: number;
    subscriptionsMonthly: number;
    installmentsMonthly: number;
    futureBillsOnceMonthly: number;
  };
  /** Quantidade de itens */
  counts: {
    total: number;
    fixedBills: number;
    subscriptions: number;
    installments: number;
    futureBillsOnce: number;
    income: number;
  };
  items: UnifiedRecurrenceItem[];
  timeline: UnifiedRecurrenceItem[];
}

/**
 * Consulta e agrega todas as fontes de recorrência em uma visão unificada.
 */
export async function fetchUnifiedRecurrences(
  opts: RecurrenceSpaceOpts,
  refDate: Date = new Date()
): Promise<RecurrencesSummary> {
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth(); // 0-indexed
  const targetMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  // 1. Receitas estruturadas / recorrentes
  let qi: any = supabase
    .from("income_sources")
    .select("*")
    .eq("is_active", true);
  qi = applySpaceFilter(qi, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: incomeData } = await qi;
  const incomeList = (incomeData ?? []) as any[];

  // 2. Despesas fixas (future_bills ativas com recurrence != 'once')
  let qfb: any = supabase
    .from("future_bills")
    .select("*, categories(name,color)")
    .eq("is_active", true);
  qfb = applySpaceFilter(qfb, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: fixedBillsData } = await qfb;
  const allFutureBills = (fixedBillsData ?? []) as any[];

  // 3. Assinaturas ativas
  const subscriptions = await fetchSubscriptions({
    space: opts.space,
    userId: opts.userId,
    coupleId: opts.coupleId,
  });

  // 4. Cartões de crédito e parcelamentos
  let qc: any = supabase.from("credit_cards").select("*");
  qc = applySpaceFilter(qc, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: cardsData } = await qc;
  const cards = (cardsData ?? []) as any[];
  const cardMap = new Map(cards.map((c: any) => [c.id, c]));

  // Compras com parcelamento ativo
  let qp: any = supabase
    .from("transactions")
    .select("*, categories(name,color), installments(*)")
    .not("credit_card_id", "is", null)
    .order("date", { ascending: false });
  qp = applySpaceFilter(qp, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: purchasesData } = await qp;
  const purchases = (purchasesData ?? []) as any[];

  // ── Unificação e Normalização ─────────────────────────────
  const items: UnifiedRecurrenceItem[] = [];

  let monthlyRecurringIncome = 0;
  let annualRecurringIncome = 0;
  let fixedBillsMonthly = 0;
  let subscriptionsMonthly = 0;
  let installmentsMonthly = 0;
  let futureBillsOnceMonthly = 0;
  let annualFixedBills = 0;
  let annualSubscriptions = 0;
  let annualInstallments = 0;

  // A. Processar Receitas Recorrentes
  for (const inc of incomeList) {
    const originalAmount = Number(inc.amount || 0);
    const mAmount = monthlyAmount(originalAmount, inc.frequency);
    const aAmount = mAmount * 12;

    monthlyRecurringIncome += mAmount;
    annualRecurringIncome += aAmount;

    const receiptDay = inc.receipt_day ? Math.min(31, Math.max(1, Number(inc.receipt_day))) : 5;
    const nextDueStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(receiptDay).padStart(2, "0")}`;

    items.push({
      id: `income-${inc.id}`,
      title: inc.name || "Receita Recorrente",
      type: "income",
      typeLabel: "Receita Recorrente",
      amount: originalAmount,
      monthlyAmount: Math.round(mAmount * 100) / 100,
      annualAmount: Math.round(aAmount * 100) / 100,
      frequency: inc.frequency || "monthly",
      frequencyLabel: inc.frequency === "monthly" ? "Mensal" : inc.frequency === "weekly" ? "Semanal" : inc.frequency === "yearly" ? "Anual" : "Recorrente",
      dayOfMonth: receiptDay,
      nextDueDate: nextDueStr,
      dueDateFormatted: `Dia ${receiptDay}`,
      categoryName: inc.income_type || "Renda",
      categoryColor: "#10B981", // verde
      detail: inc.notes || "Entrada recorrente prevista",
      status: "active",
      isIncome: true,
      raw: inc,
    });
  }

  // B. Processar Despesas Fixas e Contas Futuras
  for (const bill of allFutureBills) {
    const originalAmount = Number(bill.amount || 0);
    const isOnce = bill.recurrence === "once";
    const billDueDate = bill.due_date ? String(bill.due_date).substring(0, 10) : null;
    const day = billDueDate ? parseInt(billDueDate.split("-")[2], 10) : 10;

    if (isOnce) {
      // Conta pontual: verifica se vence no mês de referência
      const billMonth = billDueDate ? billDueDate.substring(0, 7) : null;
      if (billMonth === targetMonthKey) {
        futureBillsOnceMonthly += originalAmount;
        items.push({
          id: `bill-once-${bill.id}`,
          title: bill.title || "Conta Futura Pontual",
          type: "future_bill",
          typeLabel: "Conta Pontual",
          amount: originalAmount,
          monthlyAmount: originalAmount,
          annualAmount: originalAmount,
          frequency: "once",
          frequencyLabel: "Pontual",
          dayOfMonth: day,
          nextDueDate: billDueDate,
          dueDateFormatted: formatDateOnly(billDueDate),
          categoryName: bill.categories?.name || bill.category || "Contas",
          categoryColor: bill.categories?.color || "#F59E0B",
          paymentMethod: bill.payment_method,
          detail: bill.paid ? "Já paga" : "Pendente de pagamento",
          status: bill.paid ? "active" : "pending",
          responsible: bill.responsible,
          isIncome: false,
          raw: bill,
        });
      }
    } else {
      const mAmount = monthlyAmount(originalAmount, bill.recurrence);
      const aAmount = mAmount * 12;

      fixedBillsMonthly += mAmount;
      annualFixedBills += aAmount;

      items.push({
        id: `fixed-bill-${bill.id}`,
        title: bill.title || "Despesa Fixa",
        type: "fixed_bill",
        typeLabel: "Despesa Fixa",
        amount: originalAmount,
        monthlyAmount: Math.round(mAmount * 100) / 100,
        annualAmount: Math.round(aAmount * 100) / 100,
        frequency: bill.recurrence || "monthly",
        frequencyLabel: bill.recurrence === "monthly" ? "Mensal" : bill.recurrence === "yearly" ? "Anual" : bill.recurrence === "weekly" ? "Semanal" : "Recorrente",
        dayOfMonth: day,
        nextDueDate: billDueDate,
        dueDateFormatted: `Dia ${day}`,
        categoryName: bill.categories?.name || bill.category || "Fixas",
        categoryColor: bill.categories?.color || "#EC4899",
        paymentMethod: bill.payment_method,
        detail: bill.paid ? "Paga neste ciclo" : "Recorrência ativa",
        status: "active",
        responsible: bill.responsible,
        isIncome: false,
        raw: bill,
      });
    }
  }

  // C. Processar Assinaturas
  for (const sub of subscriptions) {
    if (sub.status === "canceled" || sub.status === "ended") continue;

    const mAmount = monthlyEquivalent(sub);
    const aAmount = annualProjection(sub);

    subscriptionsMonthly += mAmount;
    annualSubscriptions += aAmount;

    const nextBillingDate = sub.next_billing_date ? String(sub.next_billing_date).substring(0, 10) : null;
    const billingDay = sub.billing_day || (nextBillingDate ? parseInt(nextBillingDate.split("-")[2], 10) : 1);

    const cardInfo = sub.credit_cards ? sub.credit_cards.name : sub.bank_accounts ? sub.bank_accounts.name : null;

    items.push({
      id: `subscription-${sub.id}`,
      title: sub.name,
      type: "subscription",
      typeLabel: "Assinatura",
      amount: Number(sub.amount || 0),
      monthlyAmount: Math.round(mAmount * 100) / 100,
      annualAmount: Math.round(aAmount * 100) / 100,
      frequency: sub.billing_frequency,
      frequencyLabel: frequencyLabel(sub.billing_frequency, sub.billing_interval),
      dayOfMonth: billingDay,
      nextDueDate: nextBillingDate,
      dueDateFormatted: nextBillingDate ? formatDateOnly(nextBillingDate) : `Dia ${billingDay}`,
      categoryName: sub.categories?.name || "Assinatura",
      categoryColor: sub.categories?.color || "#6366F1",
      paymentMethod: sub.payment_method,
      detail: cardInfo ? `Cobrança via ${cardInfo}` : "Débito / Cartão",
      status: sub.status === "trial" ? "trial" : sub.status === "paused" ? "paused" : "active",
      isIncome: false,
      raw: sub,
    });
  }

  // D. Processar Parcelamentos de Cartão de Crédito
  for (const p of purchases) {
    if (p.is_card_payment || p.status === "cancelled") continue;
    const card = p.credit_card_id ? cardMap.get(p.credit_card_id) : null;
    const closingDay = card?.closing_day ?? 1;
    const dueDay = card?.due_day ?? 10;

    const insts = (p.installments ?? []) as any[];

    if (insts.length > 1) {
      // Compra explicitamente parcelada
      const activeUnpaid = insts.filter((i: any) => !i.paid && !i.paid_at);
      const currentMonthInst = insts.find((i: any) => {
        const instDue = String(i.due_date || "");
        const cycle = resolveCardInvoiceCycle(p.date, closingDay, dueDay, i.installment_number || 1);
        const refM = instDue.substring(0, 7) || cycle.referenceMonth.substring(0, 7);
        return refM === targetMonthKey;
      });

      if (activeUnpaid.length > 0) {
        const singleInstAmount = Number(activeUnpaid[0]?.amount || (Number(p.amount || 0) / insts.length));
        const currentNumber = currentMonthInst ? currentMonthInst.installment_number : activeUnpaid[0]?.installment_number;
        const totalNumber = insts.length;

        // Se há parcela pertencente a este mês
        if (currentMonthInst) {
          installmentsMonthly += Number(currentMonthInst.amount || singleInstAmount);
        }

        // Soma das parcelas que vencem nos próximos 12 meses
        const annualPortion = activeUnpaid.slice(0, 12).reduce((acc: number, item: any) => acc + Number(item.amount || singleInstAmount), 0);
        annualInstallments += annualPortion;

        const nextInstDate = currentMonthInst?.due_date || activeUnpaid[0]?.due_date || null;
        const instDay = nextInstDate ? parseInt(String(nextInstDate).split("-")[2], 10) : dueDay;

        items.push({
          id: `installment-plan-${p.id}`,
          title: p.description || "Parcelamento",
          type: "installment",
          typeLabel: "Parcelamento",
          amount: Number(p.amount || 0),
          monthlyAmount: Math.round((currentMonthInst ? Number(currentMonthInst.amount) : singleInstAmount) * 100) / 100,
          annualAmount: Math.round(annualPortion * 100) / 100,
          frequency: "installments",
          frequencyLabel: `${totalNumber}x parcelas`,
          dayOfMonth: instDay,
          nextDueDate: nextInstDate ? String(nextInstDate).substring(0, 10) : null,
          dueDateFormatted: nextInstDate ? formatDateOnly(nextInstDate) : `Dia ${dueDay}`,
          categoryName: p.categories?.name || "Cartão de Crédito",
          categoryColor: p.categories?.color || "#3B82F6",
          paymentMethod: "credit_card",
          detail: `Parcela ${currentNumber}/${totalNumber} · ${card?.name || "Cartão"} (${activeUnpaid.length} restantes)`,
          status: currentMonthInst?.paid ? "active" : "pending",
          isIncome: false,
          raw: { purchase: p, installments: insts, activeUnpaid },
        });
      }
    }
  }

  // E. Ordenação da Timeline por Dia do Mês (1 a 31)
  const timeline = [...items].sort((a, b) => {
    const dayA = a.dayOfMonth ?? 32;
    const dayB = b.dayOfMonth ?? 32;
    return dayA - dayB;
  });

  const totalMonthlyCommitment = Math.round((fixedBillsMonthly + subscriptionsMonthly + installmentsMonthly + futureBillsOnceMonthly) * 100) / 100;
  const totalAnnualCommitment = Math.round((annualFixedBills + annualSubscriptions + annualInstallments + futureBillsOnceMonthly) * 100) / 100;

  const recurringNetMonthly = Math.round((monthlyRecurringIncome - totalMonthlyCommitment) * 100) / 100;
  const recurringNetAnnual = Math.round((annualRecurringIncome - totalAnnualCommitment) * 100) / 100;

  return {
    monthlyCommitment: totalMonthlyCommitment,
    annualCommitment: totalAnnualCommitment,
    monthlyRecurringIncome: Math.round(monthlyRecurringIncome * 100) / 100,
    annualRecurringIncome: Math.round(annualRecurringIncome * 100) / 100,
    recurringNetMonthly,
    recurringNetAnnual,
    breakdown: {
      fixedBillsMonthly: Math.round(fixedBillsMonthly * 100) / 100,
      subscriptionsMonthly: Math.round(subscriptionsMonthly * 100) / 100,
      installmentsMonthly: Math.round(installmentsMonthly * 100) / 100,
      futureBillsOnceMonthly: Math.round(futureBillsOnceMonthly * 100) / 100,
    },
    counts: {
      total: items.length,
      fixedBills: items.filter((i) => i.type === "fixed_bill").length,
      subscriptions: items.filter((i) => i.type === "subscription").length,
      installments: items.filter((i) => i.type === "installment").length,
      futureBillsOnce: items.filter((i) => i.type === "future_bill").length,
      income: items.filter((i) => i.type === "income").length,
    },
    items,
    timeline,
  };
}

/**
 * Hook React Query para a Central de Recorrências.
 */
export function useUnifiedRecurrences(opts: RecurrenceSpaceOpts, refDate: Date = new Date()) {
  const monthKey = `${refDate.getFullYear()}-${refDate.getMonth()}`;
  return useQuery({
    queryKey: ["unified-recurrences", monthKey, opts.space, opts.coupleId, opts.userId],
    queryFn: () => fetchUnifiedRecurrences(opts, refDate),
    enabled: !!opts.userId,
    staleTime: 1000 * 30, // 30s
  });
}
