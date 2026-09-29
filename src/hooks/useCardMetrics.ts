import { useMemo } from "react";
import { resolveCardInvoiceCycle, getLocalISODate } from "@/lib/date-utils";

const monthKey = (d: string | Date) => {
  if (typeof d === "string") {
    const parts = d.substring(0, 10).split("-");
    if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  }
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Hook centralizado para calcular as métricas de cartões de crédito.
 * Regras:
 * - Comprometido = parcelas futuras não pagas + valores ainda não quitados de compras à vista
 * - Não soma parcelas já pagas (i.paid === true)
 * - Fatura sintética não herda dados de pagamento da anterior
 * - Status utiliza data local sem distorção UTC
 */
export function useCardMetrics(cards: any[], purchases: any[], invoices: any[]) {
  return useMemo(() => {
    const todayStr = getLocalISODate();
    const map: Record<string, any> = {};

    for (const card of cards) {
      map[card.id] = {
        used: 0,
        currentBill: 0,
        installmentsCount: 0,
        remainingTotal: 0,
        monthly: {} as Record<string, number>,
        lastPurchase: null as any,
        byCategory: {} as Record<string, number>,
      };
    }

    for (const p of purchases) {
      const cid = p.credit_card_id;
      if (!cid || !map[cid]) continue;
      
      // Skip payment transactions
      if (p.is_card_payment) continue;

      const m = map[cid];
      if (!m.lastPurchase || String(p.date) > String(m.lastPurchase.date)) {
        m.lastPurchase = p;
      }
      
      const catName = p.categories?.name || "Outros";
      m.byCategory[catName] = (m.byCategory[catName] ?? 0) + Number(p.amount);
      
      const cardObj = cards.find(c => c.id === cid);
      const cycle = resolveCardInvoiceCycle(p.date, cardObj?.closing_day ?? 1, cardObj?.due_day ?? 10, 1);

      const insts = p.installments ?? [];
      if (insts.length > 0) {
        m.installmentsCount++;
        for (const i of insts) {
          const v = Number(i.amount);
          const iCycle = resolveCardInvoiceCycle(p.date, cardObj?.closing_day ?? 1, cardObj?.due_day ?? 10, i.installment_number || 1);
          const mk = monthKey(i.due_date || iCycle.referenceMonth);
          m.monthly[mk] = (m.monthly[mk] ?? 0) + v;
          if (!i.paid) {
            m.used += v;
            m.remainingTotal += v;
          }
        }
      } else {
        const v = Number(p.amount);
        const mk = monthKey(cycle.referenceMonth);
        m.monthly[mk] = (m.monthly[mk] ?? 0) + v;
        
        // Para compras à vista: compromete o limite apenas se a fatura do ciclo ainda não foi paga
        const cardInvs = invoices.filter(inv => inv.card_id === cid);
        const invForCycle = cardInvs.find(inv => inv.reference_month?.startsWith(mk));
        if (invForCycle) {
          if (invForCycle.status === "paid") {
            // Já quitada pela fatura
          } else if (invForCycle.status === "partially_paid" && invForCycle.total_amount > 0) {
            const rem = Math.max(0, Number(invForCycle.total_amount) - Number(invForCycle.paid_amount || 0));
            const ratio = rem / Number(invForCycle.total_amount);
            m.used += v * ratio;
          } else {
            m.used += v;
          }
        } else {
          m.used += v;
        }
      }
    }

    // Set activeInv using card_invoices or synthesize from computed bill
    for (const card of cards) {
      if (!map[card.id]) continue;
      const m = map[card.id];
      const cardInvs = invoices.filter(i => i.card_id === card.id);
      
      // Ordena cronologicamente por mês de referência
      const sortedInvs = [...cardInvs].sort((a, b) => 
        String(a.reference_month).localeCompare(String(b.reference_month))
      );
      
      // 1. Encontra a primeira fatura com obrigação pendente
      let activeInv = sortedInvs.find(i => 
        ["open", "closed", "due", "overdue", "partially_paid"].includes(i.status)
      );
      
      // 2. Se todas estão pagas/canceladas, sintetiza ou localiza a próxima fatura do ciclo futuro
      if (!activeInv) {
        const cycleToday = resolveCardInvoiceCycle(todayStr, card.closing_day ?? 1, card.due_day ?? 10);
        let targetRefMonthStr = cycleToday.referenceMonth;
        
        // Se a última fatura paga já for desse mês ou posterior, avança 1 mês
        const lastPaid = [...sortedInvs].reverse().find(i => i.status === "paid");
        if (lastPaid && targetRefMonthStr.substring(0, 7) <= lastPaid.reference_month.substring(0, 7)) {
          const [lpY, lpM] = lastPaid.reference_month.substring(0, 7).split("-").map(Number);
          const nextM = lpM === 12 ? 1 : lpM + 1;
          const nextY = lpM === 12 ? lpY + 1 : lpY;
          targetRefMonthStr = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
        }
        
        // Verifica se o banco já tem essa fatura gerada e não paga
        const existingNext = sortedInvs.find(i => i.reference_month?.startsWith(targetRefMonthStr.substring(0, 7)));
        if (existingNext && !["paid", "cancelled"].includes(existingNext.status)) {
          activeInv = existingNext;
        } else {
          const targetMk = targetRefMonthStr.substring(0, 7);
          const billForTarget = m.monthly[targetMk] || 0;
          const [tY, tM] = targetMk.split("-").map(Number);
          const lastDayOfDueMonth = new Date(tY, tM, 0).getDate();
          const dueDayClamped = Math.min(card.due_day ?? 10, lastDayOfDueMonth);
          const dueStr = `${targetMk}-${String(dueDayClamped).padStart(2, "0")}`;

          // Closing date da fatura sintética
          let cYear = tY;
          let cMonth = tM; // 1-based
          if ((card.due_day ?? 10) < (card.closing_day ?? 1)) {
            cMonth -= 1;
            if (cMonth < 1) {
              cYear -= 1;
              cMonth = 12;
            }
          }
          const lastDayOfCloseMonth = new Date(cYear, cMonth, 0).getDate();
          const closeDayClamped = Math.min(card.closing_day ?? 1, lastDayOfCloseMonth);
          const closingStr = `${cYear}-${String(cMonth).padStart(2, "0")}-${String(closeDayClamped).padStart(2, "0")}`;

          let syntheticStatus = "open";
          if (todayStr > dueStr) {
            syntheticStatus = "overdue";
          } else if (todayStr === dueStr) {
            syntheticStatus = "due";
          } else if (todayStr > closingStr) {
            syntheticStatus = "closed";
          }

          // Cria explicitamente sem herdar qualquer dado de pagamento da anterior
          activeInv = {
            id: null,
            card_id: card.id,
            reference_month: targetRefMonthStr,
            total_amount: billForTarget,
            paid_amount: 0,
            remaining_amount: billForTarget,
            payment_transaction_id: null,
            paid_at: null,
            status: syntheticStatus,
            due_date: dueStr,
            closing_date: closingStr,
            _synthetic: true,
          };
        }
      }

      m.activeInv = activeInv;
      
      // 3. Atualiza o currentBill usando os lançamentos que caem na activeInv
      if (activeInv) {
        const mk = activeInv.reference_month.substring(0, 7);
        m.currentBill = m.monthly[mk] || 0;
      }
    }

    return map;
  }, [cards, purchases, invoices]);
}
