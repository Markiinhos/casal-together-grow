import { getLocalISODate } from "@/lib/date-utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, useCouple, usePartner } from "@/lib/hooks";
import { useSpace, applySpaceFilter } from "@/lib/space";
import { formatBRL } from "@/lib/couple";
import { getHomeMonthlySummary, fetchAccountsTotal, useSpendingPower } from "@/lib/finance";
import { AppHeader } from "@/components/AppHeader";
import { SpendingPowerCard } from "@/components/SpendingPowerCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { CoupleAvatar } from "@/components/CouplePhotoUploader";
import { FinanceInsights } from "@/components/FinanceInsights";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { buildSummary, fetchSubscriptions, monthlyEquivalent } from "@/lib/subscriptions";
import { calculateGoalProgress } from "@/lib/financial-goals";
import { useSmartAlerts } from "@/lib/smart-alerts";
import { SmartAlertsBanner } from "@/components/SmartAlertsBanner";
import {
  TrendingUp,
  TrendingDown,
  Target,
  CheckSquare,
  CalendarDays,
  Heart,
  UserPlus,
  Activity,
  Droplet,
  RefreshCw,
  Wallet,
  Receipt,
} from "lucide-react";
import { VoiceAssistantButton } from "@/components/VoiceAssistant/VoiceAssistantButton";
import { VoiceAssistantSheet } from "@/components/VoiceAssistant/VoiceAssistantSheet";

