import { formatBRL } from "./finance";

export const ITEM_TYPES = [
  { v: "purchase", label: "Compra" },
  { v: "maintenance", label: "Manutenção" },
  { v: "repair", label: "Reparo" },
  { v: "replacement", label: "Substituição" },
  { v: "renovation", label: "Reforma" },
  { v: "service", label: "Serviço" },
  { v: "other", label: "Outro" },
] as const;

export const CATEGORIES = [
  "Quarto", "Sala", "Cozinha", "Banheiro", "Área de serviço", "Área externa",
  "Móveis", "Eletrodomésticos", "Elétrica", "Hidráulica", "Segurança",
  "Limpeza", "Decoração", "Outros",
] as const;

export const PRIORITIES = [
  { v: "low", label: "Baixa" },
  { v: "medium", label: "Média" },
  { v: "high", label: "Alta" },
  { v: "urgent", label: "Urgente" },
] as const;

export const STATUSES = [
  { v: "idea", label: "Ideia" },
  { v: "researching", label: "Pesquisando" },
  { v: "planned", label: "Planejado" },
  { v: "approved", label: "Aprovado" },
  { v: "purchased", label: "Comprado" },
  { v: "in_maintenance", label: "Em manutenção" },
  { v: "done", label: "Concluído" },
  { v: "postponed", label: "Adiado" },
  { v: "cancelled", label: "Cancelado" },
] as const;

export const PAY_METHODS = [
  { v: "pix", label: "Pix" },
  { v: "cash", label: "Dinheiro" },
  { v: "debit", label: "Débito" },
  { v: "credit", label: "Cartão à vista" },
  { v: "credit_installments", label: "Cartão parcelado" },
  { v: "boleto", label: "Boleto" },
  { v: "financing", label: "Financiamento" },
  { v: "undefined", label: "Ainda não definido" },
] as const;

export function priorityBadge(p: string) {
  return {
    low: "bg-muted text-muted-foreground",
    medium: "bg-accent-purple/15 text-accent-purple",
    high: "bg-warning/20 text-warning-foreground",
    urgent: "bg-destructive/15 text-destructive",
  }[p] ?? "bg-muted text-muted-foreground";
}

export function statusBadge(s: string) {
  return {
    idea: "bg-muted text-muted-foreground",
    researching: "bg-accent-purple/10 text-accent-purple",
    planned: "bg-primary/10 text-primary",
    approved: "bg-success/10 text-success",
    purchased: "bg-success/20 text-success",
    in_maintenance: "bg-warning/10 text-warning-foreground",
    done: "bg-success/25 text-success",
    postponed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  }[s] ?? "bg-muted text-muted-foreground";
}

export function labelFor<T extends { v: string; label: string }>(list: readonly T[], v: string | null | undefined): string {
  return list.find((i) => i.v === v)?.label ?? v ?? "—";
}

export function fmtBRL(n: number | null | undefined): string {
  if (n == null) return "—";
  return formatBRL(n);
}
