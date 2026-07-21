import { useMemo } from "react";
import { resolveCardInvoiceCycle } from "../lib/date-utils";

const monthKey = (d: string | Date) => {
  if (typeof d === "string") {
    // Expected "YYYY-MM-DD" or similar
    const parts = d.split("-");
    if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  }
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Hook centralizado para calcular as métricas de cartões de crédito.
 * Unifica a lógica que sintetiza faturas (caso a row no banco não exista ainda)
 * e o agrupamento de gastos por categoria/cartão.
 */
export function useCardMetrics(cards: any[], purchases: any[], invoices: any[]) {
  return useMemo(() => {
    const today = new Date();
    const map: Record<string, any> = {};

    for (const card of cards) {
      map[card.id] = {
        used: 0, // total de parcelas pendentes + à vista não pagas
        currentBill: 0, // será atualizado baseado na fatura ativa (activeInv)
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
      
      const cardObj = cards.find(c => c.id === cid);
      const cycle = resolveCardInvoiceCycle(new Date(p.date), cardObj?.closing_day ?? 1, cardObj?.due_day ?? 10, 1);

      const insts = p.installments ?? [];
      if (insts.length > 0) {
        m.installmentsCount++;
        for (const i of insts) {
          const v = Number(i.amount);
          // If the DB already calculated i.due_date, use it, else calculate it
          const mk = monthKey(i.due_date || resolveCardInvoiceCycle(new Date(p.date), cardObj?.closing_day ?? 1, cardObj?.due_day ?? 10, i.installment_number || 1).referenceMonth);
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
        m.used += v;
      }
    }

    // Set activeInv using card_invoices or synthesize from computed bill
    for (const card of cards) {
      if (!map[card.id]) continue;
      const m = map[card.id];
      const cardInvs = invoices.filter(i => i.card_id === card.id);
      
      // Ordena cronologicamente
      const sortedInvs = [...cardInvs].sort((a, b) => new Date(a.reference_month).getTime() - new Date(b.reference_month).getTime());
      
      // 1. Encontra a primeira fatura aberta (pendente, fechada, vencendo, etc)
      let activeInv = sortedInvs.find(i => ["open", "closed", "due", "overdue", "partially_paid"].includes(i.status));
      
      // 2. Se não encontrar nenhuma pendente, o usuário está com as faturas em dia
      // Localiza o próximo ciclo para exibir o valor que será cobrado futuramente
      if (!activeInv) {
        const cycleToday = resolveCardInvoiceCycle(today, card.closing_day ?? 1, card.due_day ?? 10);
        let targetRefMonthStr = cycleToday.referenceMonth;
        
        // Verifica se a última fatura paga já era para esse mês alvo. Se sim, avança 1 mês.
        const lastPaid = [...sortedInvs].reverse().find(i => i.status === 'paid');
        if (lastPaid && new Date(targetRefMonthStr).getTime() <= new Date(lastPaid.reference_month).getTime()) {
           const d = new Date(lastPaid.reference_month + "T12:00:00");
           d.setMonth(d.getMonth() + 1);
           targetRefMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        }
        
        // Verifica se o banco já tem essa fatura futura gerada (e que não esteja paga)
        const existingNext = sortedInvs.find(i => i.reference_month?.startsWith(targetRefMonthStr.substring(0, 7)));
        if (existingNext && !["paid", "cancelled"].includes(existingNext.status)) {
           activeInv = existingNext;
        } else {
           // Sintetiza a fatura para o mês alvo com o valor exato calculado daquele ciclo
           const targetMk = targetRefMonthStr.substring(0, 7);
           const billForTarget = m.monthly[targetMk] || 0;
           const dueStr = `${targetMk}-${String(card.due_day ?? 10).padStart(2, "0")}`;
           const dueDateObj = new Date(dueStr + "T23:59:59");
           
           activeInv = {
             id: null,
             card_id: card.id,
             reference_month: targetRefMonthStr,
             total_amount: billForTarget,
             paid_amount: 0,
             status: today > dueDateObj ? "overdue" : "open",
             due_date: dueStr,
             _synthetic: true,
           };
        }
      }

      m.activeInv = activeInv;
      
      // 3. Atualiza o currentBill usando EXATAMENTE os itens que caem na activeInv
      if (activeInv) {
         const mk = activeInv.reference_month.substring(0, 7);
         m.currentBill = m.monthly[mk] || 0;
      }
    }

    return map;
  }, [cards, purchases, invoices]);
}
