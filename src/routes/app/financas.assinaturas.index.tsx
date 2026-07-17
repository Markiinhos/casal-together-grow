import { getLocalISODate } from "@/lib/date-utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import {
  fetchSubscriptions,
  buildSummary,
  monthlyEquivalent,
  frequencyLabel,
  statusLabel,
  statusColor,
  paymentMethodLabel,
  type Subscription,
  type SubStatus,
} from "@/lib/subscriptions";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  Plus, RefreshCw, Calendar, Wallet, TrendingUp,
  CreditCard, Pause, Play, XCircle, ArrowUpDown,
  Filter, ChevronRight, Bell, Clock, Zap
} from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export const Route = createFileRoute("/app/financas/assinaturas/")(
  { component: SubsPage },
);

type FilterKey = "all" | "active" | "trial" | "paused" | "canceled" | "expiring" | "monthly" | "annual";
type SortKey = "next_billing" | "highest" | "lowest" | "newest" | "alpha";

function SubsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("next_billing");

  const { data: subs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["subscriptions", space, coupleId, user?.id],
    queryFn: () => fetchSubscriptions({ space, userId: user!.id, coupleId }),
    enabled: !!user,
  });

  const summary = useMemo(() => buildSummary(subs), [subs]);

  const filtered = useMemo(() => {
    let list = [...subs];
    const now = new Date();
    const in7Days = getLocalISODate(new Date(now.getTime() + 7 * 86400000));
    const today = getLocalISODate(now);

    switch (filter) {
      case "active": list = list.filter(s => s.status === "active"); break;
      case "trial": list = list.filter(s => s.status === "trial"); break;
      case "paused": list = list.filter(s => s.status === "paused"); break;
      case "canceled": list = list.filter(s => s.status === "canceled" || s.status === "ended"); break;
      case "expiring": list = list.filter(s => s.next_billing_date >= today && s.next_billing_date <= in7Days && (s.status === "active" || s.status === "trial")); break;
      case "monthly": list = list.filter(s => s.billing_frequency === "monthly"); break;
      case "annual": list = list.filter(s => s.billing_frequency === "annual"); break;
    }

    switch (sort) {
      case "next_billing": list.sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date)); break;
      case "highest": list.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)); break;
      case "lowest": list.sort((a, b) => monthlyEquivalent(a) - monthlyEquivalent(b)); break;
      case "newest": list.sort((a, b) => b.created_at.localeCompare(a.created_at)); break;
      case "alpha": list.sort((a, b) => a.name.localeCompare(b.name)); break;
    }

    return list;
  }, [subs, filter, sort]);

  if (isError) {
    return (
      <>
        <PageHeader title="Assinaturas" subtitle="Erro ao carregar" fallbackRoute="/app/financas" />
        <div className="px-4 py-8">
          <Card className="rounded-3xl p-6 shadow-card text-center space-y-4">
            <p className="text-sm text-destructive font-semibold">Não foi possível carregar suas assinaturas.</p>
            <Button variant="outline" onClick={() => refetch()} className="rounded-xl">
              <RefreshCw className="size-4 mr-2" /> Tentar novamente
            </Button>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Assinaturas" subtitle="Despesas recorrentes" fallbackRoute="/app/financas" />
      <div className="px-4 py-4 space-y-4 pb-24">
        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-3xl p-4 shadow-card border-l-4 border-l-primary">
                <p className="text-[11px] text-muted-foreground mb-1 font-medium">Custo mensal</p>
                <p className="text-lg font-bold">{formatBRL(summary.monthlyTotal)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{summary.activeCount} assinatura{summary.activeCount !== 1 ? "s" : ""} ativa{summary.activeCount !== 1 ? "s" : ""}</p>
              </Card>
              <Card className="rounded-3xl p-4 shadow-card border-l-4 border-l-blue-500">
                <p className="text-[11px] text-muted-foreground mb-1 font-medium">Previsão anual</p>
                <p className="text-lg font-bold">{formatBRL(summary.annualTotal)}</p>
                {summary.trialCount > 0 && (
                  <p className="text-[10px] text-blue-600 mt-1">{summary.trialCount} em teste</p>
                )}
              </Card>
            </div>

            {summary.nextCharge && (
              <Card className="rounded-2xl px-4 py-3 shadow-card flex items-center gap-3 border-l-4 border-l-orange-400">
                <div className="size-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                  <Bell className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">Próxima cobrança</p>
                  <p className="text-[11px] text-muted-foreground">
                    {summary.nextCharge.name} — {new Date(summary.nextCharge.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
                  </p>
                </div>
                <div className="text-sm font-semibold shrink-0">{formatBRL(summary.nextCharge.amount)}</div>
              </Card>
            )}
          </>
        )}

        {/* CTA + Filters */}
        <Button
          onClick={() => navigate({ to: "/app/financas/assinaturas/nova" })}
          className="w-full rounded-xl gradient-coral text-white border-0 h-11 shadow-sm font-medium"
        >
          <Plus className="size-4 mr-1.5" /> Nova assinatura
        </Button>

        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <SelectTrigger className="flex-1 h-9 rounded-xl text-xs">
              <Filter className="size-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="trial">Teste gratuito</SelectItem>
              <SelectItem value="paused">Pausadas</SelectItem>
              <SelectItem value="canceled">Canceladas</SelectItem>
              <SelectItem value="expiring">Vencendo em breve</SelectItem>
              <SelectItem value="monthly">Mensais</SelectItem>
              <SelectItem value="annual">Anuais</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-[140px] h-9 rounded-xl text-xs">
              <ArrowUpDown className="size-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="next_billing">Próxima cobrança</SelectItem>
              <SelectItem value="highest">Maior valor</SelectItem>
              <SelectItem value="lowest">Menor valor</SelectItem>
              <SelectItem value="newest">Mais recente</SelectItem>
              <SelectItem value="alpha">A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="rounded-3xl p-4 shadow-card">
            <EmptyState
              icon={Wallet}
              title={filter !== "all" ? "Nenhuma neste filtro" : "Sem assinaturas"}
              description={filter !== "all" ? "Tente alterar o filtro selecionado" : "Cadastre uma assinatura para acompanhar"}
              action={
                filter === "all" ? (
                  <Button onClick={() => navigate({ to: "/app/financas/assinaturas/nova" })} className="rounded-xl gradient-coral text-white border-0">
                    <Plus className="size-4 mr-1" /> Adicionar primeira assinatura
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((sub) => (
              <SubCard key={sub.id} sub={sub} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SubCard({ sub }: { sub: Subscription }) {
  const navigate = useNavigate();
  const me = monthlyEquivalent(sub);
  const nextDate = new Date(sub.next_billing_date + "T12:00:00");
  const now = new Date();
  const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / 86400000);
  const isExpiring = daysUntil >= 0 && daysUntil <= 3;

  const catColor = (sub.categories as any)?.color ?? "#7B61FF";

  return (
    <Card
      className="rounded-2xl p-4 shadow-card cursor-pointer hover:bg-muted/30 transition-colors active:scale-[0.99]"
      onClick={() => navigate({ to: "/app/financas/assinaturas/$id", params: { id: sub.id } })}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: catColor + "22", color: catColor }}
        >
          {sub.payment_method === "credit_card" ? (
            <CreditCard className="size-4" />
          ) : (
            <Wallet className="size-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate">{sub.name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${statusColor(sub.status)}`}>
              {statusLabel(sub.status)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            <span>{frequencyLabel(sub.billing_frequency, sub.billing_interval)}</span>
            <span>·</span>
            {sub.status === "active" || sub.status === "trial" ? (
              <span className={isExpiring ? "text-orange-500 font-medium" : ""}>
                {daysUntil < 0
                  ? "Vencida"
                  : daysUntil === 0
                  ? "Hoje"
                  : daysUntil === 1
                  ? "Amanhã"
                  : `em ${daysUntil} dias`}
              </span>
            ) : (
              <span>{statusLabel(sub.status)}</span>
            )}
            {sub.credit_cards && (
              <>
                <span>·</span>
                <span className="truncate">{(sub.credit_cards as any).name}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold">{formatBRL(Number(sub.amount))}</div>
          {me !== Number(sub.amount) && me > 0 && (
            <div className="text-[10px] text-muted-foreground">{formatBRL(me)}/mês</div>
          )}
        </div>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      </div>
    </Card>
  );
}
