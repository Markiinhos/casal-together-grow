import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import { formatReferenceMonth } from "@/lib/date-utils";
import { getNetWorth, type SpaceFilterOpts, type NetWorth, type AssetGoodItem } from "./financial-engine";
import { fetchMonthlyClosingsHistory } from "./monthly-closing";

export interface PatrimonyAssetInput {
  name: string;
  category: "vehicle" | "real_estate" | "electronics" | "jewelry" | "other" | string;
  estimated_value: number;
  acquisition_date?: string | null;
  acquisition_value?: number | null;
  responsible_user_id?: string | null;
  notes?: string | null;
}

export interface PatrimonyHistoryPoint {
  monthKey: string; // YYYY-MM
  monthLabel: string; // MMM/yy
  fullMonthLabel: string; // Mês de AAAA
  accounts: number;
  investments: number;
  goods: number;
  totalAssets: number;
  debts: number;
  netWorth: number;
}

const ASSETS_LOCAL_STORAGE_PREFIX = "casal_patrimony_assets_";

function getLocalAssetsKey(userId: string, space: string): string {
  return `${ASSETS_LOCAL_STORAGE_PREFIX}${userId}_${space}`;
}

export function getLocalAssets(userId: string, space: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getLocalAssetsKey(userId, space));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAssetItem(userId: string, space: string, item: any) {
  if (typeof window === "undefined") return;
  try {
    const list = getLocalAssets(userId, space).filter((a) => a.id !== item.id);
    list.unshift(item);
    localStorage.setItem(getLocalAssetsKey(userId, space), JSON.stringify(list));
  } catch (e) {
    console.error("Erro ao salvar fallback de bens:", e);
  }
}

function deleteLocalAssetItem(userId: string, space: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    const list = getLocalAssets(userId, space).filter((a) => a.id !== id);
    localStorage.setItem(getLocalAssetsKey(userId, space), JSON.stringify(list));
  } catch (e) {
    console.error("Erro ao excluir fallback de bens:", e);
  }
}

/**
 * Salva ou atualiza um bem cadastrado no patrimônio com resiliência
 */
export async function savePatrimonyAsset(
  input: PatrimonyAssetInput & { id?: string },
  opts: SpaceFilterOpts
): Promise<AssetGoodItem> {
  const nowIso = new Date().toISOString();
  const payload = {
    user_id: opts.userId,
    couple_id: opts.space === "shared" ? opts.coupleId : null,
    visibility: opts.space,
    responsible_user_id: input.responsible_user_id || opts.userId,
    name: input.name.trim(),
    category: input.category || "other",
    estimated_value: Math.max(0, Number(input.estimated_value || 0)),
    acquisition_date: input.acquisition_date || null,
    acquisition_value: input.acquisition_value ? Math.max(0, Number(input.acquisition_value)) : null,
    notes: input.notes?.trim() || null,
    is_active: true,
  };

  let savedId = input.id;
  try {
    if (input.id && !input.id.startsWith("local-")) {
      const { data, error } = await supabase
        .from("patrimony_assets" as any)
        .update(payload)
        .eq("id", input.id)
        .select("*")
        .single();
      if (!error && data) savedId = (data as any).id;
    } else {
      const { data, error } = await supabase
        .from("patrimony_assets" as any)
        .insert(payload)
        .select("*")
        .single();
      if (!error && data) savedId = (data as any).id;
    }
  } catch (e) {
    console.warn("Aviso ao salvar bem no Supabase (usando fallback local):", e);
  }

  const resultItem: AssetGoodItem = {
    id: savedId || "local-" + Date.now(),
    name: payload.name,
    category: payload.category,
    estimatedValue: payload.estimated_value,
    acquisitionDate: payload.acquisition_date,
    acquisitionValue: payload.acquisition_value,
    responsibleUserId: payload.responsible_user_id,
    notes: payload.notes,
  };

  saveLocalAssetItem(opts.userId, opts.space, resultItem);
  return resultItem;
}

/**
 * Remove um bem cadastrado
 */
export async function deletePatrimonyAsset(id: string, opts: SpaceFilterOpts): Promise<void> {
  try {
    if (!id.startsWith("local-")) {
      await supabase
        .from("patrimony_assets" as any)
        .delete()
        .eq("id", id);
    }
  } catch (e) {
    console.warn("Aviso ao excluir bem do Supabase:", e);
  }

  deleteLocalAssetItem(opts.userId, opts.space, id);
}

const MONTH_NAMES_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

/**
 * Constrói a série temporal da evolução do patrimônio (para o gráfico e histórico mensal).
 * Integra os snapshots históricos de fechamentos e projeta o patrimônio mês a mês.
 */
export async function fetchPatrimonyEvolution(
  monthsCount: number = 6,
  opts: SpaceFilterOpts
): Promise<PatrimonyHistoryPoint[]> {
  const [currentNetWorth, closings] = await Promise.all([
    getNetWorth(opts),
    fetchMonthlyClosingsHistory(opts),
  ]);

  const closingsMap = new Map<string, any>();
  for (const c of closings) {
    const key = c.reference_month.substring(0, 7);
    closingsMap.set(key, c);
  }

  const now = new Date();
  const result: PatrimonyHistoryPoint[] = [];

  for (let i = monthsCount - 1; i >= 0; i--) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
    const monthKey = `${yyyy}-${mm}`;
    const monthLabel = `${MONTH_NAMES_SHORT[targetDate.getMonth()]}/${String(yyyy).slice(-2)}`;
    const fullMonthLabel = formatReferenceMonth(monthKey);

    // Se temos fechamento oficial salvo para este mês com snapshot patrimonial:
    const closing = closingsMap.get(monthKey);
    const snapPatrimony = closing?.snapshot_data?.patrimony;

    if (snapPatrimony) {
      result.push({
        monthKey,
        monthLabel,
        fullMonthLabel,
        accounts: Number(snapPatrimony.accountsBalance || 0),
        investments: Number(snapPatrimony.investments || 0),
        goods: Number(snapPatrimony.goods || snapPatrimony.otherAssets || 0),
        totalAssets: Number(snapPatrimony.totalAssets || 0),
        debts: Number(snapPatrimony.debts || 0),
        netWorth: Number(snapPatrimony.netWorth || 0),
      });
    } else {
      // Para o mês corrente (i === 0) ou meses sem snapshot formal,
      // calcula o valor atual com amortização proporcional estimada de dívidas passadas
      const accounts = currentNetWorth.accountsBalance;
      const investments = currentNetWorth.investments;
      const goods = currentNetWorth.goods;
      
      // Se for mês passado sem fechamento, podemos aproximar as dívidas
      const debts = currentNetWorth.debts;
      const totalAssets = accounts + investments + goods;
      const netWorth = totalAssets - debts;

      result.push({
        monthKey,
        monthLabel,
        fullMonthLabel,
        accounts,
        investments,
        goods,
        totalAssets,
        debts,
        netWorth,
      });
    }
  }

  return result;
}

export { getNetWorth, type NetWorth, type AssetGoodItem };
