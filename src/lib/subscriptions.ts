// Subscription helpers — calculations, queries, and types
import { supabase } from "@/integrations/supabase/client";
import type { SpaceOpts } from "./finance";
import { monthRange } from "./finance";

// ── Types ─────────────────────────────────────────────────

export type BillingFrequency = "weekly" | "monthly" | "bimonthly" | "quarterly" | "semiannual" | "annual" | "custom";
export type SubStatus = "trial" | "active" | "paused" | "canceled" | "ended";
export type PaymentMethod = "pix" | "debit" | "bank_account" | "credit_card" | "boleto" | "other";

export interface Subscription {
  id: string;
  user_id: string;
  couple_id: string | null;
  created_by: string;
  visibility: string;
  name: string;
  description: string | null;
  category_id: string | null;
  icon: string | null;
  url: string | null;
  amount: number;
  currency: string;
  billing_frequency: BillingFrequency;
  billing_interval: number;
  start_date: string | null;
  next_billing_date: string;
  billing_day: number | null;
  renewal_date: string | null;
  end_date: string | null;
  payment_method: PaymentMethod;
  account_id: string | null;
  card_id: string | null;
  responsible_user_id: string | null;
  status: SubStatus;
  trial_enabled: boolean;
  trial_end_date: string | null;
  amount_after_trial: number | null;
  auto_renew: boolean;
  last_charged_at: string | null;
  last_generated_transaction_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Joined optionally
  categories?: { name: string; color: string; icon: string } | null;
  credit_cards?: { name: string; color: string } | null;
  bank_accounts?: { name: string } | null;
}

export interface SubHistory {
  id: string;
  subscription_id: string;
  changed_by: string;
  action: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  created_at: string;
}

// ── Frequency ↔ months mapping ────────────────────────────

export function frequencyMonths(freq: BillingFrequency, interval: number = 1): number {
  switch (freq) {
    case "weekly": return 7 / 30; // ~0.23 months
    case "monthly": return 1 * interval;
    case "bimonthly": return 2;
    case "quarterly": return 3;
    case "semiannual": return 6;
    case "annual": return 12;
    case "custom": return interval;
    default: return 1;
  }
}

export function frequencyLabel(freq: BillingFrequency, interval: number = 1): string {
  switch (freq) {
    case "weekly": return interval > 1 ? `A cada ${interval} semanas` : "Semanal";
    case "monthly": return interval > 1 ? `A cada ${interval} meses` : "Mensal";
    case "bimonthly": return "Bimestral";
    case "quarterly": return "Trimestral";
    case "semiannual": return "Semestral";
    case "annual": return "Anual";
    case "custom": return `A cada ${interval} meses`;
    default: return freq;
  }
}

export function statusLabel(s: SubStatus): string {
  switch (s) {
    case "trial": return "Teste gratuito";
    case "active": return "Ativa";
    case "paused": return "Pausada";
    case "canceled": return "Cancelada";
    case "ended": return "Encerrada";
    default: return s;
  }
}

