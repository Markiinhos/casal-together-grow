import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter, type Space } from "@/lib/space";
import { formatBRL, monthlyAmount } from "@/lib/finance";
import { formatDateOnly, getLocalISODate, resolveCardInvoiceCycle } from "@/lib/date-utils";
import { differenceInCalendarDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { fetchSubscriptions } from "@/lib/subscriptions";
import { getAccountsBalance } from "@/lib/financial-engine/patrimony";

export type SmartAlertType =
  | "budget"
  | "invoice_due"
  | "projection_negative"
  | "above_average"
  | "goal_pacing";

export type SmartAlertSeverity = "info" | "warning" | "critical" | "success";

export interface SmartAlert {
  id: string;
  type: SmartAlertType;
  title: string;
  body: string;
  severity: SmartAlertSeverity;
  dedupeKey: string;
  link: string;
  actionLabel?: string;
  categoryName?: string;
  createdAt?: string;
  metadata?: Record<string, any>;
}

export interface SmartAlertsOptions {
  space: Space;
  userId: string;
  coupleId: string | null;
}

/**
 * Avalia todas as regras de inteligência financeira e produz a lista de alertas ativos.
 */
export async function evaluateSmartAlerts(
  opts: SmartAlertsOptions,
  refDate: Date = new Date()
): Promise<SmartAlert[]> {
  const alerts: SmartAlert[] = [];
  const currentYear = refDate.getFullYear();
  const currentMonthNum = refDate.getMonth() + 1; // 1-indexed
  const yearMonth = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`;

  // 1. Carregar transações dos últimos 4 meses (para orçamento atual + média histórica)
  const past3MonthsStart = startOfMonth(subMonths(refDate, 3));
  const currentMonthStart = startOfMonth(refDate);
  const currentMonthEnd = endOfMonth(refDate);

  const startISODate = getLocalISODate(past3MonthsStart);

  let qt: any = supabase
    .from("transactions")
    .select("id,description,amount,type,date,category_id,credit_card_id,categories(id,name,color)")
    .gte("date", startISODate)
    .order("date", { ascending: false });
  qt = applySpaceFilter(qt, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: txData } = await qt;
  const transactions = (txData ?? []) as any[];

  // Separa transações do mês atual e dos meses anteriores
  const currentMonthTx = transactions.filter((t) => {
    const d = String(t.date || "").substring(0, 7);
    return d === yearMonth;
  });

  const pastMonthsTx = transactions.filter((t) => {
    const d = String(t.date || "").substring(0, 7);
    return d < yearMonth;
  });

  // 2. Carregar Despesas Variáveis estruturadas (orçamento previsto por categoria)
  let qv: any = supabase
    .from("variable_expenses")
    .select("*, categories(id,name,color)")
    .eq("is_active", true);
  qv = applySpaceFilter(qv, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: varData } = await qv;
  const variableExpenses = (varData ?? []) as any[];

  // ─────────────────────────────────────────────────────────────
  // ALERTA 1: "82% do orçamento de Mercado utilizado"
  // ─────────────────────────────────────────────────────────────
  for (const v of variableExpenses) {
    const budget = Number(v.estimated_amount || 0);
    if (budget <= 0) continue;

    const catId = v.category_id;
    const catName = v.categories?.name || v.name || "Categoria";

    // Soma despesas realizadas do mês para essa categoria
    const spent = currentMonthTx
      .filter((t) => t.type === "expense" && (!catId || t.category_id === catId))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const ratio = spent / budget;
    const pct = Math.round(ratio * 100);

    // Dispara alerta se utilizou >= 80% do teto previsto
    if (pct >= 80) {
      const isCritical = pct >= 100;
      const bucket = isCritical ? "100" : "80";
      alerts.push({
        id: `budget-${v.id}-${yearMonth}-${bucket}`,
        type: "budget",
        title: `${pct}% do orçamento de ${catName} utilizado`,
        body: `Você já consumiu ${formatBRL(spent)} do teto previsto de ${formatBRL(budget)} para ${catName} em ${yearMonth.split("-")[1]}/${yearMonth.split("-")[0]}.`,
        severity: isCritical ? "critical" : "warning",
        dedupeKey: `smart_alert:budget:${catId || v.id}:${yearMonth}:${bucket}`,
        link: "/app/financas/planejamento",
        actionLabel: "Ver Orçamento",
        categoryName: catName,
        metadata: { spent, budget, pct, catId },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ALERTA 2: "Fatura vence em 3 dias"
  // ─────────────────────────────────────────────────────────────
  let qc: any = supabase.from("credit_cards").select("*");
  qc = applySpaceFilter(qc, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: cardsData } = await qc;
  const cards = (cardsData ?? []) as any[];

  let qinv: any = supabase.from("card_invoices").select("*").neq("status", "cancelled");
  qinv = applySpaceFilter(qinv, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: invoicesData } = await qinv;
  const invoices = (invoicesData ?? []) as any[];

  for (const card of cards) {
    const cardInvoices = invoices.filter((i) => i.card_id === card.id);
    const closingDay = card.closing_day ?? 1;
    const dueDay = card.due_day ?? 10;

    // Busca fatura do mês atual ou calcula ciclo
    const currentInv = cardInvoices.find((i) => String(i.reference_month || "").startsWith(yearMonth));

    let dueDate: Date;
    let invoiceAmount = 0;
    let isPaid = false;

    if (currentInv) {
      invoiceAmount = Number(currentInv.total_amount || 0);
      isPaid = currentInv.status === "paid" || Number(currentInv.paid_amount || 0) >= invoiceAmount;
      if (currentInv.due_date) {
        const parts = String(currentInv.due_date).substring(0, 10).split("-").map(Number);
        dueDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
      } else {
        dueDate = new Date(currentYear, currentMonthNum - 1, dueDay, 12, 0, 0);
      }
    } else {
      // Data teórica de vencimento
      dueDate = new Date(currentYear, currentMonthNum - 1, dueDay, 12, 0, 0);
      // Compras do cartão no mês
      invoiceAmount = currentMonthTx
        .filter((t) => t.credit_card_id === card.id && !t.is_card_payment)
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    }

    if (invoiceAmount > 0 && !isPaid) {
      const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 12, 0, 0);
      const daysRemaining = differenceInCalendarDays(dueDate, today);

      if (daysRemaining === 3) {
        alerts.push({
          id: `invoice-3d-${card.id}-${yearMonth}`,
          type: "invoice_due",
          title: "Fatura vence em 3 dias",
          body: `A fatura de ${card.name} no valor de ${formatBRL(invoiceAmount)} vence em 3 dias (${formatDateOnly(getLocalISODate(dueDate))}).`,
          severity: "warning",
          dedupeKey: `smart_alert:invoice:${card.id}:${yearMonth}:d3`,
          link: "/app/financas/faturas",
          actionLabel: "Ver Fatura",
          metadata: { cardId: card.id, invoiceAmount, daysRemaining },
        });
      } else if (daysRemaining === 1) {
        alerts.push({
          id: `invoice-1d-${card.id}-${yearMonth}`,
          type: "invoice_due",
          title: "Fatura vence amanhã",
          body: `A fatura de ${card.name} no valor de ${formatBRL(invoiceAmount)} vence amanhã. Garanta saldo para pagamento!`,
          severity: "critical",
          dedupeKey: `smart_alert:invoice:${card.id}:${yearMonth}:d1`,
          link: "/app/financas/faturas",
          actionLabel: "Pagar Fatura",
          metadata: { cardId: card.id, invoiceAmount, daysRemaining },
        });
      } else if (daysRemaining === 0) {
        alerts.push({
          id: `invoice-0d-${card.id}-${yearMonth}`,
          type: "invoice_due",
          title: "Fatura vence hoje",
          body: `A fatura de ${card.name} no valor de ${formatBRL(invoiceAmount)} vence hoje. Evite juros e encargos.`,
          severity: "critical",
          dedupeKey: `smart_alert:invoice:${card.id}:${yearMonth}:d0`,
          link: "/app/financas/faturas",
          actionLabel: "Pagar Hoje",
          metadata: { cardId: card.id, invoiceAmount, daysRemaining },
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ALERTA 3: "Saldo projetado ficará negativo em 12/10"
  // ─────────────────────────────────────────────────────────────
  const accountsBal = await getAccountsBalance({ space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const startingCash = accountsBal.total;

  // Carrega fontes de receita ativas
  let qi: any = supabase.from("income_sources").select("*").eq("is_active", true);
  qi = applySpaceFilter(qi, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: incomeSources } = await qi;

  // Carrega contas fixas ativas
  let qb: any = supabase.from("future_bills").select("*").eq("is_active", true);
  qb = applySpaceFilter(qb, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: fixedBills } = await qb;

  // Carrega assinaturas
  const subscriptions = await fetchSubscriptions({ space: opts.space, userId: opts.userId, coupleId: opts.coupleId });

  // Simulação dia a dia para os próximos 45 dias
  let runningCash = startingCash;
  let firstNegativeDate: Date | null = null;
  let minNegativeBalance = 0;

  for (let dayOffset = 1; dayOffset <= 45; dayOffset++) {
    const simDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + dayOffset, 12, 0, 0);
    const dayOfMonth = simDate.getDate();
    const simISODate = getLocalISODate(simDate);

    // Entradas no dia
    for (const inc of (incomeSources ?? [])) {
      const recDay = inc.receipt_day ? Number(inc.receipt_day) : 5;
      if (recDay === dayOfMonth) {
        runningCash += monthlyAmount(Number(inc.amount || 0), inc.frequency);
      }
    }

    // Saídas fixas no dia
    for (const bill of (fixedBills ?? [])) {
      if (bill.due_date && String(bill.due_date).substring(0, 10) === simISODate) {
        runningCash -= Number(bill.amount || 0);
      } else if (bill.recurrence !== "once") {
        const billDay = bill.due_date ? parseInt(String(bill.due_date).split("-")[2], 10) : 10;
        if (billDay === dayOfMonth) {
          runningCash -= monthlyAmount(Number(bill.amount || 0), bill.recurrence);
        }
      }
    }

    // Saídas de assinaturas no dia
    for (const sub of subscriptions) {
      if (sub.next_billing_date && String(sub.next_billing_date).substring(0, 10) === simISODate) {
        runningCash -= Number(sub.amount || 0);
      }
    }

    // Faturas de cartão com vencimento neste dia
    for (const card of cards) {
      if ((card.due_day ?? 10) === dayOfMonth) {
        // Estima fatura
        const inv = invoices.find((i) => i.card_id === card.id && String(i.due_date || "").substring(0, 10) === simISODate);
        if (inv && inv.status !== "paid") {
          runningCash -= Number(inv.total_amount || 0);
        }
      }
    }

    if (runningCash < 0 && !firstNegativeDate) {
      firstNegativeDate = simDate;
      minNegativeBalance = runningCash;
    }
  }

  if (firstNegativeDate) {
    const dayStr = String(firstNegativeDate.getDate()).padStart(2, "0");
    const monthStr = String(firstNegativeDate.getMonth() + 1).padStart(2, "0");
    const dateFormatted = `${dayStr}/${monthStr}`; // ex: 12/10
    const negISODate = getLocalISODate(firstNegativeDate);

    alerts.push({
      id: `proj-neg-${negISODate}`,
      type: "projection_negative",
      title: `Saldo projetado ficará negativo em ${dateFormatted}`,
      body: `Pelo fluxo de contas e recebimentos, seu saldo projetado atingirá ${formatBRL(minNegativeBalance)} no dia ${dateFormatted}. Revise prazos para evitar juros.`,
      severity: "critical",
      dedupeKey: `smart_alert:proj_neg:${negISODate}:${yearMonth}`,
      link: "/app/financas/projecao",
      actionLabel: "Ver Projeção",
      metadata: { dateFormatted, minNegativeBalance, negISODate },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // ALERTA 4: "Combustível está acima da média"
  // ─────────────────────────────────────────────────────────────
  // Agrupa despesas passadas por categoria
  const pastCategoryTotals: Record<string, { name: string; sum: number; count: number }> = {};
  for (const t of pastMonthsTx) {
    if (t.type !== "expense") continue;
    const catId = t.category_id || "outros";
    const catName = t.categories?.name || t.description || "Gasto";
    if (!pastCategoryTotals[catId]) {
      pastCategoryTotals[catId] = { name: catName, sum: 0, count: 0 };
    }
    pastCategoryTotals[catId].sum += Number(t.amount || 0);
  }

  // Considera 2 meses de histórico
  const currentCategoryTotals: Record<string, { name: string; sum: number }> = {};
  for (const t of currentMonthTx) {
    if (t.type !== "expense") continue;
    const catId = t.category_id || "outros";
    const catName = t.categories?.name || t.description || "Gasto";
    if (!currentCategoryTotals[catId]) {
      currentCategoryTotals[catId] = { name: catName, sum: 0 };
    }
    currentCategoryTotals[catId].sum += Number(t.amount || 0);
  }

  for (const [catId, cur] of Object.entries(currentCategoryTotals)) {
    const past = pastCategoryTotals[catId];
    if (past && past.sum > 0) {
      // Média mensal dos meses anteriores (2 meses)
      const historicalAvg = past.sum / 2;
      // Dispara se gasto atual já supera a média em mais de 15% e o valor for relevante (> R$ 60)
      if (historicalAvg >= 60 && cur.sum > historicalAvg * 1.15) {
        alerts.push({
          id: `above-avg-${catId}-${yearMonth}`,
          type: "above_average",
          title: `${cur.name} está acima da média`,
          body: `Você já gastou ${formatBRL(cur.sum)} em ${cur.name} este mês, acima da sua média recente de ${formatBRL(historicalAvg)}.`,
          severity: "warning",
          dedupeKey: `smart_alert:above_avg:${catId}:${yearMonth}`,
          link: "/app/financas",
          actionLabel: "Ver Gastos",
          categoryName: cur.name,
          metadata: { currentSpent: cur.sum, historicalAvg, catId },
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ALERTA 5: "Faltam R$ 420 para sua meta"
  // ─────────────────────────────────────────────────────────────
  let qg: any = supabase.from("goals").select("*").neq("status", "completed").neq("status", "paused");
  qg = applySpaceFilter(qg, { space: opts.space, userId: opts.userId, coupleId: opts.coupleId });
  const { data: goalsData } = await qg;
  const activeGoals = (goalsData ?? []) as any[];

  for (const goal of activeGoals) {
    const target = Number(goal.target_amount || 0);
    const current = Number(goal.current_amount || 0);
    const diff = Math.max(0, target - current);

    // Se a meta está em andamento e faltam menos de R$ 1.500 ou menos de 30% para concluir
    if (diff > 0 && target > 0 && (diff <= 1500 || diff <= target * 0.35)) {
      const bucket = Math.floor(diff / 50) * 50; // Agrupa de 50 em 50 para evitar spam
      const pct = Math.round((current / target) * 100);

      alerts.push({
        id: `goal-${goal.id}-${bucket}`,
        type: "goal_pacing",
        title: `Faltam ${formatBRL(diff)} para sua meta`,
        body: `Você já acumulou ${pct}% (${formatBRL(current)} de ${formatBRL(target)}) para a meta "${goal.name}". Falta muito pouco para conquistar!`,
        severity: "info",
        dedupeKey: `smart_alert:goal:${goal.id}:${bucket}`,
        link: "/app/metas",
        actionLabel: "Ver Meta",
        metadata: { goalId: goal.id, diff, target, current, pct, goalName: goal.name },
      });
    }
  }

  return alerts;
}

/**
 * Sincroniza os alertas gerados com a tabela `notifications` do banco de dados,
 * garantindo ESTRITAMENTE a regra "Evitar notificações repetitivas" via dedupe_key.
 */
export async function syncSmartAlertsToDatabase(
  userId: string,
  alerts: SmartAlert[]
): Promise<number> {
  if (!userId || alerts.length === 0) return 0;

  try {
    const dedupeKeys = alerts.map((a) => a.dedupeKey);

    // 1. Busca notificações já existentes com essas chaves para este usuário
    const { data: existingRows } = await supabase
      .from("notifications")
      .select("dedupe_key")
      .eq("user_id", userId)
      .in("dedupe_key", dedupeKeys);

    const existingSet = new Set((existingRows ?? []).map((r: any) => r.dedupe_key));

    // 2. Filtra estritamente os alertas que AINDA NÃO EXISTEM
    const newAlerts = alerts.filter((a) => !existingSet.has(a.dedupeKey));

    if (newAlerts.length === 0) {
      return 0;
    }

    // 3. Insere apenas os novos alertas
    const toInsert = newAlerts.map((a) => ({
      user_id: userId,
      title: a.title,
      body: a.body,
      dedupe_key: a.dedupeKey,
      type: "smart_alert",
      link: a.link,
      read: false,
    }));

    const { error } = await supabase.from("notifications").insert(toInsert);
    if (error) {
      console.warn("Aviso ao persistir alertas inteligentes (ignorado para evitar quebra):", error.message);
    }

    return newAlerts.length;
  } catch (err) {
    console.warn("Erro ao sincronizar notificações inteligentes:", err);
    return 0;
  }
}

/**
 * Hook React Query que avalia e sincroniza alertas inteligentes em background.
 */
export function useSmartAlerts(opts: SmartAlertsOptions, refDate: Date = new Date()) {
  const monthKey = `${refDate.getFullYear()}-${refDate.getMonth()}`;

  return useQuery({
    queryKey: ["smart-alerts", monthKey, opts.space, opts.coupleId, opts.userId],
    queryFn: async () => {
      const activeAlerts = await evaluateSmartAlerts(opts, refDate);
      if (opts.userId && activeAlerts.length > 0) {
        // Sincroniza em background com deduplicação sem travar a interface
        syncSmartAlertsToDatabase(opts.userId, activeAlerts).catch(console.error);
      }
      return activeAlerts;
    },
    enabled: !!opts.userId,
    staleTime: 1000 * 60 * 2, // 2 minutos
  });
}
