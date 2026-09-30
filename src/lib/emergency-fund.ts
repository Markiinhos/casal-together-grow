import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import { monthlyAmount } from "@/lib/finance";
import { fetchSubscriptions, monthlyEquivalent, Subscription } from "@/lib/subscriptions";
import { useQuery } from "@tanstack/react-query";
import type { SpaceFilterOpts } from "@/lib/financial-engine/types";
import { toISODateOnly, syncGoalCurrentAmount } from "@/lib/financial-goals";

export interface EssentialExpenseItem {
  id: string;
  title: string;
  amount: number;
  monthlyAmount: number;
  type: "fixed_bill" | "variable_expense" | "subscription";
  isEssential: boolean;
  categoryName?: string;
  recurrenceOrFrequency?: string;
}

export interface EssentialExpensesSummary {
  essentialFixedTotal: number;
  essentialVariableTotal: number;
  essentialSubscriptionsTotal: number;
  monthlyEssentialCost: number;
  fixedList: EssentialExpenseItem[];
  variableList: EssentialExpenseItem[];
  subscriptionsList: EssentialExpenseItem[];
}

export interface EmergencyFundCalculation {
  goal: any | null;
  goalId: string | null;
  goalName: string;
  currentReserve: number; // Reserva atual (R$ 8.000)
  monthlyEssentialCost: number; // Custo essencial mensal (R$ 3.200)
  coverageMonths: number; // Cobertura (2,5 meses)
  targetMonths: number; // Meses alvo da meta (ex: 3, 6, 12 ou custom)
  targetAmount: number; // Valor alvo da meta (ex: R$ 19.200)
  remainingAmount: number; // Faltam (ex: R$ 11.200)
  progressPct: number; // Percentual concluído
  isCompleted: boolean;
  essentialSummary: EssentialExpensesSummary;
}

// Heurísticas de fallback para despesas essenciais caso o usuário ainda não tenha configurado
export function isHeuristicallyEssentialFixed(title: string, categoryName?: string): boolean {
  const t = (title + " " + (categoryName || "")).toLowerCase();
  if (
    t.includes("netflix") ||
    t.includes("spotify") ||
    t.includes("jogos") ||
    t.includes("academia luxo") ||
    t.includes("lazer")
  ) {
    return false;
  }
  return true;
}

export function isHeuristicallyEssentialVariable(name: string, categoryName?: string): boolean {
  const t = (name + " " + (categoryName || "")).toLowerCase();
  const essentialKeywords = [
    "mercado", "supermercado", "feira", "açougue", "alimentação", "comida",
    "farmácia", "saúde", "remédio", "medicamento", "hospital",
    "combustível", "gasolina", "transporte", "ônibus", "metrô", "pet", "veterinário"
  ];
  return essentialKeywords.some((kw) => t.includes(kw));
}

export function isHeuristicallyEssentialSubscription(name: string, categoryName?: string): boolean {
  const t = (name + " " + (categoryName || "")).toLowerCase();
  const essentialKeywords = [
    "saúde", "plano de saúde", "médico", "seguro", "vida", "previdência", "dental", "odonto"
  ];
  return essentialKeywords.some((kw) => t.includes(kw));
}

/**
 * Consulta e calcula todas as despesas essenciais do espaço atual.
 */