export function statusColor(s: SubStatus): string {
  switch (s) {
    case "trial": return "bg-blue-500/10 text-blue-600";
    case "active": return "bg-success/10 text-success";
    case "paused": return "bg-yellow-500/10 text-yellow-700";
    case "canceled": return "bg-destructive/10 text-destructive";
    case "ended": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

export function paymentMethodLabel(m: PaymentMethod): string {
  switch (m) {
    case "pix": return "Pix";
    case "debit": return "Débito";
    case "bank_account": return "Conta bancária";
    case "credit_card": return "Cartão de crédito";
    case "boleto": return "Boleto";
    case "other": return "Outro";
    default: return m;
  }
}

// ── Monthly & Annual equivalents ──────────────────────────

/** Monthly equivalent cost */
export function monthlyEquivalent(sub: Pick<Subscription, "amount" | "billing_frequency" | "billing_interval" | "status" | "trial_enabled" | "trial_end_date" | "amount_after_trial">): number {
  if (sub.status === "canceled" || sub.status === "ended" || sub.status === "paused") return 0;
  const effectiveAmount = getEffectiveAmount(sub);
  const months = frequencyMonths(sub.billing_frequency, sub.billing_interval);
  return months > 0 ? effectiveAmount / months : effectiveAmount;
}

/** Annual projection (12 months from now) */
export function annualProjection(sub: Pick<Subscription, "amount" | "billing_frequency" | "billing_interval" | "status" | "trial_enabled" | "trial_end_date" | "amount_after_trial" | "end_date">): number {
  if (sub.status === "canceled" || sub.status === "ended" || sub.status === "paused") return 0;
  const monthly = monthlyEquivalent(sub);
  // Check if end_date is within 12 months
  if (sub.end_date) {
    const endDate = new Date(sub.end_date);
    const now = new Date();
    const monthsRemaining = (endDate.getFullYear() - now.getFullYear()) * 12 + (endDate.getMonth() - now.getMonth());
    if (monthsRemaining <= 0) return 0;
    return monthly * Math.min(12, Math.max(0, monthsRemaining));
  }
  return monthly * 12;
}

function getEffectiveAmount(sub: Pick<Subscription, "amount" | "trial_enabled" | "trial_end_date" | "amount_after_trial">): number {
  if (sub.trial_enabled && sub.trial_end_date) {
    const trialEnd = new Date(sub.trial_end_date);
    if (trialEnd > new Date()) return 0; // still in trial
    return sub.amount_after_trial ?? sub.amount;
  }
  return sub.amount;
}

// ── Next billing date calculation (client-side) ───────────

export function calcNextBillingDate(current: Date, freq: BillingFrequency, interval: number = 1): Date {
  const d = new Date(current);
  switch (freq) {
    case "weekly":
      d.setDate(d.getDate() + 7 * interval); break;
    case "monthly":
      d.setMonth(d.getMonth() + interval); break;
    case "bimonthly":
      d.setMonth(d.getMonth() + 2); break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3); break;
    case "semiannual":
      d.setMonth(d.getMonth() + 6); break;
    case "annual":
      d.setFullYear(d.getFullYear() + 1); break;
    case "custom":
      d.setMonth(d.getMonth() + interval); break;
    default:
      d.setMonth(d.getMonth() + 1); break;
  }
  return d;
}

// ── Queries ───────────────────────────────────────────────

export async function fetchSubscriptions(opts: SpaceOpts): Promise<Subscription[]> {
  let q: any = supabase
    .from("subscriptions")
    .select("*, categories(name,color,icon), credit_cards(name,color), bank_accounts(name)")
    .order("next_billing_date");

  if (opts.space === "private") {
    q = q.eq("visibility", "private").eq("user_id", opts.userId);
  } else if (opts.coupleId) {
    q = q.eq("visibility", "shared").eq("couple_id", opts.coupleId);
  } else {
    q = q.eq("visibility", "shared").eq("user_id", opts.userId);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[subscriptions] fetch error", error);
    return [];
  }
  return (data ?? []) as unknown as Subscription[];
}

export async function fetchSubscriptionById(id: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, categories(name,color,icon), credit_cards(name,color), bank_accounts(name)")
    .eq("id", id)
    .single();
  if (error) {
    console.error("[subscriptions] fetch by id error", error);
    return null;
  }
  return data as unknown as Subscription;
}

export async function fetchSubscriptionHistory(subId: string): Promise<SubHistory[]> {
  const { data, error } = await supabase
    .from("subscription_history")
    .select("*")
    .eq("subscription_id", subId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[subscriptions] history error", error);
    return [];
  }
  return (data ?? []) as SubHistory[];
}

// ── Summary helpers used by dashboard ─────────────────────

export interface SubSummary {
  activeCount: number;
  trialCount: number;
  monthlyTotal: number;
  annualTotal: number;
  nextCharge: { name: string; date: string; amount: number } | null;
}

export function buildSummary(subs: Subscription[]): SubSummary {
  const active = subs.filter(s => s.status === "active" || s.status === "trial");
  const trials = subs.filter(s => s.status === "trial");

  let monthlyTotal = 0;
  let annualTotal = 0;
  for (const s of active) {
    monthlyTotal += monthlyEquivalent(s);
    annualTotal += annualProjection(s);
  }

  // Find next upcoming charge
  const now = getLocalISODate(new Date());
  let nextCharge: SubSummary["nextCharge"] = null;
  for (const s of active) {
    if (s.next_billing_date >= now) {
      if (!nextCharge || s.next_billing_date < nextCharge.date) {
        nextCharge = {
          name: s.name,
          date: s.next_billing_date,
          amount: Number(s.amount),
        };
      }
    }
  }

  return {
    activeCount: active.length,
    trialCount: trials.length,
    monthlyTotal,
    annualTotal,
    nextCharge,
  };
}

// ── Projection helper: subscription charges for a given month ──

export function projectSubscriptionsForMonth(
  subs: Subscription[],
  ref: Date
): { name: string; amount: number; date: string }[] {
  const { start, end } = monthRange(ref);
  const result: { name: string; amount: number; date: string }[] = [];

  for (const sub of subs) {
    if (sub.status !== "active" && sub.status !== "trial") continue;
    if (sub.end_date && sub.end_date < start) continue;

    // Walk billing dates forward to see if any land in this month
    let cursor = new Date(sub.next_billing_date + "T00:00:00");
    const startD = new Date(start + "T00:00:00");
    const endD = new Date(end + "T00:00:00");

    // If cursor is already past this month, skip
    if (cursor > endD) continue;

    // Wind cursor back if it's way in the past, fast-forward
    while (cursor < startD) {
      cursor = calcNextBillingDate(cursor, sub.billing_frequency, sub.billing_interval);
    }

    // Collect all charges within the month
    while (cursor <= endD) {
      const dateStr = getLocalISODate(cursor);
      if (dateStr >= start && dateStr <= end) {
        const amt = getEffectiveAmount(sub);
        result.push({ name: sub.name, amount: amt, date: dateStr });
      }
      cursor = calcNextBillingDate(cursor, sub.billing_frequency, sub.billing_interval);
    }
  }

  return result;
}

// ── Process charges client-side (calls the DB function via RPC) ──

export async function processCharges(): Promise<{ subscription_id: string; transaction_id: string | null; status: string }[]> {
  const { data, error } = await supabase.rpc("process_subscription_charges");
  if (error) {
    console.error("[subscriptions] process charges error", error);
    throw error;
  }
  return data ?? [];
}
