import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useCardMetrics } from "@/hooks/useCardMetrics";
import { useSpace, applySpaceFilter } from "@/lib/space";
import { getCardAggregate, type CardAggregate } from "@/lib/card-aggregate";

/**
 * Hook centralizado que retorna CardAggregate[] para todos os cartões do usuário/casal.
 *
 * Reutiliza as MESMAS queryKeys que já existem no app, garantindo
 * cache compartilhado entre todas as telas e invalidação via realtime.
 *
 * Uso:
 *   const { aggregates, byId, isLoading } = useCardAggregates();
 *   const agg = byId[someCardId];  // CardAggregate
 */
export function useCardAggregates() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const coupleId = profile?.couple_id ?? null;

  const { data: cards = [], isLoading: isLoadingCards, isError: isErrorCards } = useQuery({
    queryKey: ["cards", space, coupleId, user?.id],
    queryFn: async () => {
      let q = supabase.from("credit_cards").select("*").order("created_at");
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const { data: purchases = [], isLoading: isLoadingPurchases, isError: isErrorPurchases } = useQuery({
    queryKey: ["card-purchases", space, coupleId, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, categories(name,color,icon), installments(*)")
        .not("credit_card_id", "is", null)
        .order("date", { ascending: false });
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const { data: invoices = [], isLoading: isLoadingInvoices, isError: isErrorInvoices } = useQuery({
    queryKey: ["card-invoices", space, coupleId, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("card_invoices")
        .select("*")
        .order("reference_month", { ascending: true });
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  // Métricas brutas via hook existente
  const rawMetrics = useCardMetrics(cards, purchases, invoices);

  // Transforma em CardAggregate[]
  const aggregates: CardAggregate[] = useMemo(
    () => cards.map((card) => getCardAggregate(card, rawMetrics[card.id])),
    [cards, rawMetrics],
  );

  const byId: Record<string, CardAggregate> = useMemo(
    () => Object.fromEntries(aggregates.map((a) => [a.cardId, a])),
    [aggregates],
  );

  return {
    aggregates,
    byId,
    isLoading: isLoadingCards || isLoadingPurchases || isLoadingInvoices,
    isError: isErrorCards || isErrorPurchases || isErrorInvoices,
    cards,
    purchases,
    invoices,
    rawMetrics,
  };
}