export async function getEssentialExpensesSummary(
  opts: SpaceFilterOpts
): Promise<EssentialExpensesSummary> {
  const [billsRes, variablesRes, subsRes] = await Promise.all([
    // 1. Contas fixas
    (async () => {
      let q: any = supabase
        .from("future_bills")
        .select("id, title, amount, recurrence, is_active, notes, category_id, categories(name)")
        .eq("is_active", true)
        .neq("recurrence", "once");
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // 2. Despesas variáveis
    (async () => {
      let q: any = supabase
        .from("variable_expenses")
        .select("id, name, estimated_amount, is_active, notes, category_id, categories!variable_expenses_category_id_fkey(name)")
        .eq("is_active", true);
      q = applySpaceFilter(q, opts);
      const { data } = await q;
      return (data ?? []) as any[];
    })(),

    // 3. Assinaturas
    (async () => {
      const subs = await fetchSubscriptions({
        space: opts.space,
        userId: opts.userId,
        coupleId: opts.coupleId,
      });
      return subs.filter((s) => s.status === "active");
    })(),
  ]);

  // Processa Fixas
  const fixedList: EssentialExpenseItem[] = [];
  let essentialFixedTotal = 0;

  for (const b of billsRes) {
    const mAmount = monthlyAmount(Number(b.amount || 0), b.recurrence);
    let isEssential: boolean;

    if (b.is_essential !== undefined && b.is_essential !== null) {
      isEssential = Boolean(b.is_essential);
    } else if (b.notes && typeof b.notes === "string" && b.notes.includes("[ESSENTIAL]")) {
      isEssential = true;
    } else if (b.notes && typeof b.notes === "string" && b.notes.includes("[NON_ESSENTIAL]")) {
      isEssential = false;
    } else {
      isEssential = isHeuristicallyEssentialFixed(b.title, b.categories?.name);
    }

    if (isEssential) {
      essentialFixedTotal += mAmount;
    }

    fixedList.push({
      id: b.id,
      title: b.title,
      amount: Number(b.amount || 0),
      monthlyAmount: Math.round(mAmount * 100) / 100,
      type: "fixed_bill",
      isEssential,
      categoryName: b.categories?.name,
      recurrenceOrFrequency: b.recurrence,
    });
  }

  // Processa Variáveis
  const variableList: EssentialExpenseItem[] = [];
  let essentialVariableTotal = 0;

  for (const v of variablesRes) {
    const est = Number(v.estimated_amount || 0);
    let isEssential: boolean;

    if (v.is_essential !== undefined && v.is_essential !== null) {
      isEssential = Boolean(v.is_essential);
    } else if (v.notes && typeof v.notes === "string" && v.notes.includes("[ESSENTIAL]")) {
      isEssential = true;
    } else if (v.notes && typeof v.notes === "string" && v.notes.includes("[NON_ESSENTIAL]")) {
      isEssential = false;
    } else {
      isEssential = isHeuristicallyEssentialVariable(v.name, v.categories?.name);
    }

    if (isEssential) {
      essentialVariableTotal += est;
    }

    variableList.push({
      id: v.id,
      title: v.name,
      amount: est,
      monthlyAmount: est,
      type: "variable_expense",
      isEssential,
      categoryName: v.categories?.name,
    });
  }

  // Processa Assinaturas
  const subscriptionsList: EssentialExpenseItem[] = [];
  let essentialSubscriptionsTotal = 0;

  for (const s of subsRes) {
    const mAmount = monthlyEquivalent(s);
    let isEssential: boolean;

    if ((s as any).is_essential !== undefined && (s as any).is_essential !== null) {
      isEssential = Boolean((s as any).is_essential);
    } else if (s.metadata?.is_essential !== undefined) {
      isEssential = Boolean(s.metadata.is_essential);
    } else if (s.description && s.description.includes("[ESSENTIAL]")) {
      isEssential = true;
    } else {
      isEssential = isHeuristicallyEssentialSubscription(s.name, s.categories?.name);
    }

    if (isEssential) {
      essentialSubscriptionsTotal += mAmount;
    }

    subscriptionsList.push({
      id: s.id,
      title: s.name,
      amount: s.amount,
      monthlyAmount: Math.round(mAmount * 100) / 100,
      type: "subscription",
      isEssential,
      categoryName: s.categories?.name,
      recurrenceOrFrequency: s.billing_frequency,
    });
  }

  const monthlyEssentialCost =
    Math.round((essentialFixedTotal + essentialVariableTotal + essentialSubscriptionsTotal) * 100) /
    100;

  return {
    essentialFixedTotal: Math.round(essentialFixedTotal * 100) / 100,
    essentialVariableTotal: Math.round(essentialVariableTotal * 100) / 100,
    essentialSubscriptionsTotal: Math.round(essentialSubscriptionsTotal * 100) / 100,
    monthlyEssentialCost,
    fixedList,
    variableList,
    subscriptionsList,
  };
}

/**
 * Consulta e calcula os dados da Meta Especial de Reserva de Emergência.
 */
export async function getEmergencyFundCalculation(
  opts: SpaceFilterOpts
): Promise<EmergencyFundCalculation> {
  const essentialSummary = await getEssentialExpensesSummary(opts);
  const monthlyEssentialCost = essentialSummary.monthlyEssentialCost;

  // Busca a meta especial de Reserva de Emergência em goals
  let q: any = supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false });
  q = applySpaceFilter(q, opts);
  const { data: allGoals } = await q;

  const goals = (allGoals ?? []) as any[];

  // Identifica a meta de Reserva de Emergência
  const emergencyGoal = goals.find((g) => {
    if (g.is_emergency_fund) return true;
    const nameLower = (g.name || "").toLowerCase();
    if (nameLower.includes("reserva") && (nameLower.includes("emergência") || nameLower.includes("emergencia"))) {
      return true;
    }
    if (g.category === "Emergência" || g.category === "Reserva") {
      if (nameLower.includes("reserva") || g.description?.includes("emergency_fund")) {
        return true;
      }
    }
    return false;
  }) || null;

  // Extrai target_months
  let targetMonths = 6; // Padrão recomendado
  if (emergencyGoal) {
    if (emergencyGoal.target_months) {
      targetMonths = Number(emergencyGoal.target_months);
    } else if (emergencyGoal.description) {
      const match = emergencyGoal.description.match(/target_months=([0-9.]+)/);
      if (match) targetMonths = parseFloat(match[1]);
    }
  }

  const currentReserve = emergencyGoal ? Number(emergencyGoal.current_amount || 0) : 0;

  // Se a meta já tem target_amount definido pelo usuário, usa ele; senão calcula targetMonths * monthlyEssentialCost
  let targetAmount = emergencyGoal && Number(emergencyGoal.target_amount || 0) > 0
    ? Number(emergencyGoal.target_amount)
    : monthlyEssentialCost > 0
    ? Math.round(targetMonths * monthlyEssentialCost * 100) / 100
    : 0;

  // Se a meta tiver targetAmount e monthlyEssentialCost > 0, atualizamos targetMonths proporcional
  if (emergencyGoal && monthlyEssentialCost > 0 && targetAmount > 0 && !emergencyGoal.target_months) {
    const derivedMonths = targetAmount / monthlyEssentialCost;
    if ([3, 6, 12].includes(Math.round(derivedMonths))) {
      targetMonths = Math.round(derivedMonths);
    }
  }

  // Cobertura em meses
  const coverageMonths =
    monthlyEssentialCost > 0
      ? Math.round((currentReserve / monthlyEssentialCost) * 10) / 10
      : 0;

  const remainingAmount = Math.max(0, targetAmount - currentReserve);
  const progressPct =
    targetAmount > 0
      ? Math.min(100, Math.round((currentReserve / targetAmount) * 1000) / 10)
      : 0;

  const isCompleted = currentReserve >= targetAmount && targetAmount > 0;

  return {
    goal: emergencyGoal,
    goalId: emergencyGoal?.id ?? null,
    goalName: emergencyGoal?.name || "Reserva de Emergência",
    currentReserve,
    monthlyEssentialCost,
    coverageMonths,
    targetMonths,
    targetAmount,
    remainingAmount,
    progressPct,
    isCompleted,
    essentialSummary,
  };
}

