import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/finance";

export type GoalCategory =
  | "Reserva"
  | "Viagem"
  | "Compra"
  | "Emergência"
  | "Pagamento"
  | "Projeto"
  | "Outro";

export type GoalStatus =
  | "active"
  | "ahead"
  | "on_track"
  | "attention"
  | "behind"
  | "completed"
  | "expired"
  | "paused";

export type GoalPeriodQuick = "7d" | "2w" | "1m" | "3m" | "6m" | "1y";

export interface GoalContributionItem {
  id: string;
  goal_id: string;
  user_id: string;
  amount: number;
  date: string;
  note?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  created_at: string;
}

export interface GoalPacingDetails {
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progressPct: number;
  displayPct: number;
  surplusAmount: number;
  startDate: string;
  deadline: string | null;
  daysRemaining: number;
  totalDays: number;
  elapsedDays: number;
  neededPerDay: number;
  neededPerWeek: number;
  neededPerMonth: number;
  expectedPct: number;
  expectedAmount: number;
  pacingDiff: number;
  targetToday: number;
  pacingStatus: "ahead" | "on_track" | "attention" | "behind";
  computedStatus: GoalStatus;
  statusLabel: string;
  statusColor: string;
  forecastDate: string | null;
  forecastMessage: string;
  isCompleted: boolean;
  isExpired: boolean;
  isPaused: boolean;
}

/**
 * Converte data para string YYYY-MM-DD local
 */
