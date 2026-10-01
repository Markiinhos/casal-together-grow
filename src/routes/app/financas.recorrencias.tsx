import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { usePartner, useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import { formatDateOnly } from "@/lib/date-utils";
import { useUnifiedRecurrences, type UnifiedRecurrenceItem, type RecurrenceType } from "@/lib/recurrences";
import { useSmartAlerts } from "@/lib/smart-alerts";
import { SmartAlertsBanner } from "@/components/SmartAlertsBanner";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Repeat,
  CalendarDays,
  CalendarCheck,
  CreditCard,
  Tv,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Plus,
  ShieldAlert,
  Wallet,
  CheckCircle2,
  Clock,
  Layers,
  ChevronRight,
  Calendar,
} from "lucide-react";

export const Route = createFileRoute("/app/financas/recorrencias")({
  component: RecorrenciasPage,
});

function RecorrenciasPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();

  const refDate = useMemo(() => new Date(), []);
  const opts = useMemo(
    () => ({ space, userId: user?.id ?? "", coupleId }),
    [space, user?.id, coupleId]
  );

  // Consulta de Recorrências Unificadas
  const { data: summary, isLoading: isLoadingRecurrences, refetch: refetchRecurrences } = useUnifiedRecurrences(opts, refDate);

  // Consulta e sincronização de Alertas Inteligentes
  const { data: smartAlerts = [], isLoading: isLoadingAlerts } = useSmartAlerts(opts, refDate);

  // Estado da aba de filtro: "all" | "fixed_bill" | "subscription" | "installment" | "income"
  const [activeTab, setActiveTab] = useState<string>("all");
  // Modo de ordenação: "day" (cronológico por dia 1-31) | "amount" (por maior valor)
  const [sortMode, setSortMode] = useState<"day" | "amount">("day");

  const filteredItems = useMemo(() => {
    if (!summary?.items) return [];
    let list = summary.items;

    if (activeTab !== "all") {
      list = list.filter((i) => {
        if (activeTab === "fixed_bill") return i.type === "fixed_bill" || i.type === "future_bill";
        return i.type === activeTab;
      });
    }

    return [...list].sort((a, b) => {
      if (sortMode === "day") {
        const dayA = a.dayOfMonth ?? 32;
        const dayB = b.dayOfMonth ?? 32;
        return dayA - dayB;
      }
      return b.monthlyAmount - a.monthlyAmount;
    });
  }, [summary?.items, activeTab, sortMode]);

  return (
    <>
      <PageHeader
        title="Recorrências"
        subtitle="Compromissos fixos, assinaturas, parcelas e rendas"
        fallbackRoute="/app/financas"
      />

      <div className="px-4 py-4 space-y-4 max-w-md mx-auto pb-24">
        {/* Alertas Financeiros Inteligentes */}
        <SmartAlertsBanner
          alerts={smartAlerts}
          isLoading={isLoadingAlerts}
        />

        {/* ── CARD PRINCIPAL: COMPROMISSO MENSAL E ANUAL ────────────── */}
        {isLoadingRecurrences ? (
          <Skeleton className="h-44 rounded-3xl w-full" />
        ) : (
          <Card className="rounded-3xl p-5 border border-border shadow-card bg-gradient-to-br from-card via-card/90 to-primary/5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Repeat className="size-4" />
                </div>
                <div>
                  <h2 className="font-bold text-sm">Central de Recorrências</h2>
                  <p className="text-[11px] text-muted-foreground">Planejamento contínuo do casal</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-semibold">
                {space === "shared" ? "Casal" : "Individual"}
              </Badge>
            </div>

            {/* Destaques obrigatórios: Compromisso mensal recorrente & anual estimado */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-2xl bg-destructive/5 border border-destructive/20 p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-destructive flex items-center gap-1">
                  <TrendingDown className="size-3" /> Compromisso mensal
                </span>
                <div className="font-bold text-base sm:text-lg text-foreground tracking-tight">
                  {formatBRL(summary?.monthlyCommitment ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Gasto fixo obrigatório/mês
                </div>
              </div>

              <div className="rounded-2xl bg-primary/5 border border-primary/20 p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-primary flex items-center gap-1">
                  <Calendar className="size-3" /> Compromisso anual
                </span>
                <div className="font-bold text-base sm:text-lg text-foreground tracking-tight">
                  {formatBRL(summary?.annualCommitment ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Estimativa para os próximos 12m
                </div>
              </div>
            </div>

            {/* Balanço de Receitas Recorrentes vs Compromisso */}
            <div className="mt-4 pt-3.5 border-t border-border/70 flex items-center justify-between text-xs">
              <div>
                <span className="text-muted-foreground text-[11px]">Receita Recorrente:</span>
                <span className="font-semibold text-success ml-1.5">
                  +{formatBRL(summary?.monthlyRecurringIncome ?? 0)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground text-[11px]">Livre após contas:</span>
                <span
                  className={`font-bold ml-1.5 ${
                    (summary?.recurringNetMonthly ?? 0) >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {formatBRL(summary?.recurringNetMonthly ?? 0)}
                </span>
              </div>
            </div>

            {/* Pílulas de detalhamento por categoria de compromisso */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/50 text-[11px]">
              <div className="bg-muted/40 rounded-xl p-2 text-center">
                <div className="text-muted-foreground text-[10px]">Fixas</div>
                <div className="font-semibold text-foreground mt-0.5">
                  {formatBRL(summary?.breakdown.fixedBillsMonthly ?? 0)}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {summary?.counts.fixedBills ?? 0} contas
                </div>
              </div>

              <div className="bg-muted/40 rounded-xl p-2 text-center">
                <div className="text-muted-foreground text-[10px]">Assinaturas</div>
                <div className="font-semibold text-foreground mt-0.5">
                  {formatBRL(summary?.breakdown.subscriptionsMonthly ?? 0)}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {summary?.counts.subscriptions ?? 0} ativas
                </div>
              </div>

              <div className="bg-muted/40 rounded-xl p-2 text-center">
                <div className="text-muted-foreground text-[10px]">Parcelamentos</div>
                <div className="font-semibold text-foreground mt-0.5">
                  {formatBRL(summary?.breakdown.installmentsMonthly ?? 0)}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {summary?.counts.installments ?? 0} planos
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── ATALHOS RÁPIDOS PARA CADASTROS ──────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          <Link to="/app/financas/estrutura" className="w-full">
            <Button variant="outline" size="sm" className="w-full h-9 rounded-xl text-xs gap-1 px-1">
              <Plus className="size-3.5 text-primary" /> Despesa Fixa
            </Button>
          </Link>
          <Link to="/app/financas/assinaturas/nova" className="w-full">
            <Button variant="outline" size="sm" className="w-full h-9 rounded-xl text-xs gap-1 px-1">
              <Plus className="size-3.5 text-indigo-500" /> Assinatura
            </Button>
          </Link>
          <Link to="/app/cartoes" className="w-full">
            <Button variant="outline" size="sm" className="w-full h-9 rounded-xl text-xs gap-1 px-1">
              <CreditCard className="size-3.5 text-blue-500" /> Parcelamentos
            </Button>
          </Link>
        </div>

        {/* ── ABAS DE FILTRAGEM & LISTA DE RECORRÊNCIAS ────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Cronograma de Cobranças</h3>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">Ordenar:</span>
              <button
                onClick={() => setSortMode(sortMode === "day" ? "amount" : "day")}
                className="font-medium text-primary hover:underline"
              >
                {sortMode === "day" ? "Por dia (1-31)" : "Por valor"}
              </button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-5 h-9 rounded-xl p-0.5 bg-muted/60">
              <TabsTrigger value="all" className="rounded-lg text-xs">
                Todas ({summary?.counts.total ?? 0})
              </TabsTrigger>
              <TabsTrigger value="fixed_bill" className="rounded-lg text-xs">
                Fixas ({summary?.counts.fixedBills ?? 0})
              </TabsTrigger>
              <TabsTrigger value="subscription" className="rounded-lg text-xs">
                Assin. ({summary?.counts.subscriptions ?? 0})
              </TabsTrigger>
              <TabsTrigger value="installment" className="rounded-lg text-xs">
                Parc. ({summary?.counts.installments ?? 0})
              </TabsTrigger>
              <TabsTrigger value="income" className="rounded-lg text-xs">
                Receitas ({summary?.counts.income ?? 0})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Listagem */}
          {isLoadingRecurrences ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-2xl w-full" />
              <Skeleton className="h-16 rounded-2xl w-full" />
              <Skeleton className="h-16 rounded-2xl w-full" />
            </div>
          ) : filteredItems.length === 0 ? (
            <Card className="rounded-2xl p-6 text-center border-dashed">
              <Repeat className="size-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="font-medium text-sm">Nenhuma recorrência encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Adicione contas fixas, assinaturas ou receitas recorrentes para acompanhar aqui.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const isIncome = item.isIncome;
                const isInstallment = item.type === "installment";
                const isSubscription = item.type === "subscription";
                const isFixed = item.type === "fixed_bill" || item.type === "future_bill";

                // Destino de navegação por tipo
                const linkTo = isSubscription
                  ? `/app/financas/assinaturas/${item.id.replace("subscription-", "")}`
                  : isInstallment
                  ? `/app/cartoes`
                  : isFixed
                  ? `/app/financas/estrutura`
                  : `/app/financas/estrutura`;

                return (
                  <Link key={item.id} to={linkTo as any}>
                    <Card className="rounded-2xl p-3.5 border hover:border-primary/40 transition-all shadow-sm flex items-center justify-between gap-3 group">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Pílula com o dia do mês */}
                        <div className="size-11 rounded-xl bg-accent flex flex-col items-center justify-center shrink-0 border border-border/60">
                          <span className="text-[9px] font-medium text-muted-foreground uppercase leading-none">
                            Dia
                          </span>
                          <span className="font-bold text-sm text-foreground leading-tight">
                            {item.dayOfMonth ?? "—"}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-xs sm:text-sm truncate">
                              {item.title}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 font-normal text-muted-foreground shrink-0"
                            >
                              {item.typeLabel}
                            </Badge>
                          </div>

                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {item.detail || item.categoryName}
                          </div>

                          {item.nextDueDate && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <CalendarCheck className="size-3" />
                              <span>Vencimento: {item.dueDateFormatted}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-bold text-xs sm:text-sm ${
                            isIncome ? "text-success" : "text-foreground"
                          }`}
                        >
                          {isIncome ? "+" : ""}
                          {formatBRL(item.monthlyAmount)}
                          <span className="text-[10px] font-normal text-muted-foreground">/mês</span>
                        </div>

                        <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                          <span>{formatBRL(item.annualAmount)}/ano</span>
                          <ChevronRight className="size-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
