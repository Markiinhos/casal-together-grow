import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import { monthRange } from "@/lib/finance";
import type { SpaceFilterOpts, FinancialSnapshot } from "./financial-engine";

export interface MonthlyClosingBreakdown {
  fixedExpenses: number;
  variableExpenses: number;
  cardExpenses: number;
  subscriptions: number;
  otherExpenses: number;
  goals: number;
  structuredIncome: number;
  extraIncome: number;
}

export interface MonthlyClosingRecord {
  id: string;
  user_id: string;
  couple_id: string | null;
  visibility: "private" | "shared";
  reference_month: string; // YYYY-MM-01
  status: "closed" | "reopened";
  total_income: number;
  total_expenses: number;
  monthly_balance: number;
  savings_rate: number;
  breakdown: MonthlyClosingBreakdown;
  snapshot_data: any;
  closed_at: string;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Calcula a taxa de economia:
 * Formula: se Receitas > 0 e Resultado > 0 => (Resultado / Receitas) * 100
 * Exemplo do usuário:
 * Receitas: 8.450, Despesas: 6.720, Resultado: 1.730 => Taxa: 20,47%
 */
export function computeSavingsRate(income: number, expenses: number): number {
  if (income <= 0) return 0;
  const result = income - expenses;
  if (result <= 0) return 0;
  const rate = (result / income) * 100;
  return Math.round(rate * 100) / 100;
}

/**
 * Formata a taxa de economia em percentual pt-BR (ex: "20,47%")
 */
export function formatSavingsRate(rate: number): string {
  return `${rate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** LocalStorage fallback key para resiliência caso a migration ainda não esteja no schema cache */
function getLocalFallbackKey(userId: string, space: string): string {
  return `casal_monthly_closings_${userId}_${space}`;
}

function getLocalClosings(userId: string, space: string): MonthlyClosingRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getLocalFallbackKey(userId, space));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalClosing(userId: string, space: string, record: MonthlyClosingRecord) {
  if (typeof window === "undefined") return;
  try {
    const list = getLocalClosings(userId, space).filter(
      (c) => c.reference_month !== record.reference_month
    );
    list.unshift(record);
    localStorage.setItem(getLocalFallbackKey(userId, space), JSON.stringify(list));
  } catch (e) {
    console.error("Erro ao salvar fallback local de fechamento:", e);
  }
}

function updateLocalClosingStatus(
  userId: string,
  space: string,
  id: string,
  status: "closed" | "reopened",
  reopenedAt?: string,
  reopenReason?: string
) {
  if (typeof window === "undefined") return;
  try {
    const list = getLocalClosings(userId, space).map((c) => {
      if (c.id === id) {
        return {
          ...c,
          status,
          reopened_at: reopenedAt || c.reopened_at,
          reopen_reason: reopenReason || c.reopen_reason,
          updated_at: new Date().toISOString(),
        };
      }
      return c;
    });
    localStorage.setItem(getLocalFallbackKey(userId, space), JSON.stringify(list));
  } catch (e) {
    console.error("Erro ao atualizar fallback local de fechamento:", e);
  }
}

/**
 * Busca o total de aportes em metas no mês
 */
export async function fetchMonthGoalsTotal(
  refDate: Date,
  opts: SpaceFilterOpts
): Promise<number> {
  const { start, end } = monthRange(refDate);
  try {
    let q: any = supabase
      .from("goal_contributions")
      .select("amount, date, user_id")
      .gte("date", start)
      .lte("date", end);

    if (opts.space === "private") {
      q = q.eq("user_id", opts.userId);
    }

    const { data, error } = await q;
    if (error) {
      return 0;
    }
    return (data ?? []).reduce((acc: number, c: any) => acc + Number(c.amount || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Busca o fechamento de um mês específico
 */
export async function fetchMonthlyClosing(
  refDate: Date,
  opts: SpaceFilterOpts
): Promise<MonthlyClosingRecord | null> {
  const refMonthStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}-01`;

  try {
    let q: any = supabase
      .from("monthly_closings" as any)
      .select("*")
      .eq("reference_month", refMonthStr);

    q = applySpaceFilter(q, opts);

    const { data, error } = await q.maybeSingle();

    if (error) {
      if (error.message.includes("schema cache") || error.message.includes("does not exist")) {
        // Fallback local
        const localList = getLocalClosings(opts.userId, opts.space);
        const found = localList.find((c) => c.reference_month === refMonthStr);
        return found ?? null;
      }
      console.warn("Erro ao buscar monthly_closings:", error.message);
      return null;
    }

    return (data as any) ?? null;
  } catch (err: any) {
    console.warn("Erro inesperado em fetchMonthlyClosing, consultando fallback:", err);
    const localList = getLocalClosings(opts.userId, opts.space);
    return localList.find((c) => c.reference_month === refMonthStr) ?? null;
  }
}

/**
 * Busca o histórico de todos os fechamentos realizados
 */
export async function fetchMonthlyClosingsHistory(
  opts: SpaceFilterOpts
): Promise<MonthlyClosingRecord[]> {
  try {
    let q: any = supabase
      .from("monthly_closings" as any)
      .select("*")
      .order("reference_month", { ascending: false });

    q = applySpaceFilter(q, opts);

    const { data, error } = await q;

    if (error) {
      if (error.message.includes("schema cache") || error.message.includes("does not exist")) {
        return getLocalClosings(opts.userId, opts.space);
      }
      return getLocalClosings(opts.userId, opts.space);
    }

    const remoteList = (data as any[]) ?? [];
    const localList = getLocalClosings(opts.userId, opts.space);

    // Mescla garantindo que itens locais não sincronizados ainda apareçam
    const map = new Map<string, MonthlyClosingRecord>();
    for (const item of localList) {
      map.set(item.reference_month, item);
    }
    for (const item of remoteList) {
      map.set(item.reference_month, item);
    }

    return Array.from(map.values()).sort((a, b) =>
      b.reference_month.localeCompare(a.reference_month)
    );
  } catch {
    return getLocalClosings(opts.userId, opts.space);
  }
}

/**
 * Executa o FECHAMENTO DO MÊS:
 * Grava o snapshot congelado no Supabase e no histórico sem alterar transações existentes.
 */
export async function closeMonth({
  refDate,
  opts,
  notes,
  snapshot,
  goalsTotal,
}: {
  refDate: Date;
  opts: SpaceFilterOpts;
  notes?: string;
  snapshot: FinancialSnapshot;
  goalsTotal: number;
}): Promise<MonthlyClosingRecord> {
  const refMonthStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}-01`;

  const totalIncome = snapshot.summary.totalIncome;
  const totalExpenses = snapshot.summary.totalExpenses;
  const monthlyBalance = snapshot.summary.monthlyBalance;
  const savingsRate = computeSavingsRate(totalIncome, totalExpenses);

  const breakdown: MonthlyClosingBreakdown = {
    fixedExpenses: snapshot.summary.breakdown.fixedExpenses,
    variableExpenses: snapshot.summary.breakdown.variableExpenses,
    cardExpenses: snapshot.summary.breakdown.cardExpenses,
    subscriptions: snapshot.summary.breakdown.subscriptions,
    otherExpenses: snapshot.summary.breakdown.otherExpenses,
    goals: Math.round(goalsTotal * 100) / 100,
    structuredIncome: snapshot.summary.breakdown.structuredIncome,
    extraIncome: snapshot.summary.breakdown.extraIncome,
  };

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: opts.userId,
    couple_id: opts.space === "shared" ? opts.coupleId : null,
    visibility: opts.space,
    reference_month: refMonthStr,
    status: "closed" as const,
    total_income: totalIncome,
    total_expenses: totalExpenses,
    monthly_balance: monthlyBalance,
    savings_rate: savingsRate,
    breakdown,
    snapshot_data: snapshot,
    closed_at: nowIso,
    closed_by: opts.userId,
    notes: notes || null,
  };

  let savedRecord: MonthlyClosingRecord | null = null;

  try {
    // Upsert na tabela monthly_closings
    const { data, error } = await supabase
      .from("monthly_closings" as any)
      .upsert(payload, { onConflict: "user_id,reference_month,visibility" })
      .select("*")
      .single();

    if (error) {
      console.warn("Aviso ao salvar no Supabase (usando fallback local resiliente):", error.message);
    } else {
      savedRecord = data as any;
    }
  } catch (err: any) {
    console.warn("Exceção ao persistir no Supabase:", err);
  }

  if (!savedRecord) {
    savedRecord = {
      id: "local-" + Date.now(),
      ...payload,
      reopened_at: null,
      reopened_by: null,
      reopen_reason: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
  }

  // Sempre espelha localmente para resiliência offline e cache imediato
  saveLocalClosing(opts.userId, opts.space, savedRecord);

  return savedRecord;
}

/**
 * Reabre um mês previamente fechado com registro de confirmação e motivo
 */
export async function reopenMonth({
  closingId,
  refMonthStr,
  opts,
  reason,
}: {
  closingId: string;
  refMonthStr: string;
  opts: SpaceFilterOpts;
  reason?: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  try {
    if (!closingId.startsWith("local-")) {
      const { error } = await supabase
        .from("monthly_closings" as any)
        .update({
          status: "reopened",
          reopened_at: nowIso,
          reopened_by: opts.userId,
          reopen_reason: reason || "Reabertura manual confirmada pelo usuário",
        })
        .eq("id", closingId);

      if (error) {
        console.warn("Aviso ao reabrir no Supabase:", error.message);
      }
    }
  } catch (err) {
    console.warn("Exceção ao reabrir no Supabase:", err);
  }

  // Atualiza localmente
  updateLocalClosingStatus(
    opts.userId,
    opts.space,
    closingId,
    "reopened",
    nowIso,
    reason || "Reabertura manual confirmada pelo usuário"
  );
}
