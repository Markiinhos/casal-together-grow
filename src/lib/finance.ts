// Helpers financeiros — cálculos e queries reutilizáveis
import { supabase } from "@/integrations/supabase/client";
import type { Space } from "@/lib/space";
import { getLocalISODate } from "./date-utils";

export function monthRange(ref: Date): { start: string; end: string; startDate: Date; endDate: Date } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return {
    start: getLocalISODate(start),
    end: getLocalISODate(end),
    startDate: start,
    endDate: end,
  };
}

export function monthLabel(ref: Date): string {
  return ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function firstOfMonth(ref: Date): string {
  return getLocalISODate(new Date(ref.getFullYear(), ref.getMonth(), 1));
}

export function daysRemaining(ref: Date): number {
  const now = new Date();
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  if (
    ref.getFullYear() < now.getFullYear() ||
    (ref.getFullYear() === now.getFullYear() && ref.getMonth() < now.getMonth())
  ) {
    return 0; // mês passado
  }
  if (ref.getFullYear() > now.getFullYear() || ref.getMonth() > now.getMonth()) {
    return end.getDate(); // mês futuro
  }
  const remaining = end.getDate() - now.getDate() + 1;
  return Math.max(0, remaining);
}

export function safePercent(spent: number, budget: number): number | null {
  if (!budget || budget <= 0) return null;
  return (spent / budget) * 100;
}

export function budgetStatus(pct: number | null): {
  key: "no_budget" | "safe" | "attention" | "close" | "exceeded";
  label: string;
  color: string;
} {
  if (pct === null) return { key: "no_budget", label: "Sem orçamento", color: "bg-muted text-muted-foreground" };
  if (pct >= 100) return { key: "exceeded", label: "Limite excedido", color: "bg-destructive/10 text-destructive" };
  if (pct >= 90) return { key: "close", label: "Próximo do limite", color: "bg-orange-500/10 text-orange-600" };
  if (pct >= 70) return { key: "attention", label: "Atenção", color: "bg-yellow-500/10 text-yellow-700" };
  return { key: "safe", label: "Dentro do planejado", color: "bg-success/10 text-success" };
}

export interface SpaceOpts {
  space: Space;
  userId: string;
  coupleId: string | null;
}

/** Soma saldos das contas ativas conforme espaço */
export async function fetchAccountsTotal(opts: SpaceOpts): Promise<number> {
  let q: any = supabase.from("bank_accounts").select("balance").eq("hidden", false);
  if (opts.space === "private") {
    q = q.eq("visibility", "private").eq("user_id", opts.userId);
  } else if (opts.coupleId) {
    q = q.eq("visibility", "shared").eq("couple_id", opts.coupleId);
  } else {
    q = q.eq("visibility", "shared").eq("user_id", opts.userId);
  }
  const { data } = await q;
  return (data ?? []).reduce((s: number, a: any) => s + Number(a.balance ?? 0), 0);
}

/**
 * Despesas contabilizadas do mês:
 * - Transações à vista (Pix/dinheiro/débito) na data da transação (sem credit_card_id)
 * - Parcelas do mês (installments.due_date) — inclui compras parceladas
 * - Compras no cartão à vista → vão para o mês da fatura (calculado via credit_card + closing_day)
 * - EXCLUI transferências (type='transfer') e pagamentos de fatura (is_card_payment=true)
 */
export async function fetchMonthExpenses(ref: Date, opts: SpaceOpts): Promise<{
  total: number;
  byCategory: Record<string, number>;
}> {
  const { start, end } = monthRange(ref);
  const byCategory: Record<string, number> = {};
  let total = 0;

  // 1. Transações à vista (não cartão, não transfer, não pagamento de fatura)
  let q1: any = supabase
    .from("transactions")
    .select("amount,category_id,credit_card_id,total_installments,type,is_card_payment,date,credit_cards(closing_day)")
    .eq("type", "expense")
    .eq("is_card_payment", false)
    .is("credit_card_id", null)
    .is("total_installments", null)
    .gte("date", start)
    .lte("date", end);
  if (opts.space === "private") q1 = q1.eq("visibility", "private").eq("user_id", opts.userId);
  else if (opts.coupleId) q1 = q1.eq("visibility", "shared").eq("couple_id", opts.coupleId);
  else q1 = q1.eq("visibility", "shared").eq("user_id", opts.userId);
  const { data: cash } = await q1;
  for (const t of (cash ?? []) as any[]) {
    const v = Number(t.amount);
    total += v;
    const k = t.category_id ?? "__none__";
    byCategory[k] = (byCategory[k] ?? 0) + v;
  }

  // 2. Parcelas com due_date no mês
  let q2: any = supabase
    .from("installments")
    .select("amount,due_date,transactions!inner(category_id,visibility,couple_id,user_id,type,is_card_payment)")
    .gte("due_date", start)
    .lte("due_date", end);
  const { data: inst } = await q2;
  for (const i of (inst ?? []) as any[]) {
    const tx = i.transactions;
    if (!tx || tx.type !== "expense" || tx.is_card_payment) continue;
    if (opts.space === "private") {
      if (tx.visibility !== "private" || tx.user_id !== opts.userId) continue;
    } else if (opts.coupleId) {
      if (tx.visibility !== "shared" || tx.couple_id !== opts.coupleId) continue;
    } else {
      if (tx.visibility !== "shared" || tx.user_id !== opts.userId) continue;
    }
    const v = Number(i.amount);
    total += v;
    const k = tx.category_id ?? "__none__";
    byCategory[k] = (byCategory[k] ?? 0) + v;
  }

  // 3. Compras no cartão à vista (credit_card_id não nulo, sem parcelas) → mês da fatura
  let q3: any = supabase
    .from("transactions")
    .select("amount,category_id,date,credit_cards!inner(closing_day)")
    .eq("type", "expense")
    .eq("is_card_payment", false)
    .not("credit_card_id", "is", null)
    .is("total_installments", null);
  if (opts.space === "private") q3 = q3.eq("visibility", "private").eq("user_id", opts.userId);
  else if (opts.coupleId) q3 = q3.eq("visibility", "shared").eq("couple_id", opts.coupleId);
  else q3 = q3.eq("visibility", "shared").eq("user_id", opts.userId);
  const { data: cards } = await q3;
  for (const t of (cards ?? []) as any[]) {
    const closing = Number(t.credit_cards?.closing_day ?? 1);
    const d = new Date(t.date + "T00:00:00");
    // Fatura do mês seguinte se compra após o fechamento
    const invMonth = new Date(d.getFullYear(), d.getMonth() + (d.getDate() >= closing ? 1 : 0), 1);
    if (invMonth.getFullYear() === ref.getFullYear() && invMonth.getMonth() === ref.getMonth()) {
      const v = Number(t.amount);
      total += v;
      const k = t.category_id ?? "__none__";
      byCategory[k] = (byCategory[k] ?? 0) + v;
    }
  }

  return { total, byCategory };
}

export async function fetchMonthIncome(ref: Date, opts: SpaceOpts): Promise<number> {
  const { start, end } = monthRange(ref);
  let q: any = supabase
    .from("transactions")
    .select("amount")
    .eq("type", "income")
    .gte("date", start)
    .lte("date", end);
  if (opts.space === "private") q = q.eq("visibility", "private").eq("user_id", opts.userId);
  else if (opts.coupleId) q = q.eq("visibility", "shared").eq("couple_id", opts.coupleId);
  else q = q.eq("visibility", "shared").eq("user_id", opts.userId);
  const { data } = await q;
  return (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
}

/** Fatura do cartão para um mês de referência */
export async function fetchCardInvoice(cardId: string, closing: number, ref: Date): Promise<{
  total: number;
  count: number;
  installments: number;
}> {
  // Busca da nova tabela card_invoices usando o reference_month correspondente
  const refString = getLocalISODate(new Date(ref.getFullYear(), ref.getMonth(), 1));
  const { data } = await supabase
    .from("card_invoices")
    .select("total_amount")
    .eq("card_id", cardId)
    .eq("reference_month", refString)
    .maybeSingle();

  return {
    total: Number(data?.total_amount ?? 0),
    count: 0,
    installments: 0,
  };
}

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function hideOrShow(v: number, hidden: boolean): string {
  return hidden ? "R$ ••••" : formatBRL(v);
}