export function toISODateOnly(d: Date | string): string {
  if (typeof d === "string") {
    return d.slice(0, 10);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Adiciona período rápido a partir de uma data inicial
 */
export function calculateDeadlineFromPeriod(
  startDateStr: string,
  period: GoalPeriodQuick
): string {
  const [y, m, d] = startDateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  switch (period) {
    case "7d":
      date.setDate(date.getDate() + 7);
      break;
    case "2w":
      date.setDate(date.getDate() + 14);
      break;
    case "1m":
      date.setMonth(date.getMonth() + 1);
      break;
    case "3m":
      date.setMonth(date.getMonth() + 3);
      break;
    case "6m":
      date.setMonth(date.getMonth() + 6);
      break;
    case "1y":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return toISODateOnly(date);
}

/**
 * Calcula a diferença em dias entre duas datas YYYY-MM-DD
 */
export function diffDays(dateA: string, dateB: string): number {
  const [yA, mA, dA] = dateA.slice(0, 10).split("-").map(Number);
  const [yB, mB, dB] = dateB.slice(0, 10).split("-").map(Number);
  const dtA = new Date(yA, mA - 1, dA).getTime();
  const dtB = new Date(yB, mB - 1, dB).getTime();
  return Math.round((dtA - dtB) / (1000 * 60 * 60 * 24));
}

/**
 * Formata data ISO para formato brasileiro DD/MM/AAAA
 */
export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return "Sem prazo";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Analisa e extrai metadados da meta (suportando colunas nativas ou fallback em description)
 */
export function parseGoalMetadata(goal: any): {
  category: GoalCategory;
  startDate: string;
  trackingMode: string;
  cleanDescription: string;
} {
  let category: GoalCategory = (goal?.category as GoalCategory) || "Reserva";
  let startDate = goal?.start_date
    ? String(goal.start_date).slice(0, 10)
    : goal?.created_at
    ? String(goal.created_at).slice(0, 10)
    : toISODateOnly(new Date());
  let trackingMode = goal?.tracking_mode || "manual";
  let cleanDescription = goal?.description || "";

  if (goal?.description && typeof goal.description === "string") {
    const metaMatch = goal.description.match(/^\[META:(.*?)\]\n?(.*)$/s);
    if (metaMatch) {
      const metaContent = metaMatch[1];
      cleanDescription = metaMatch[2] || "";
      const pairs = metaContent.split("|");
      for (const pair of pairs) {
        const [k, v] = pair.split("=");
        if (k === "category" && v) category = v as GoalCategory;
        if (k === "start_date" && v) startDate = v;
        if (k === "tracking_mode" && v) trackingMode = v;
      }
    }
  }

  return { category, startDate, trackingMode, cleanDescription };
}

/**
 * Motor central de cálculo de progresso, ritmo, faltas e previsão da meta financeira
 */
export function calculateGoalProgress(
  goal: any,
  todayDate: Date | string = new Date()
): GoalPacingDetails {
  const todayStr = toISODateOnly(todayDate);
  const targetAmount = Math.max(0, Number(goal.target_amount || 0));
  const currentAmount = Math.max(0, Number(goal.current_amount || 0));
  const remainingAmount = Math.max(0, targetAmount - currentAmount);
  const surplusAmount = Math.max(0, currentAmount - targetAmount);

  const rawPct = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
  const progressPct = Math.round(rawPct * 10) / 10;
  const displayPct = Math.min(100, progressPct);

  const meta = parseGoalMetadata(goal);
  const startDate = meta.startDate;

  const deadline = goal.deadline ? String(goal.deadline).slice(0, 10) : null;

  let totalDays = 1;
  let daysRemaining = 0;
  let elapsedDays = 0;

  if (deadline) {
    totalDays = Math.max(1, diffDays(deadline, startDate));
    daysRemaining = Math.max(0, diffDays(deadline, todayStr));
    elapsedDays = Math.min(totalDays, Math.max(0, diffDays(todayStr, startDate)));
  }

  // Valores necessários por período
  const neededPerDay =
    daysRemaining > 0 ? remainingAmount / daysRemaining : remainingAmount;
  const neededPerWeek =
    daysRemaining > 0 ? (remainingAmount / daysRemaining) * 7 : remainingAmount;
  const neededPerMonth =
    daysRemaining > 0 ? (remainingAmount / daysRemaining) * 30 : remainingAmount;

  // Progresso Esperado linear no tempo
  const expectedPct =
    totalDays > 0 ? Math.min(100, (elapsedDays / totalDays) * 100) : 0;
  const expectedAmount =
    Math.round(((targetAmount * expectedPct) / 100) * 100) / 100;
  const pacingDiff = Math.round((currentAmount - expectedAmount) * 100) / 100;
  const targetToday = expectedAmount;

  const isCompleted = currentAmount >= targetAmount && targetAmount > 0;
  const isPaused = goal.status === "paused";
  const isExpired = !!deadline && todayStr > deadline && !isCompleted;

  let pacingStatus: "ahead" | "on_track" | "attention" | "behind" = "on_track";
  let computedStatus: GoalStatus = "active";
  let statusLabel = "No ritmo";
  let statusColor = "text-primary bg-primary/10 border-primary/20";

  if (isCompleted) {
    computedStatus = "completed";
    statusLabel = "Concluída 🎉";
    statusColor = "text-success bg-success/10 border-success/20";
  } else if (isPaused) {
    computedStatus = "paused";
    statusLabel = "Pausada";
    statusColor = "text-muted-foreground bg-muted border-border";
  } else if (isExpired) {
    computedStatus = "expired";
    statusLabel = "Vencida";
    statusColor = "text-destructive bg-destructive/10 border-destructive/20";
  } else {
    // Determinação do ritmo
    if (elapsedDays === 0 || currentAmount >= expectedAmount * 1.05) {
      pacingStatus = "ahead";
      computedStatus = "ahead";
      statusLabel = "Adiantada 🎉";
      statusColor = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    } else if (currentAmount >= expectedAmount * 0.95) {
      pacingStatus = "on_track";
      computedStatus = "on_track";
      statusLabel = "No ritmo 🎯";
      statusColor = "text-blue-500 bg-blue-500/10 border-blue-500/20";
    } else if (currentAmount >= expectedAmount * 0.7) {
      pacingStatus = "attention";
      computedStatus = "attention";
      statusLabel = "Atenção ⚠️";
      statusColor = "text-amber-500 bg-amber-500/10 border-amber-500/20";
    } else {
      pacingStatus = "behind";
      computedStatus = "behind";
      statusLabel = "Precisa acelerar ⚡";
      statusColor = "text-orange-500 bg-orange-500/10 border-orange-500/20";
    }
  }

  // Previsão de conclusão
  let forecastDate: string | null = null;
  let forecastMessage = "";

  if (isCompleted) {
    forecastMessage = "Meta já atingida com sucesso!";
  } else if (isPaused) {
    forecastMessage = "Meta pausada no momento.";
  } else if (currentAmount <= 0) {
    forecastMessage = "Adicione o primeiro aporte para calcular a previsão.";
  } else {
    const activeElapsed = Math.max(1, elapsedDays);
    const dailyPace = currentAmount / activeElapsed;
    if (dailyPace > 0) {
      const daysToComplete = Math.ceil(remainingAmount / dailyPace);
      const [ty, tm, td] = todayStr.split("-").map(Number);
      const fDate = new Date(ty, tm - 1, td);
      fDate.setDate(fDate.getDate() + daysToComplete);
      forecastDate = toISODateOnly(fDate);

      if (deadline && forecastDate <= deadline) {
        forecastMessage = `No ritmo atual (${formatBRL(dailyPace)}/dia), você deve atingir a meta em ${formatDateBR(forecastDate)}.`;
      } else if (deadline) {
        forecastMessage = `No ritmo atual (${formatBRL(dailyPace)}/dia), a meta seria atingida em ${formatDateBR(forecastDate)}, após o prazo estipulado.`;
      } else {
        forecastMessage = `No ritmo atual, previsão de conclusão em ${formatDateBR(forecastDate)}.`;
      }
    } else {
      forecastMessage = "Ritmo em análise.";
    }
  }

  return {
    targetAmount,
    currentAmount,
    remainingAmount,
    progressPct,
    displayPct,
    surplusAmount,
    startDate,
    deadline,
    daysRemaining,
    totalDays,
    elapsedDays,
    neededPerDay,
    neededPerWeek,
    neededPerMonth,
    expectedPct,
    expectedAmount,
    pacingDiff,
    targetToday,
    pacingStatus,
    computedStatus,
    statusLabel,
    statusColor,
    forecastDate,
    forecastMessage,
    isCompleted,
    isExpired,
    isPaused,
  };
}

/**
 * Gera pontos de dados para o gráfico de evolução: Planejado vs Realizado ao longo dos dias
 */
export function buildGoalChartData(
  goal: any,
  contributions: GoalContributionItem[],
  pacing: GoalPacingDetails
): Array<{ dayLabel: string; planejado: number; realizado: number | null }> {
  const points: Array<{ dayLabel: string; planejado: number; realizado: number | null }> = [];
  const totalDays = pacing.totalDays || 1;
  const numSteps = Math.min(10, totalDays);
  const stepDays = Math.max(1, Math.round(totalDays / numSteps));

  const [sy, sm, sd] = pacing.startDate.split("-").map(Number);
  const startDateObj = new Date(sy, sm - 1, sd);

  const sortedContribs = [...contributions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  for (let d = 0; d <= totalDays; d += stepDays) {
    const ptDate = new Date(startDateObj);
    ptDate.setDate(ptDate.getDate() + d);
    const ptDateStr = toISODateOnly(ptDate);

    // Planejado linear até o dia d
    const plannedVal = Math.round((pacing.targetAmount * (d / totalDays)) * 100) / 100;

    // Realizado acumulado até ptDateStr
    const todayStr = toISODateOnly(new Date());
    let realizedVal: number | null = null;

    if (ptDateStr <= todayStr) {
      realizedVal = sortedContribs
        .filter((c) => c.date <= ptDateStr)
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    }

    const dayLabel = `${String(ptDate.getDate()).padStart(2, "0")}/${String(ptDate.getMonth() + 1).padStart(2, "0")}`;

    points.push({
      dayLabel,
      planejado: plannedVal,
      realizado: realizedVal,
    });
  }

  return points;
}

/**
 * Adiciona aporte à meta e recalcula o total
 */
export async function createGoalWithFallback({
  userId,
  coupleId,
  visibility,
  name,
  category,
  targetAmount,
  startDate,
  deadline,
  trackingMode,
  description,
}: {
  userId: string;
  coupleId: string | null;
  visibility: string;
  name: string;
  category: GoalCategory;
  targetAmount: number;
  startDate: string;
  deadline: string | null;
  trackingMode: string;
  description?: string | null;
}) {
  // 1. Tenta salvar com as novas colunas
  const fullPayload = {
    user_id: userId,
    couple_id: coupleId,
    visibility,
    name: name.trim(),
    category,
    goal_type: "financial",
    target_amount: targetAmount,
    current_amount: 0,
    start_date: startDate,
    deadline: deadline || null,
    tracking_mode: trackingMode,
    description: description?.trim() || null,
    status: "active",
  };

  const firstAttempt = await supabase
    .from("goals")
    .insert(fullPayload as any)
    .select()
    .single();

  if (!firstAttempt.error) {
    return firstAttempt.data;
  }

  // Se o erro indicar que a coluna não existe no schema cache do Supabase
  const isColumnError =
    firstAttempt.error.message.includes("column") ||
    firstAttempt.error.message.includes("schema cache");

  if (!isColumnError) {
    throw firstAttempt.error;
  }

  // 2. Fallback resiliente: empacota metadados na description
  const metaPrefix = `[META:category=${category}|start_date=${startDate}|tracking_mode=${trackingMode}]`;
  const packedDescription = description?.trim()
    ? `${metaPrefix}\n${description.trim()}`
    : metaPrefix;

  const fallbackPayload = {
    user_id: userId,
    couple_id: coupleId,
    visibility,
    name: name.trim(),
    target_amount: targetAmount,
    current_amount: 0,
    deadline: deadline || null,
    description: packedDescription,
    status: "active",
  };

  const fallbackAttempt = await supabase
    .from("goals")
    .insert(fallbackPayload as any)
    .select()
    .single();

  if (fallbackAttempt.error) {
    throw fallbackAttempt.error;
  }

  return fallbackAttempt.data;
}

/**
 * Adiciona aporte à meta e recalcula o total
 */
export async function addGoalContribution({
  goalId,
  userId,
  amount,
  date,
  note,
  sourceType = "manual",
  sourceId = null,
}: {
  goalId: string;
  userId: string;
  amount: number;
  date: string;
  note?: string | null;
  sourceType?: string;
  sourceId?: string | null;
}) {
  let insErr: any = null;

  // Tenta inserir com source_type e source_id se suportado
  const fullPayload = {
    goal_id: goalId,
    user_id: userId,
    amount,
    date,
    note: note || null,
    source_type: sourceType,
    source_id: sourceId,
  };

  const firstRes = await supabase.from("goal_contributions").insert(fullPayload as any);
  if (firstRes.error) {
    if (
      firstRes.error.message.includes("column") ||
      firstRes.error.message.includes("schema cache")
    ) {
      // Fallback sem source_type/source_id
      const fallbackRes = await supabase.from("goal_contributions").insert({
        goal_id: goalId,
        user_id: userId,
        amount,
        date,
        note: note || null,
      } as any);
      insErr = fallbackRes.error;
    } else {
      insErr = firstRes.error;
    }
  }

  if (insErr) throw insErr;

  // Recalcula o current_amount da meta no cliente garantindo idempotência
  await syncGoalCurrentAmount(goalId);
}

/**
 * Edita aporte e recalcula o total da meta
 */
export async function editGoalContribution({
  contributionId,
  goalId,
  amount,
  date,
  note,
}: {
  contributionId: string;
  goalId: string;
  amount: number;
  date: string;
  note?: string | null;
}) {
  const { error: updErr } = await supabase
    .from("goal_contributions")
    .update({
      amount,
      date,
      note: note || null,
    } as any)
    .eq("id", contributionId);

  if (updErr) throw updErr;

  await syncGoalCurrentAmount(goalId);
}

/**
 * Exclui aporte e recalcula o total da meta
 */
export async function deleteGoalContribution({
  contributionId,
  goalId,
  amount,
}: {
  contributionId: string;
  goalId: string;
  amount?: number;
}) {
  const { error: delErr } = await supabase
    .from("goal_contributions")
    .delete()
    .eq("id", contributionId);

  if (delErr) throw delErr;

  await syncGoalCurrentAmount(goalId);
}

/**
 * Sincroniza o current_amount da meta com a soma real de goal_contributions
 */
export async function syncGoalCurrentAmount(goalId: string): Promise<number> {
  const { data: contribs } = await supabase
    .from("goal_contributions")
    .select("amount")
    .eq("goal_id", goalId);

  const total = (contribs ?? []).reduce(
    (acc, curr) => acc + Number(curr.amount || 0),
    0
  );

  const { data: goal } = await supabase
    .from("goals")
    .select("target_amount, status")
    .eq("id", goalId)
    .single();

  const target = Number(goal?.target_amount || 0);
  const isNowCompleted = total >= target && target > 0;

  const fullUpdate = {
    current_amount: total,
    status: isNowCompleted
      ? "completed"
      : goal?.status === "completed"
      ? "active"
      : goal?.status || "active",
    completed_at: isNowCompleted ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const updateRes = await supabase
    .from("goals")
    .update(fullUpdate as any)
    .eq("id", goalId);

  if (
    updateRes.error &&
    (updateRes.error.message.includes("column") ||
      updateRes.error.message.includes("schema cache"))
  ) {
    // Fallback sem completed_at
    await supabase
      .from("goals")
      .update({
        current_amount: total,
        status: isNowCompleted
          ? "completed"
          : goal?.status === "completed"
          ? "active"
          : goal?.status || "active",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", goalId);
  }

  return total;
}

/**
 * Atualiza o prazo da meta
 */
export async function updateGoalDeadline(
  goalId: string,
  newDeadline: string | null
) {
  const { error } = await supabase
    .from("goals")
    .update({
      deadline: newDeadline,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", goalId);

  if (error) throw error;
}

/**
 * Alterna status entre pausado e ativo
 */
export async function toggleGoalPause(goalId: string, currentStatus: string) {
  const nextStatus = currentStatus === "paused" ? "active" : "paused";
  const fullUpdate = {
    status: nextStatus,
    paused_at: nextStatus === "paused" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const res = await supabase
    .from("goals")
    .update(fullUpdate as any)
    .eq("id", goalId);

  if (
    res.error &&
    (res.error.message.includes("column") ||
      res.error.message.includes("schema cache"))
  ) {
    // Fallback sem paused_at
    const fbRes = await supabase
      .from("goals")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", goalId);
    if (fbRes.error) throw fbRes.error;
    return;
  }

  if (res.error) throw res.error;
}

/**
 * Exclui uma meta e seus aportes
 */
export async function deleteGoal(goalId: string) {
  await supabase.from("goal_contributions").delete().eq("goal_id", goalId);
  const { error } = await supabase.from("goals").delete().eq("id", goalId);
  if (error) throw error;
}

