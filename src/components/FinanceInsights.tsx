import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/couple";
import { Sparkles, TrendingDown } from "lucide-react";
import { getLocalISODate } from "@/lib/date-utils";


export function FinanceInsights() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ["insights", monthStart],
    queryFn: async () => {
      const { data: txs } = await supabase
        .from("bank_transactions")
        .select("amount, category, date")
        .gte("date", monthStart);
      const byCat: Record<string, number> = {};
      let totalExpense = 0;
      (txs ?? []).forEach((t: any) => {
        const v = Number(t.amount);
        if (v < 0) {
          const c = t.category || "Outros";
          byCat[c] = (byCat[c] ?? 0) + Math.abs(v);
          totalExpense += Math.abs(v);
        }
      });
      const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return { top, totalExpense };
    },
  });

  if (!data || data.top.length === 0) return null;

  return (
    <Card className="rounded-3xl p-5 shadow-card bg-gradient-to-br from-accent-purple/5 to-primary/5 border-primary/10">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4 text-accent-purple" />
        <h3 className="font-semibold text-sm">Insights do mês</h3>
      </div>
      <div className="space-y-2">
        {data.top.map(([cat, amount]) => (
          <div key={cat} className="flex items-center gap-2">
            <TrendingDown className="size-3.5 text-destructive shrink-0" />
            <div className="flex-1 text-xs">
              Vocês gastaram <b>{formatBRL(amount)}</b> em <b>{cat}</b>
            </div>
          </div>
        ))}
        <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/50">
          Total importado via Open Finance: {formatBRL(data.totalExpense)}
        </div>
      </div>
    </Card>
  );
}
