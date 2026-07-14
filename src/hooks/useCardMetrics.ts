import { useMemo } from "react";
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Hook centralizado para calcular as métricas de cartões de crédito.
 * Unifica a lógica que sintetiza faturas (caso a row no banco não exista ainda)
 * e o agrupamento de gastos por categoria/cartão.
 */
export function useCardMetrics(cards: any[], purchases: any[], invoices: any[]) {
  return useMemo(() => {
    const today = new Date();
    const thisMonth = monthKey(today);
    const map: Record<string, any> = {};

    for (const card of cards) {
      map[card.id] = {
        used: 0, // total de parcelas pendentes + à vista atual
        currentBill: 0, // parcelas vencendo este mês + à vista deste mês
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
      
      // Skip payment txs
      if (p.is_card_payment) continue;

      const m = map[cid];
      if (!m.lastPurchase || new Date(p.date) > new Date(m.lastPurchase.date)) {
        m.lastPurchase = p;
      }
      
      const catName = p.categories?.name || "Outros";
      m.byCategory[catName] = (m.byCategory[catName] ?? 0) + Number(p.amount);
      
      const insts = p.installments ?? [];
      if (insts.length > 0) {
        m.installmentsCount++;
        for (const i of insts) {
          const v = Number(i.amount);
          const mk = monthKey(new Date(i.due_date));
          m.monthly[mk] = (m.monthly[mk] ?? 0) + v;
          if (!i.paid) {
            m.used += v;
            m.remainingTotal += v;
            if (mk === thisMonth) m.currentBill += v;
          }
        }
      } else {
        const v = Number(p.amount);
        const mk = monthKey(new Date(p.date));
        m.monthly[mk] = (m.monthly[mk] ?? 0) + v;
        if (mk === thisMonth) m.currentBill += v;
        m.used += v;
      }
    }

    // Set activeInv using card_invoices or synthesize from computed bill
    for (const card of cards) {
      if (!map[card.id]) continue;
      const cardInvs = invoices.filter(i => i.card_id === card.id);
      
      // Encontra a fatura aberta mais antiga ou do mês atual
      let activeInv = cardInvs.find(i => ["open", "due", "overdue", "partially_paid"].includes(i.status));
      if (!activeInv) {
        activeInv = cardInvs.find(i => i.reference_month?.startsWith(thisMonth)) || (cardInvs.length > 0 ? cardInvs[cardInvs.length - 1] : null);
      }

      if (activeInv) {
        const dueDateObj = new Date(activeInv.due_date + "T23:59:59");
        if (today > dueDateObj && activeInv.paid_amount < activeInv.total_amount && ["open", "due"].includes(activeInv.status)) {
          activeInv = { ...activeInv, status: "overdue" };
        }
      }
      
      // Se não tem fatura no banco, mas tem fatura calculada (virtual)
      if (!activeInv && map[card.id].currentBill > 0) {
        const dueStr = `${thisMonth}-${String(card.due_day ?? 10).padStart(2, "0")}`;
        const dueDateObj = new Date(dueStr + "T23:59:59");
        activeInv = {
          id: null,
          card_id: card.id,
          reference_month: `${thisMonth}-01`,
          total_amount: map[card.id].currentBill,
          paid_amount: 0,
          status: today > dueDateObj ? "overdue" : "open",
          due_date: dueStr,
          _synthetic: true,
        };
      }
      
      map[card.id].activeInv = activeInv;
    }

    return map;
  }, [cards, purchases, invoices]);
}
