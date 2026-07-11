import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace, applySpaceFilter } from "@/lib/space";
import { formatBRL } from "@/lib/couple";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, Trash2, Copy, Sparkles, History } from "lucide-react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line } from "recharts";

export const Route = createFileRoute("/app/financas/")({
  component: FinancePage,
});

const COLORS = ["#FF6B57", "#7B61FF", "#FF8A7A", "#F25542", "#34D399", "#FBBF24", "#60A5FA"];

function FinancePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const qc = useQueryClient();

  const { data: tx = [], isLoading } = useQuery({
    queryKey: ["tx-list", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("transactions").select("*, categories(name,color,icon)").order("date", { ascending: false });
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    const ch = supabase.channel("tx-rt").on("postgres_changes",
      { event: "*", schema: "public", table: "transactions" },
      () => qc.invalidateQueries({ queryKey: ["tx-list"] })
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const summary = useMemo(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let income = 0, expense = 0;
    const byCat: Record<string, { name: string; value: number; color: string }> = {};
    const byDay: Record<string, number> = {};
    for (const t of tx as any[]) {
      const d = new Date(t.date);
      if (d >= monthStart) {
        if (t.type === "income") income += Number(t.amount);
        if (t.type === "expense") {
          expense += Number(t.amount);
          const key = t.categories?.name ?? "Sem categoria";
          if (!byCat[key]) byCat[key] = { name: key, value: 0, color: t.categories?.color ?? "#FF6B57" };
          byCat[key].value += Number(t.amount);
        }
      }
      const ds = t.date as string;
      byDay[ds] = (byDay[ds] ?? 0) + (t.type === "expense" ? -Number(t.amount) : Number(t.amount));
    }
    const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
      .map(([date, v]) => ({ date: date.slice(5), value: v }));
    return { income, expense, balance: income - expense, byCat: Object.values(byCat), days };
  }, [tx]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir transação?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); qc.invalidateQueries(); }
  }
  async function handleDuplicate(t: any) {
    const { error } = await supabase.from("transactions").insert({
      user_id: user!.id,
      couple_id: space === "shared" ? coupleId : null,
      visibility: space,
      type: t.type, amount: t.amount, description: t.description, date: new Date().toISOString().slice(0, 10),
      category_id: t.category_id, note: t.note,
    } as any);
    if (error) toast.error(error.message); else { toast.success("Duplicado"); qc.invalidateQueries(); }
  }

  return (
    <>
      <AppHeader title="Finanças" subtitle="Receitas, despesas e gráficos" />
      <div className="px-4 py-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <Button asChild variant="outline" className="rounded-2xl h-auto py-3 whitespace-nowrap shrink-0 flex-1">
            <Link to="/app/financas/projecao">
              <TrendingUp className="size-4 mr-1" /> Projeção
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl h-auto py-3 whitespace-nowrap shrink-0 flex-1">
            <Link to="/app/financas/simular">
              <Sparkles className="size-4 mr-1" /> Simular
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl h-auto py-3 whitespace-nowrap shrink-0 flex-1">
            <Link to="/app/financas/simulacoes">
              <History className="size-4 mr-1" /> Histórico
            </Link>
          </Button>
        </div>
        <Card className="rounded-3xl p-5 shadow-card">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-32 rounded-xl" />
              <Skeleton className="h-3 w-20 rounded-md" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
              </div>
            </div>
          ) : (
            <>
              <div className="text-3xl font-bold mb-1">{formatBRL(summary.balance)}</div>
              <p className="text-xs text-muted-foreground mb-4">Saldo do mês</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-success/10 p-3">
                  <div className="flex items-center gap-1.5 text-success mb-1"><TrendingUp className="size-4" /><span className="text-xs">Receitas</span></div>
                  <div className="font-semibold text-sm">{formatBRL(summary.income)}</div>
                </div>
                <div className="rounded-2xl bg-destructive/10 p-3">
                  <div className="flex items-center gap-1.5 text-destructive mb-1"><TrendingDown className="size-4" /><span className="text-xs">Despesas</span></div>
                  <div className="font-semibold text-sm">{formatBRL(summary.expense)}</div>
                </div>
              </div>
            </>
          )}
        </Card>

        <Tabs defaultValue="list">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="list">Transações</TabsTrigger>
            <TabsTrigger value="charts">Gráficos</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-4">
            {tx.length === 0 ? (
              <Card className="rounded-2xl p-4 shadow-card">
                <EmptyState icon={Wallet} title="Sem transações" description="Adicione uma receita ou despesa pelo botão central." />
              </Card>
            ) : (
              <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
                {(tx as any[]).map((t) => (
                  <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                      t.type === "income" ? "bg-success/10 text-success" : t.type === "expense" ? "bg-destructive/10 text-destructive" : "bg-accent-purple/10 text-accent-purple"
                    }`}>
                      {t.type === "income" ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.description || t.categories?.name || "Sem descrição"}</div>
                      <div className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")} · {t.categories?.name ?? "—"}</div>
                    </div>
                    <div className={`text-sm font-semibold ${t.type === "income" ? "text-success" : "text-foreground"}`}>
                      {t.type === "expense" ? "-" : ""}{formatBRL(Number(t.amount))}
                    </div>
                    <button onClick={() => handleDuplicate(t)} className="size-8 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"><Copy className="size-3.5" /></button>
                    <button onClick={() => handleDelete(t.id)} className="size-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </Card>
            )}
          </TabsContent>
          <TabsContent value="charts" className="mt-4 space-y-4">
            {summary.byCat.length > 0 && (
              <Card className="rounded-3xl p-5 shadow-card">
                <h3 className="font-semibold mb-3 text-sm">Despesas por categoria</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={summary.byCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {summary.byCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {summary.byCat.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      <div className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="font-medium">{formatBRL(c.value)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {summary.days.length > 0 && (
              <Card className="rounded-3xl p-5 shadow-card">
                <h3 className="font-semibold mb-3 text-sm">Evolução (14 dias)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={summary.days}>
                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} />
                    <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                    <Line type="monotone" dataKey="value" stroke="#FF6B57" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}
            {summary.byCat.length > 0 && (
              <Card className="rounded-3xl p-5 shadow-card">
                <h3 className="font-semibold mb-3 text-sm">Categorias (barras)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={summary.byCat}>
                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} />
                    <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                    <Bar dataKey="value" fill="#FF6B57" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
