import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useCardMetrics } from "@/hooks/useCardMetrics";
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
  const coupleId = profile?.couple_id ?? null;

  const { data: cards = [], isLoading: isLoadingCards } = useQuery({
    queryKey: ["cards", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("credit_cards").select("*").order("created_at");
      const { data } = coupleId
        ? await q.eq("couple_id", coupleId)
        : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const { data: purchases = [], isLoading: isLoadingPurchases } = useQuery({
    queryKey: ["card-purchases", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase
        .from("transactions")
        .select("*, categories(name,color,icon), installments(*)")
        .not("credit_card_id", "is", null)
        .order("date", { ascending: false });
      const { data } = coupleId
        ? await q.eq("couple_id", coupleId)
        : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const { data: invoices = [], isLoading: isLoadingInvoices } = useQuery({
    queryKey: ["card-invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("card_invoices")
        .select("*")
        .order("reference_month", { ascending: true });
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
    cards,
    purchases,
    invoices,
    rawMetrics,
  };
}
