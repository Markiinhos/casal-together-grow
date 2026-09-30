import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import { resolveCardInvoiceCycle } from "@/lib/date-utils";
import type { SpaceFilterOpts, MonthlyCommitments, CardCommitmentItem } from "./types";

/**
 * Função pura para computar obrigações de cartões e parcelas futuras.
 */
export function computeMonthlyCommitmentsFromData({
  cards,
  invoices,
  purchases,
  targetMonthKey,
}: {
  cards: any[];
  invoices: any[];
  purchases: any[];
  targetMonthKey: string;
}): MonthlyCommitments {
  let totalCurrentInvoices = 0;
  let totalFutureInstallments = 0;
  const cardsResult: CardCommitmentItem[] = [];

  for (const card of cards) {
    const cardId = card.id;
    const closingDay = card.closing_day ?? 1;
    const dueDay = card.due_day ?? 10;

    // 1. Procura se há fatura gravada no banco para o mês de referência
    const existingInvoice = invoices.find(
      (inv: any) =>
        inv.card_id === cardId &&
        String(inv.reference_month).startsWith(targetMonthKey) &&
        inv.status !== "cancelled"
    );

    let currentInvoiceAmount = 0;
    let isInvoiceClosed = false;

    if (existingInvoice) {
      currentInvoiceAmount = Number(existingInvoice.total_amount || 0);
      isInvoiceClosed = existingInvoice.status === "closed" || existingInvoice.status === "paid";
    }

    // 2. Compras deste cartão
    const cardPurchases = purchases.filter(
      (p: any) => p.credit_card_id === cardId && !p.is_card_payment && p.status !== "cancelled"
    );

    let calculatedMonthSum = 0;
    let futureCardInstallments = 0;

    for (const p of cardPurchases) {
      const insts = p.installments ?? [];

      if (insts.length > 0) {
        for (const inst of insts) {
          const instDue = String(inst.due_date || "");
          const cycle = resolveCardInvoiceCycle(p.date, closingDay, dueDay, inst.installment_number || 1);
          const refM = instDue.substring(0, 7) || cycle.referenceMonth.substring(0, 7);
          const amt = Number(inst.amount || 0);

          if (refM === targetMonthKey) {
            calculatedMonthSum += amt;
          } else if (refM > targetMonthKey) {
            // Parcela futura
            if (!inst.paid_at && inst.status !== "paid") {
              futureCardInstallments += amt;
            }
          }
        }
      } else {
        // Compra à vista
        const cycle = resolveCardInvoiceCycle(p.date, closingDay, dueDay, 1);
        const refM = cycle.referenceMonth.substring(0, 7);
        const amt = Number(p.amount || 0);

        if (refM === targetMonthKey) {
          calculatedMonthSum += amt;
        } else if (refM > targetMonthKey) {
          futureCardInstallments += amt;
        }
      }
    }

    // Se não havia fatura fechada salva, o valor da fatura do mês é a soma calculada
    if (!existingInvoice) {
      currentInvoiceAmount = calculatedMonthSum;
    }

    totalCurrentInvoices += currentInvoiceAmount;
    totalFutureInstallments += futureCardInstallments;

    cardsResult.push({
      cardId,
      cardName: card.name || "Cartão",
      bank: card.bank,
      closingDay,
      dueDay,
      currentInvoiceAmount: Math.round(currentInvoiceAmount * 100) / 100,
      isInvoiceClosed,
      futureInstallmentsAmount: Math.round(futureCardInstallments * 100) / 100,
      totalCardCommitted: Math.round((currentInvoiceAmount + futureCardInstallments) * 100) / 100,
    });
  }

  return {
    currentMonthInvoices: Math.round(totalCurrentInvoices * 100) / 100,
    futureInstallments: Math.round(totalFutureInstallments * 100) / 100,
    totalCommitments: Math.round((totalCurrentInvoices + totalFutureInstallments) * 100) / 100,
    cards: cardsResult,
  };
}

/**
 * Consulta o Supabase e retorna os COMPROMISSOS (faturas e parcelas futuras) para o mês e espaço dados.
 */
export async function getMonthlyCommitments(
  ref: Date,
  opts: SpaceFilterOpts,
  prefetchedData?: {
    cards?: any[];
    invoices?: any[];
    purchases?: any[];
  }
): Promise<MonthlyCommitments> {
  const targetMonthKey = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;

  if (prefetchedData && prefetchedData.cards && prefetchedData.invoices && prefetchedData.purchases) {
    return computeMonthlyCommitmentsFromData({
      cards: prefetchedData.cards,
      invoices: prefetchedData.invoices,
      purchases: prefetchedData.purchases,
      targetMonthKey,
    });
  }

  const [cardsRes, invoicesRes, purchasesRes] = await Promise.all([
    (async () => {
      let q = supabase.from("credit_cards").select("id, name, bank, closing_day, due_day, color");
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    (async () => {
      let q = supabase.from("card_invoices").select("*");
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    (async () => {
      let q = supabase
        .from("transactions")
        .select("*, installments(*)")
        .not("credit_card_id", "is", null);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),
  ]);

  return computeMonthlyCommitmentsFromData({
    cards: cardsRes,
    invoices: invoicesRes,
    purchases: purchasesRes,
    targetMonthKey,
  });
}