export const Route = createFileRoute("/app/")({
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: couple } = useCouple();
  const { data: partner } = usePartner();
  const { space } = useSpace();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [voiceOpen, setVoiceOpen] = useState(false);

  const ref = new Date();
  const opts = { space, userId: user?.id ?? "", coupleId };
  const monthKey = `${ref.getFullYear()}-${ref.getMonth()}`;

  const { data: spendingPower, isLoading: isSpendingPowerLoading } = useSpendingPower(
    ref,
    opts,
    !!user
  );

  const { data: txSummary, isLoading: isTxLoading } = useQuery({
    queryKey: ["home-monthly-summary", monthKey, space, coupleId, user?.id],
    queryFn: () => getHomeMonthlySummary(ref, opts),
    enabled: !!user,
  });

  const { data: smartAlerts = [], isLoading: isAlertsLoading } = useSmartAlerts(opts, ref);

  /** Contas bancárias do espaço atual + últimas movimentações vinculadas a elas. */
  const { data: accountsData, isLoading: isAccountsLoading } = useQuery({
    queryKey: ["home-accounts", space, coupleId, user?.id],
    queryFn: async () => {
      let qa: any = supabase
        .from("bank_accounts")
        .select("id,name,type,balance,color,icon,source")
        .eq("hidden", false)
        .order("created_at");
      qa = applySpaceFilter(qa, { space, userId: user!.id, coupleId });
      const { data: accounts } = await qa;
      const list = (accounts ?? []) as any[];

      let qt: any = supabase
        .from("transactions")
        .select("id,description,amount,type,date,account_id")
        .not("account_id", "is", null)
        .order("date", { ascending: false })
        .limit(6);
      qt = applySpaceFilter(qt, { space, userId: user!.id, coupleId });
      const { data: movements } = await qt;

      return { accounts: list, movements: (movements ?? []) as any[] };
    },
    enabled: !!user,
  });


  // Realtime cache invalidation for financial data
  useEffect(() => {
    if (!user) return;
    const invalidateFinance = () => {
      qc.invalidateQueries({ queryKey: ["spending-power"] });
      qc.invalidateQueries({ queryKey: ["financial-snapshot"] });
      qc.invalidateQueries({ queryKey: ["financial-actuals"] });
      qc.invalidateQueries({ queryKey: ["financial-forecast"] });
      qc.invalidateQueries({ queryKey: ["financial-commitments"] });
      qc.invalidateQueries({ queryKey: ["financial-accounts-balance"] });
      qc.invalidateQueries({ queryKey: ["financial-net-worth"] });
      qc.invalidateQueries({ queryKey: ["home-monthly-summary"] });
      qc.invalidateQueries({ queryKey: ["home-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly-summary"] });
      qc.invalidateQueries({ queryKey: ["fin-income"] });
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-accounts-total"] });
      qc.invalidateQueries({ queryKey: ["home-accounts"] });
      qc.invalidateQueries({ queryKey: ["home-subs"] });
    };

    const ch = supabase.channel("home-finance-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "installments" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_accounts" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "income_sources" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "future_bills" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "variable_expenses" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_cards" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_invoices" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "monthly_financial_plans" }, invalidateFinance)
      .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, () => {
        qc.invalidateQueries({ queryKey: ["home-goals"] });
        qc.invalidateQueries({ queryKey: ["spending-power"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "goal_contributions" }, () => {
        qc.invalidateQueries({ queryKey: ["home-goals"] });
        qc.invalidateQueries({ queryKey: ["spending-power"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const { data: subsData, isPending: subsLoading, isError: subsError, refetch: subsRefetch } = useQuery({
    queryKey: ["home-subs", space, coupleId, user?.id],
    queryFn: async () => {
      const subs = await fetchSubscriptions({ space, userId: user!.id, coupleId });
      return buildSummary(subs);
    },
    enabled: !!user,
    retry: 1,
  });

  const { data: goals } = useQuery({
    queryKey: ["home-goals", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase
        .from("goals")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(3);
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: upcomingEvents } = useQuery({
    queryKey: ["home-events", space, coupleId, user?.id],
    queryFn: async () => {
      const today = getLocalISODate(new Date());
      let q: any = supabase
        .from("events")
        .select("*")
        .gte("event_date", today)
        .order("event_date")
        .limit(3);
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: pendingTasks } = useQuery({
    queryKey: ["home-tasks", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase
        .from("house_tasks")
        .select("*")
        .eq("completed", false)
        .order("due_date", { nullsFirst: false })
        .limit(5);
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Private-only widgets
  const today = getLocalISODate(new Date());
  const { data: waterToday } = useQuery({
    queryKey: ["home-water", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("water_intake")
        .select("ml")
        .eq("user_id", user!.id)
        .eq("date", today);
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.ml ?? 0), 0);
    },
    enabled: !!user && space === "private",
  });

  const { data: lastWeight } = useQuery({
    queryKey: ["home-weight", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_metrics")
        .select("weight,date")
        .eq("user_id", user!.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user && space === "private",
  });

  const { data: habitsToday } = useQuery({
    queryKey: ["home-habits", user?.id, today],
    queryFn: async () => {
      const [habits, logs] = await Promise.all([
        supabase.from("habits").select("id,name,icon").eq("user_id", user!.id).eq("active", true),
        supabase.from("habit_logs").select("habit_id").eq("user_id", user!.id).eq("date", today),
      ]);
      const done = new Set((logs.data ?? []).map((l: any) => l.habit_id));
      return (habits.data ?? []).map((h: any) => ({ ...h, done: done.has(h.id) })).slice(0, 4);
    },
    enabled: !!user && space === "private",
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();
  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const isPrivate = space === "private";

  return (
    <>
      <AppHeader
        title={isPrivate ? "Meu Espaço" : couple?.name || "Nosso Espaço"}
        subtitle={
          isPrivate
            ? "Apenas você vê estes dados"
            : partner
              ? `Você + ${partner.full_name?.split(" ")[0] ?? "parceiro"}`
              : "Convide seu parceiro"
        }
      />
      <div className="px-4 py-4 space-y-5">
        <div className="flex items-center gap-3">
          {!isPrivate && couple && (
            <CoupleAvatar
              coupleId={couple.id}
              photoPath={(couple as any).photo_url ?? null}
              size={56}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{greeting},</p>
            <h2 className="text-2xl font-bold truncate">
              {firstName} {isPrivate ? "👤" : "💛"}
            </h2>
          </div>
        </div>

        {!isPrivate && !coupleId && (
          <Card className="rounded-3xl p-5 gradient-coral text-white border-0 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <UserPlus className="size-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-0.5">Conecte seu parceiro</h3>
                <p className="text-sm text-white/85 mb-3">
                  Compartilhem finanças, agenda e metas em tempo real.
                </p>
                <Link to="/app/parceiro">
                  <Button size="sm" className="bg-white text-primary hover:bg-white/90 rounded-xl">
                    Convidar
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Alertas Financeiros Inteligentes */}
        <SmartAlertsBanner alerts={smartAlerts} isLoading={isAlertsLoading} />

        <ErrorBoundary>
          <SpendingPowerCard
            data={spendingPower}
            isLoading={isSpendingPowerLoading}
            isPrivate={isPrivate}
          />
        </ErrorBoundary>

        <ErrorBoundary>
        <Card className="rounded-3xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{isPrivate ? "Minhas finanças do mês" : "Resumo do mês"}</h3>
            <div className="flex items-center gap-2">
              <Link
                to="/app/financas/recibos"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors border border-amber-500/30 shadow-xs"
              >
                <Receipt className="size-3" />
                <span>Ler Recibo</span>
              </Link>
              <Link to="/app/financas/fechamento" className="text-xs text-muted-foreground hover:text-foreground font-medium">
                Fechamento
              </Link>
              <Link to="/app/financas" className="text-xs text-primary font-medium">
                Ver tudo
              </Link>
            </div>
          </div>
          {isTxLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-40 rounded-xl" />
              <Skeleton className="h-4 w-24 rounded" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
              </div>
            </div>
          ) : (
            <>
              <div className="text-3xl font-bold mb-1">{formatBRL(txSummary?.monthlyBalance ?? 0)}</div>
              <p className="text-xs text-muted-foreground mb-4">Saldo do mês</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-success/10 p-3">
                  <div className="flex items-center gap-1.5 text-success mb-1">
                    <TrendingUp className="size-3.5" />
                    <span className="text-[11px] font-medium">Receitas</span>
                  </div>
                  <div className="font-semibold text-sm">{formatBRL(txSummary?.income ?? 0)}</div>
                </div>
                <div className="rounded-2xl bg-destructive/10 p-3">
                  <div className="flex items-center gap-1.5 text-destructive mb-1">
                    <TrendingDown className="size-3.5" />
                    <span className="text-[11px] font-medium">Despesas</span>
                  </div>
                  <div className="font-semibold text-sm">{formatBRL(txSummary?.expenses ?? 0)}</div>
                </div>
                <div className="rounded-2xl bg-accent-purple/10 p-3">
                  <div className="flex items-center gap-1.5 text-accent-purple mb-1">
                    <Target className="size-3.5" />
                    <span className="text-[11px] font-medium">Contas</span>
                  </div>
                  <div className="font-semibold text-sm">{formatBRL(txSummary?.accountsBalance ?? 0)}</div>
                </div>
              </div>

              {txSummary?.breakdown && (
                <div className="mt-3.5 pt-3 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-muted/30">
                    <div className="text-[10px] text-muted-foreground">Fixas</div>
                    <div className="font-semibold mt-0.5">{formatBRL(txSummary.breakdown.fixedExpenses)}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-muted/30">
                    <div className="text-[10px] text-muted-foreground">Variáveis</div>
                    <div className="font-semibold mt-0.5">{formatBRL(txSummary.breakdown.variableExpenses)}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-muted/30">
                    <div className="text-[10px] text-muted-foreground">Assinaturas</div>
                    <div className="font-semibold mt-0.5">{formatBRL(txSummary.breakdown.subscriptions)}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-muted/30">
                    <div className="text-[10px] text-muted-foreground">Cartões</div>
                    <div className="font-semibold mt-0.5">{formatBRL(txSummary.breakdown.cardExpenses)}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
        </ErrorBoundary>

        <ErrorBoundary>
        <Card className="rounded-3xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Minhas contas</h3>
            <Link to="/app/financas/contas" className="text-xs text-primary font-medium">
              Gerenciar
            </Link>
          </div>

          {isAccountsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 rounded-2xl" />
              <Skeleton className="h-12 rounded-2xl" />
            </div>
          ) : (accountsData?.accounts.length ?? 0) === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nenhuma conta cadastrada"
              description="Cadastre uma conta para acompanhar o saldo e as movimentações aqui."
            />
          ) : (
            <>
              <div className="space-y-2">
                {accountsData!.accounts.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-muted/30 p-3">
                    <div
                      className="size-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: (a.color || "#7B61FF") + "22", color: a.color || "#7B61FF" }}
                    >
                      <Wallet className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.name || "Conta"}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {a.type || "conta"}{a.source === "pluggy" ? " · sincronizada" : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{formatBRL(Number(a.balance ?? 0))}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-border/50">
                <div className="text-xs font-semibold text-muted-foreground mb-2">Últimas movimentações</div>
                {(accountsData?.movements.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma movimentação vinculada às contas ainda.</p>
                ) : (
                  <div className="space-y-1.5">
                    {accountsData!.movements.map((m: any) => {
                      const acc = accountsData!.accounts.find((a: any) => a.id === m.account_id);
                      const isIncome = m.type === "income";
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <div className="truncate">{m.description || (isIncome ? "Entrada" : "Saída")}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {new Date(m.date + "T00:00:00").toLocaleDateString("pt-BR")}
                              {acc ? ` · ${acc.name}` : ""}
                            </div>
                          </div>
                          <div className={`font-semibold shrink-0 ${isIncome ? "text-success" : "text-destructive"}`}>
                            {isIncome ? "+" : "-"}{formatBRL(Number(m.amount ?? 0))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
        </ErrorBoundary>



        {!isPrivate && (
          <ErrorBoundary>
            <FinanceInsights />
          </ErrorBoundary>
        )}

        <ErrorBoundary>
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Assinaturas</h3>
            <Link to="/app/financas/assinaturas" className="text-xs text-primary font-medium">
              Ver tudo
            </Link>
          </div>
          {subsLoading ? (
            <Card className="rounded-2xl p-4 shadow-card">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-6 w-28 rounded-lg" />
                  <Skeleton className="h-3 w-14 rounded" />
                </div>
                <div className="space-y-2 pl-4 border-l border-border/50">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
            </Card>
          ) : subsError ? (
            <Card className="rounded-2xl p-4 shadow-card text-center space-y-2">
              <p className="text-xs text-muted-foreground">Não foi possível carregar as assinaturas.</p>
              <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => subsRefetch()}>
                <RefreshCw className="size-3 mr-1" /> Tentar novamente
              </Button>
            </Card>
          ) : !subsData || subsData.activeCount === 0 ? (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={RefreshCw} title="Sem assinaturas" description="Nenhuma assinatura cadastrada." />
            </Card>
          ) : (
            <Card className="rounded-2xl p-4 shadow-card grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Custo mensal</p>
                <p className="text-lg font-bold">{formatBRL(subsData.monthlyTotal)}</p>
                <p className="text-[10px] text-muted-foreground">{subsData.activeCount} ativas</p>
              </div>
              <div className="border-l pl-4 border-border/50">
                <p className="text-[11px] text-muted-foreground font-medium">Próxima</p>
                {subsData.nextCharge ? (
                  <>
                    <p className="text-sm font-semibold truncate">{subsData.nextCharge.name}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(subsData.nextCharge.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">Nenhuma</p>
                )}
              </div>
            </Card>
          )}
        </section>
        </ErrorBoundary>

        {isPrivate && (
          <section>
            <h3 className="font-semibold mb-3">Saúde de hoje</h3>
            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-2xl p-4 shadow-card">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <Droplet className="size-4" />
                  <span className="text-xs font-medium">Água</span>
                </div>
                <div className="text-xl font-bold">{((waterToday ?? 0) / 1000).toFixed(1)} L</div>
                <Link to="/app/saude" className="text-xs text-primary mt-1 inline-block">
                  Registrar
                </Link>
              </Card>
              <Card className="rounded-2xl p-4 shadow-card">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <Activity className="size-4" />
                  <span className="text-xs font-medium">Peso</span>
                </div>
                <div className="text-xl font-bold">
                  {lastWeight?.weight ? `${Number(lastWeight.weight).toFixed(1)} kg` : "—"}
                </div>
                <Link to="/app/saude" className="text-xs text-primary mt-1 inline-block">
                  Atualizar
                </Link>
              </Card>
            </div>
          </section>
        )}

        {isPrivate && habitsToday && habitsToday.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Hábitos de hoje</h3>
              <Link to="/app/rotina" className="text-xs text-primary font-medium">
                Ver tudo
              </Link>
            </div>
            <Card className="rounded-2xl divide-y divide-border shadow-card overflow-hidden">
              {habitsToday.map((h: any) => (
                <div key={h.id} className="px-4 py-3 flex items-center gap-3">
                  <div
                    className={`size-5 rounded-full border-2 ${h.done ? "bg-primary border-primary" : "border-muted-foreground"}`}
                  />
                  <div className="flex-1 text-sm font-medium">{h.name}</div>
                  {h.done && <span className="text-xs text-success">✓</span>}
                </div>
              ))}
            </Card>
          </section>
        )}

        <ErrorBoundary>
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{isPrivate ? "Minhas metas" : "Metas ativas"}</h3>
            <Link to="/app/metas" className="text-xs text-primary font-medium">
              Ver tudo
            </Link>
          </div>
          {goals && goals.length > 0 ? (
            <div className="space-y-2.5">
              {goals.map((g: any) => {
                const pacing = calculateGoalProgress(g);
                return (
                  <Link key={g.id} to="/app/metas" className="block">
                    <Card className="rounded-2xl p-3.5 shadow-card hover:shadow-md transition-all border border-border/80">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="size-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                          <Target className="size-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-sm truncate">{g.name}</span>
                            <span className="text-xs font-bold text-primary">{pacing.progressPct}%</span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center justify-between gap-1 mt-0.5">
                            <span>
                              {formatBRL(pacing.currentAmount)} de {formatBRL(pacing.targetAmount)}
                            </span>
                            {pacing.remainingAmount > 0 ? (
                              <span className="text-[11px] font-medium text-foreground">
                                Falta {formatBRL(pacing.remainingAmount)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-success">
                                Atingida 🎉
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                        <div
                          className="h-full gradient-coral transition-all rounded-full"
                          style={{ width: `${pacing.displayPct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                        <span className={`px-2 py-0.5 rounded-full font-medium border ${pacing.statusColor}`}>
                          {pacing.statusLabel}
                        </span>
                        {pacing.daysRemaining > 0 && pacing.remainingAmount > 0 ? (
                          <span>
                            Precisa: <strong className="text-primary">{formatBRL(pacing.neededPerDay)}/dia</strong> ({pacing.daysRemaining}d)
                          </span>
                        ) : pacing.deadline ? (
                          <span>Prazo encerrado</span>
                        ) : null}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={Target} title="Sem metas" description="Crie sua primeira meta" />
            </Card>
          )}
        </section>
        </ErrorBoundary>

        <ErrorBoundary>
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Próximos compromissos</h3>
            <Link to="/app/agenda" className="text-xs text-primary font-medium">
              Ver tudo
            </Link>
          </div>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <div className="space-y-2">
              {upcomingEvents.map((e: any) => (
                <Card key={e.id} className="rounded-2xl p-3 shadow-card flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-accent-purple/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] uppercase font-semibold text-accent-purple">
                      {new Date(e.event_date).toLocaleDateString("pt-BR", { month: "short" }).slice(0, 3)}
                    </span>
                    <span className="text-sm font-bold text-accent-purple leading-none">
                      {new Date(e.event_date).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.event_time?.slice(0, 5) ?? "Dia todo"}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={CalendarDays} title="Nenhum compromisso" description="Adicione eventos" />
            </Card>
          )}
        </section>
        </ErrorBoundary>

        <ErrorBoundary>
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Tarefas pendentes</h3>
            <Link to="/app/tarefas" className="text-xs text-primary font-medium">
              Ver tudo
            </Link>
          </div>
          {pendingTasks && pendingTasks.length > 0 ? (
            <Card className="rounded-2xl divide-y divide-border shadow-card overflow-hidden">
              {pendingTasks.slice(0, 4).map((t: any) => (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                  <CheckSquare className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    {t.due_date && (
                      <div className="text-xs text-muted-foreground">
                        {new Date(t.due_date).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      t.priority === "high"
                        ? "bg-destructive/10 text-destructive"
                        : t.priority === "medium"
                          ? "bg-warning/10 text-warning-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.priority === "high" ? "Alta" : t.priority === "medium" ? "Média" : "Baixa"}
                  </span>
                </div>
              ))}
            </Card>
          ) : (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={Heart} title="Tudo em dia ✨" description="Sem tarefas pendentes" />
            </Card>
          )}
        </section>
        </ErrorBoundary>
      </div>

      <div className="fixed bottom-24 right-4 z-50">
        <VoiceAssistantButton onClick={() => setVoiceOpen(true)} />
      </div>
      <VoiceAssistantSheet open={voiceOpen} onOpenChange={setVoiceOpen} />
    </>
  );
}
