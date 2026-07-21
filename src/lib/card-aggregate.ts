// ─────────────────────────────────────────────────────────────────────────────
// card-aggregate.ts — Fonte Única de Métricas de Cartão de Crédito
// ─────────────────────────────────────────────────────────────────────────────

/** Tipo derivado final — pronto para consumo na UI */
export interface CardAggregate {
  // Identificação
  cardId: string;
  cardName: string;
  bank: string;
  color: string;
  closingDay: number;
  dueDay: number;
  ownerId: string;

  // Fatura ativa
  invoiceTotal: number;
  invoicePaid: number;
  invoiceRemaining: number;
  invoiceStatus: string;
  invoiceStatusLabel: string;
  invoiceStatusColor: string;
  invoiceRefMonth: string;
  invoiceRefLabel: string;
  invoiceDueDate: string;
  invoiceIsPaid: boolean;
  invoiceIsOverdue: boolean;
  invoiceId: string | null;
  isSynthetic: boolean;
  activeInv: any | null;

  // Limites
  limitTotal: number;
  used: number;
  available: number;
  usedPercent: number;
  usageLevel: "safe" | "warning" | "danger";

  // Parcelas futuras
  installmentsCount: number;
  remainingTotal: number;
  currentBill: number;

  // Análise
  topCategory: [string, number] | null;
  byCategory: Record<string, number>;
  monthly: Record<string, number>;
  lastPurchase: any | null;
}

// ─── Helpers de status / label ──────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open:             { label: "Pendente",     color: "bg-primary/20 text-primary" },
  due:              { label: "Vence Hoje",   color: "bg-yellow-500/20 text-yellow-600" },
  overdue:          { label: "Atrasada",     color: "bg-destructive/20 text-destructive" },
  partially_paid:   { label: "Pag. Parcial", color: "bg-orange-500/20 text-orange-600" },
  paid:             { label: "Paga",         color: "bg-success/20 text-success" },
  closed:           { label: "Fechada",      color: "bg-blue-500/20 text-blue-600" },
};

export function getInvoiceStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

export function getInvoiceStatusColor(status: string): string {
  return STATUS_MAP[status]?.color ?? "bg-muted text-muted-foreground";
}

export function getUsageLevel(pct: number): "safe" | "warning" | "danger" {
  if (pct >= 80) return "danger";
  if (pct >= 60) return "warning";
  return "safe";
}

export const OPEN_STATUSES = ["open", "due", "overdue", "partially_paid"];

// ─── Função principal ───────────────────────────────────────────────────────

/**
 * Transforma um cartão + suas métricas brutas (de useCardMetrics)
 * em um objeto CardAggregate pronto para exibição.
 *
 * Esta é a ÚNICA fonte de cálculos derivados de cartão.
 */
export function getCardAggregate(card: any, rawMetrics: any): CardAggregate {
  const m = rawMetrics ?? {
    used: 0,
    currentBill: 0,
    installmentsCount: 0,
    remainingTotal: 0,
    monthly: {},
    lastPurchase: null,
    byCategory: {},
    activeInv: null,
  };

  const inv = m.activeInv;

  // Fatura
  const invoiceTotal = inv?.total_amount ?? m.currentBill;
  const invoicePaid = inv?.paid_amount ?? 0;
  const invoiceRemaining = Math.max(0, invoiceTotal - invoicePaid);
  const invoiceStatus = inv?.status ?? "open";
  const invoiceIsPaid = invoiceStatus === "paid" || invoiceStatus === "closed";
  const invoiceIsOverdue = invoiceStatus === "overdue";
  const invoiceRefMonth = inv?.reference_month
    ? inv.reference_month.slice(0, 7)
    : (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      })();
  const invoiceRefLabel = (() => {
    try {
      const d = new Date(invoiceRefMonth + "-01T12:00:00");
      return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    } catch {
      return invoiceRefMonth;
    }
  })();

  // Limites
  const limitTotal = Number(card.limit_amount ?? 0);
  const used = m.used;
  const available = Math.max(0, limitTotal - used);
  const usedPercent = limitTotal > 0 ? Math.min(100, (used / limitTotal) * 100) : 0;

  // Categoria top
  const catEntries = Object.entries(m.byCategory) as [string, number][];
  const topCategory = catEntries.length > 0
    ? catEntries.sort((a, b) => b[1] - a[1])[0]
    : null;

  return {
    cardId: card.id,
    cardName: card.name ?? "",
    bank: card.bank ?? "Cartão",
    color: card.color ?? "#7B61FF",
    closingDay: card.closing_day ?? 1,
    dueDay: card.due_day ?? 10,
    ownerId: card.user_id,

    invoiceTotal,
    invoicePaid,
    invoiceRemaining,
    invoiceStatus,
    invoiceStatusLabel: getInvoiceStatusLabel(invoiceStatus),
    invoiceStatusColor: getInvoiceStatusColor(invoiceStatus),
    invoiceRefMonth,
    invoiceRefLabel,
    invoiceDueDate: inv?.due_date ?? "",
    invoiceIsPaid,
    invoiceIsOverdue,
    invoiceId: inv?.id ?? null,
    isSynthetic: inv?._synthetic ?? false,
    activeInv: inv,

    limitTotal,
    used,
    available,
    usedPercent,
    usageLevel: getUsageLevel(usedPercent),

    installmentsCount: m.installmentsCount,
    remainingTotal: m.remainingTotal,
    currentBill: m.currentBill,

    topCategory,
    byCategory: m.byCategory,
    monthly: m.monthly,
    lastPurchase: m.lastPurchase,
  };
}
