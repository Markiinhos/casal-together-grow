import { useQuery } from "@tanstack/react-query";
import { getMonthlyActuals } from "./actuals";
import { getMonthlyForecast } from "./forecast";
import { getMonthlyCommitments } from "./commitments";
import { getAccountsBalance, getNetWorth } from "./patrimony";
import { getFinancialSnapshot } from "./snapshot";
import type { SpaceFilterOpts } from "./types";

export * from "./types";
export * from "./actuals";
export * from "./forecast";
export * from "./commitments";
export * from "./patrimony";
export * from "./snapshot";

/**
 * Hook do React Query para o Snapshot Financeiro Unificado.
 */
export function useFinancialSnapshot(
  ref: Date,
  opts: SpaceFilterOpts,
  enabled: boolean = true
) {
  const monthKey = `${ref.getFullYear()}-${ref.getMonth()}`;
  return useQuery({
    queryKey: ["financial-snapshot", monthKey, opts.space, opts.coupleId, opts.userId],
    queryFn: () => getFinancialSnapshot(ref, opts),
    enabled: enabled && !!opts.userId,
    staleTime: 1000 * 30, // 30s cache
  });
}

/**
 * Hook para saldo em contas.
 */
export function useAccountsBalance(
  opts: SpaceFilterOpts,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["financial-accounts-balance", opts.space, opts.coupleId, opts.userId],
    queryFn: () => getAccountsBalance(opts),
    enabled: enabled && !!opts.userId,
  });
}

/**
 * Hook para patrimônio líquido (investimentos + contas - dívidas).
 */
export function useNetWorth(
  opts: SpaceFilterOpts,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["financial-net-worth", opts.space, opts.coupleId, opts.userId],
    queryFn: () => getNetWorth(opts),
    enabled: enabled && !!opts.userId,
  });
}

/**
 * Hook para valores realizados do mês.
 */
export function useMonthlyActuals(
  ref: Date,
  opts: SpaceFilterOpts,
  enabled: boolean = true
) {
  const monthKey = `${ref.getFullYear()}-${ref.getMonth()}`;
  return useQuery({
    queryKey: ["financial-actuals", monthKey, opts.space, opts.coupleId, opts.userId],
    queryFn: () => getMonthlyActuals(ref, opts),
    enabled: enabled && !!opts.userId,
  });
}

/**
 * Hook para previsões do mês.
 */
export function useMonthlyForecast(
  ref: Date,
  opts: SpaceFilterOpts,
  enabled: boolean = true
) {
  const monthKey = `${ref.getFullYear()}-${ref.getMonth()}`;
  return useQuery({
    queryKey: ["financial-forecast", monthKey, opts.space, opts.coupleId, opts.userId],
    queryFn: () => getMonthlyForecast(ref, opts),
    enabled: enabled && !!opts.userId,
  });
}

/**
 * Hook para compromissos de cartões e parcelas.
 */
export function useMonthlyCommitments(
  ref: Date,
  opts: SpaceFilterOpts,
  enabled: boolean = true
) {
  const monthKey = `${ref.getFullYear()}-${ref.getMonth()}`;
  return useQuery({
    queryKey: ["financial-commitments", monthKey, opts.space, opts.coupleId, opts.userId],
    queryFn: () => getMonthlyCommitments(ref, opts),
    enabled: enabled && !!opts.userId,
  });
}