/**
 * Hook React Query para a Reserva de Emergência
 */
export function useEmergencyFund(opts: SpaceFilterOpts, enabled: boolean = true) {
  return useQuery({
    queryKey: ["emergency-fund", opts.space, opts.coupleId, opts.userId],
    queryFn: () => getEmergencyFundCalculation(opts),
    enabled: enabled && !!opts.userId,
    staleTime: 1000 * 20, // 20s
  });
}

/**
 * Cria ou atualiza a Meta Especial de Reserva de Emergência
 */
export async function saveEmergencyFundGoal({
  goalId,
  targetMonths,
  targetAmount,
  initialReserve,
  opts,
}: {
  goalId?: string | null;
  targetMonths: number;
  targetAmount: number;
  initialReserve?: number;
  opts: SpaceFilterOpts;
}) {
  const metaTag = `[META:category=Reserva|goal_type=emergency_fund|target_months=${targetMonths}]`;
  const description = `${metaTag}\nReserva de emergência para proteção e tranquilidade financeira do casal.`;

  if (goalId) {
    // Atualiza meta existente
    const updatePayload: any = {
      target_amount: targetAmount,
      target_months: targetMonths,
      is_emergency_fund: true,
      description,
      updated_at: new Date().toISOString(),
    };

    const res = await supabase.from("goals").update(updatePayload).eq("id", goalId);
    if (res.error && (res.error.message.includes("column") || res.error.message.includes("schema cache"))) {
      // Fallback sem target_months / is_emergency_fund
      await supabase
        .from("goals")
        .update({
          target_amount: targetAmount,
          description,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", goalId);
    }

    if (initialReserve !== undefined) {
      await syncGoalCurrentAmount(goalId);
    }
  } else {
    // Cria nova meta
    const insertPayload: any = {
      user_id: opts.userId,
      couple_id: opts.space === "shared" ? opts.coupleId : null,
      visibility: opts.space,
      name: "Reserva de Emergência",
      category: "Reserva",
      goal_type: "emergency_fund",
      target_amount: targetAmount,
      target_months: targetMonths,
      is_emergency_fund: true,
      current_amount: initialReserve || 0,
      status: (initialReserve || 0) >= targetAmount && targetAmount > 0 ? "completed" : "active",
      description,
      start_date: toISODateOnly(new Date()),
    };

    const res = await supabase.from("goals").insert(insertPayload).select().single();
    if (res.error && (res.error.message.includes("column") || res.error.message.includes("schema cache"))) {
      // Fallback
      const fbPayload: any = {
        user_id: opts.userId,
        couple_id: opts.space === "shared" ? opts.coupleId : null,
        visibility: opts.space,
        name: "Reserva de Emergência",
        target_amount: targetAmount,
        current_amount: initialReserve || 0,
        status: (initialReserve || 0) >= targetAmount && targetAmount > 0 ? "completed" : "active",
        description,
      };
      const fbRes = await supabase.from("goals").insert(fbPayload).select().single();
      if (fbRes.error) throw fbRes.error;
      return fbRes.data;
    }

    if (res.error) throw res.error;
    return res.data;
  }
}

/**
 * Atualiza o status essencial de uma despesa (fixa, variável ou assinatura)
 */
export async function toggleExpenseEssentialStatus({
  id,
  type,
  isEssential,
}: {
  id: string;
  type: "fixed_bill" | "variable_expense" | "subscription";
  isEssential: boolean;
}) {
  if (type === "fixed_bill") {
    const res = await supabase
      .from("future_bills")
      .update({ is_essential: isEssential } as any)
      .eq("id", id);

    if (res.error && (res.error.message.includes("column") || res.error.message.includes("schema cache"))) {
      // Fallback via notes
      const { data: bill } = await supabase.from("future_bills").select("notes").eq("id", id).single();
      let notes = (bill?.notes || "").replace(/\[ESSENTIAL\]|\[NON_ESSENTIAL\]/g, "").trim();
      notes = `${notes} ${isEssential ? "[ESSENTIAL]" : "[NON_ESSENTIAL]"}`.trim();
      await supabase.from("future_bills").update({ notes } as any).eq("id", id);
    }
  } else if (type === "variable_expense") {
    const res = await supabase
      .from("variable_expenses")
      .update({ is_essential: isEssential } as any)
      .eq("id", id);

    if (res.error && (res.error.message.includes("column") || res.error.message.includes("schema cache"))) {
      const { data: v } = await supabase.from("variable_expenses").select("notes").eq("id", id).single();
      let notes = (v?.notes || "").replace(/\[ESSENTIAL\]|\[NON_ESSENTIAL\]/g, "").trim();
      notes = `${notes} ${isEssential ? "[ESSENTIAL]" : "[NON_ESSENTIAL]"}`.trim();
      await supabase.from("variable_expenses").update({ notes } as any).eq("id", id);
    }
  } else if (type === "subscription") {
    const res = await supabase
      .from("subscriptions")
      .update({ is_essential: isEssential } as any)
      .eq("id", id);

    if (res.error && (res.error.message.includes("column") || res.error.message.includes("schema cache"))) {
      const { data: sub } = await supabase.from("subscriptions").select("metadata").eq("id", id).single();
      const metadata = { ...((sub?.metadata as any) || {}), is_essential: isEssential };
      await supabase.from("subscriptions").update({ metadata } as any).eq("id", id);
    }
  }
}
