import { supabase } from "@/integrations/supabase/client";
import { applySpaceFilter } from "@/lib/space";
import type {
  SpaceFilterOpts,
  AccountsBalance,
  AccountBalanceItem,
  NetWorth,
  InvestmentItem,
  DebtItem,
} from "./types";

/**
 * Função pura para computar o saldo total em contas a partir de linhas de banco.
 */
export function computeAccountsBalanceFromRows(rows: any[]): AccountsBalance {
  let total = 0;
  const accounts: AccountBalanceItem[] = [];

  for (const acc of rows) {
    if (acc.hidden) continue;
    const balance = Number(acc.balance || 0);
    total += balance;

    accounts.push({
      id: acc.id,
      name: acc.name || "Conta",
      type: acc.type || null,
      balance: Math.round(balance * 100) / 100,
      color: acc.color || null,
      icon: acc.icon || null,
      source: acc.source || "manual",
    });
  }

  return {
    total: Math.round(total * 100) / 100,
    accounts,
  };
}

/**
 * Busca e calcula o saldo de todas as contas bancárias ativas do espaço.
 */
export async function getAccountsBalance(
  opts: SpaceFilterOpts,
  prefetchedAccounts?: any[]
): Promise<AccountsBalance> {
  if (prefetchedAccounts) {
    return computeAccountsBalanceFromRows(prefetchedAccounts);
  }

  let q = supabase
    .from("bank_accounts")
    .select("id, name, type, balance, color, icon, source, hidden")
    .eq("hidden", false);

  q = applySpaceFilter(q, opts);

  const { data, error } = await q.order("name");
  if (error) {
    console.error("Erro ao buscar contas em getAccountsBalance:", error);
    return { total: 0, accounts: [] };
  }

  return computeAccountsBalanceFromRows(data ?? []);
}

/**
 * Função pura para computar o Patrimônio Líquido e total de ativos/passivos.
 */
export function computeNetWorthFromData({
  accountsBalance,
  investments,
  debts,
}: {
  accountsBalance: number;
  investments: any[];
  debts: any[];
}): NetWorth {
  let totalInvestments = 0;
  const investmentsList: InvestmentItem[] = [];

  for (const inv of investments) {
    const amount = Number(inv.amount || 0);
    totalInvestments += amount;
    investmentsList.push({
      id: inv.id,
      name: inv.name,
      institution: inv.institution,
      investmentType: inv.investment_type,
      amount: Math.round(amount * 100) / 100,
      investmentDate: inv.investment_date,
      responsibleUserId: inv.responsible_user_id || inv.user_id,
    });
  }

  let totalDebts = 0;
  const debtsList: DebtItem[] = [];

  for (const d of debts) {
    const curAmount = Number(d.current_amount ?? d.original_amount ?? 0);
    if (d.status === "paid" || curAmount <= 0) continue;

    totalDebts += curAmount;
    debtsList.push({
      id: d.id,
      creditor: d.creditor,
      description: d.description,
      originalAmount: Number(d.original_amount || 0),
      currentAmount: Math.round(curAmount * 100) / 100,
      debtDate: d.debt_date,
      responsibleUserId: d.responsible_user_id || d.user_id,
    });
  }

  const accountsTotal = Math.round(accountsBalance * 100) / 100;
  const invTotal = Math.round(totalInvestments * 100) / 100;
  const debtTotal = Math.round(totalDebts * 100) / 100;
  const otherAssets = 0;
  const totalAssets = Math.round((accountsTotal + invTotal + otherAssets) * 100) / 100;
  const netWorth = Math.round((totalAssets - debtTotal) * 100) / 100;

  return {
    accountsBalance: accountsTotal,
    investments: invTotal,
    otherAssets,
    totalAssets,
    debts: debtTotal,
    netWorth,
    investmentsList,
    debtsList,
  };
}

/**
 * Consulta e calcula o PATRIMÔNIO consolidado (saldo em contas + investimentos - dívidas).
 * ESTRITAMENTE ISOLADO DO FLUXO DE CAIXA MENSAL DE RECEITAS/DESPESAS.
 */
export async function getNetWorth(
  opts: SpaceFilterOpts,
  prefetchedData?: {
    accountsBalance?: number;
    investments?: any[];
    debts?: any[];
  }
): Promise<NetWorth> {
  if (
    prefetchedData &&
    prefetchedData.accountsBalance !== undefined &&
    prefetchedData.investments &&
    prefetchedData.debts
  ) {
    return computeNetWorthFromData({
      accountsBalance: prefetchedData.accountsBalance,
      investments: prefetchedData.investments,
      debts: prefetchedData.debts,
    });
  }

  const [accBalance, invRes, debtsRes] = await Promise.all([
    getAccountsBalance(opts).then((res) => res.total),

    (async () => {
      try {
        let q = supabase
          .from("investments")
          .select("*")
          .order("investment_date", { ascending: false });
        q = applySpaceFilter(q, opts);
        const { data, error } = await q;
        if (error) return [];
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    })(),

    (async () => {
      try {
        let q = supabase
          .from("debts")
          .select("*")
          .order("debt_date", { ascending: false });
        q = applySpaceFilter(q, opts);
        const { data, error } = await q;
        if (error) return [];
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    })(),
  ]);

  return computeNetWorthFromData({
    accountsBalance: accBalance,
    investments: invRes,
    debts: debtsRes,
  });
}
