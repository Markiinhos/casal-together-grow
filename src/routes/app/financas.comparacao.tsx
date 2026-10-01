import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import { formatDateOnly, formatReferenceMonth } from "@/lib/date-utils";
import { useMonthlyComparison, type CategoryComparisonItem, type AnomalyItem, type DuplicateTransactionItem } from "@/lib/monthly-comparison";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransactionEditDrawer } from "@/components/TransactionEditDrawer";
import {
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Copy,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  PieChart,
  ShieldCheck,
  CreditCard,
  Wallet,
  PiggyBank,
  Info,
  Calendar,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { subMonths, addMonths } from "date-fns";

export const Route = createFileRoute("/app/financas/comparacao")({
  component: ComparacaoMensalPage,
});

function ComparacaoMensalPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();

  // Mês A (padrão: mês atual)
  const [dateA, setDateA] = useState<Date>(() => new Date());
  // Mês B (padrão: mês anterior)
  const [dateB, setDateB] = useState<Date>(() => subMonths(new Date(), 1));

  // Gaveta de edição/conferência de transação duplicada
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  // Filtro de categorias: "all" | "up" | "down"
  const [categoryFilter, setCategoryFilter] = useState<"all" | "up" | "down">("all");

  const opts = useMemo(
    () => ({ space, userId: user?.id ?? "", coupleId }),
    [space, user?.id, coupleId]
  );

  const { data: comparison, isLoading, refetch } = useMonthlyComparison(dateA, dateB, opts);

  // Nomes dos meses para exibição "Setembro x Agosto"
  const monthNameA = useMemo(() => {
    const raw = dateA.toLocaleDateString("pt-BR", { month: "long" });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [dateA]);

  const monthNameB = useMemo(() => {
    const raw = dateB.toLocaleDateString("pt-BR", { month: "long" });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [dateB]);

  // Trocar Mês A e Mês B
  function handleSwapMonths() {
    const temp = dateA;
    setDateA(dateB);
    setDateB(temp);
  }

  // Filtragem de categorias
  const filteredCategories = useMemo(() => {
    if (!comparison?.categories) return [];
    if (categoryFilter === "up") {
      return comparison.categories.filter((c) => c.diffPercent > 0);
    }
    if (categoryFilter === "down") {
      return comparison.categories.filter((c) => c.diffPercent < 0);
    }
    return comparison.categories;
  }, [comparison?.categories, categoryFilter]);

  return (
    <>
      <PageHeader
        title="Comparação Mensal"
        subtitle={`${monthNameA} x ${monthNameB}`}
        fallbackRoute="/app/financas"
      />

      <div className="px-4 py-4 space-y-4 max-w-md mx-auto pb-24">
        {/* Seletor Comparativo dos 2 Meses */}
        <Card className="rounded-3xl p-4 border shadow-sm bg-gradient-to-r from-card via-card/90 to-primary/5">
          <div className="flex items-center justify-between gap-2">
            {/* Bloco Mês A */}
            <div className="flex-1 bg-background/80 rounded-2xl p-2.5 border text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block mb-1">
                Mês Principal (A)
              </span>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setDateA(subMonths(dateA, 1))}
                  className="size-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
                  aria-label="Mês anterior A"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="font-bold text-xs sm:text-sm capitalize truncate px-1">
                  {formatReferenceMonth(`${dateA.getFullYear()}-${String(dateA.getMonth() + 1).padStart(2, "0")}`)}
                </span>
                <button
                  onClick={() => setDateA(addMonths(dateA, 1))}
                  className="size-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
                  aria-label="Próximo mês A"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            {/* Botão de Troca / Inversão */}
            <button
              onClick={handleSwapMonths}
              className="size-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center shrink-0 transition"
              title="Trocar ordem dos meses"
            >
              <ArrowLeftRight className="size-4" />
            </button>

            {/* Bloco Mês B */}
            <div className="flex-1 bg-background/80 rounded-2xl p-2.5 border text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block mb-1">
                Comparar com (B)
              </span>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setDateB(subMonths(dateB, 1))}
                  className="size-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
                  aria-label="Mês anterior B"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="font-bold text-xs sm:text-sm capitalize truncate px-1">
                  {formatReferenceMonth(`${dateB.getFullYear()}-${String(dateB.getMonth() + 1).padStart(2, "0")}`)}
                </span>
                <button
                  onClick={() => setDateB(addMonths(dateB, 1))}
                  className="size-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
                  aria-label="Próximo mês B"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* ── CARD PRINCIPAL: 4 PILARES COMPARATIVOS ─────────────────── */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 rounded-3xl w-full" />
            <Skeleton className="h-44 rounded-3xl w-full" />
          </div>
        ) : (
          <>
            <Card className="rounded-3xl p-5 border shadow-card bg-card space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" />
                  <span>Resultado Geral: {monthNameA} vs {monthNameB}</span>
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {space === "shared" ? "Casal" : "Individual"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 1. RECEITAS */}
                <div className="rounded-2xl bg-success/5 border border-success/20 p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-success">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <TrendingUp className="size-3" /> Receitas
                    </span>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-success/15">
                      {comparison?.summary.income.diffPercentFormatted}
                    </span>
                  </div>
                  <div className="font-bold text-sm sm:text-base text-foreground mt-1">
                    {formatBRL(comparison?.summary.income.monthA ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    vs {formatBRL(comparison?.summary.income.monthB ?? 0)} em {monthNameB}
                  </div>
                </div>

                {/* 2. DESPESAS */}
                <div className="rounded-2xl bg-destructive/5 border border-destructive/20 p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-destructive">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <TrendingDown className="size-3" /> Despesas
                    </span>
                    {/* Se despesas caíram (-5%), é positivo! */}
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        (comparison?.summary.expenses.diffPercent ?? 0) <= 0
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {comparison?.summary.expenses.diffPercentFormatted}
                    </span>
                  </div>
                  <div className="font-bold text-sm sm:text-base text-foreground mt-1">
                    {formatBRL(comparison?.summary.expenses.monthA ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    vs {formatBRL(comparison?.summary.expenses.monthB ?? 0)} em {monthNameB}
                  </div>
                </div>

                {/* 3. CARTÕES */}
                <div className="rounded-2xl bg-blue-500/5 border border-blue-500/20 p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-blue-600">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <CreditCard className="size-3" /> Cartões
                    </span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        (comparison?.summary.cardInvoices.diffPercent ?? 0) <= 0
                          ? "bg-success/15 text-success"
                          : "bg-amber-500/15 text-amber-600"
                      }`}
                    >
                      {comparison?.summary.cardInvoices.diffPercentFormatted}
                    </span>
                  </div>
                  <div className="font-bold text-sm sm:text-base text-foreground mt-1">
                    {formatBRL(comparison?.summary.cardInvoices.monthA ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    vs {formatBRL(comparison?.summary.cardInvoices.monthB ?? 0)} em {monthNameB}
                  </div>
                </div>

                {/* 4. ECONOMIA / TAXA DE POUPANÇA */}
                <div className="rounded-2xl bg-purple-500/5 border border-purple-500/20 p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-purple-600">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <PiggyBank className="size-3" /> Economia
                    </span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        (comparison?.summary.savings.rateDiff ?? 0) >= 0
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {comparison?.summary.savings.rateMonthAFormatted}
                    </span>
                  </div>
                  <div className="font-bold text-sm sm:text-base text-foreground mt-1">
                    {formatBRL(comparison?.summary.savings.monthA ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Taxa {monthNameB}: {comparison?.summary.savings.rateMonthBFormatted}
                  </div>
                </div>
              </div>
            </Card>

            {/* ── SEÇÃO: DETECÇÃO DE ANOMALIAS (GASTOS FORA DO PADRÃO) ── */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center">
                    <AlertTriangle className="size-3.5" />
                  </div>
                  <h3 className="font-bold text-xs sm:text-sm">
                    Gastos Fora do Padrão ({comparison?.anomalies.length ?? 0})
                  </h3>
                </div>
                <Badge variant="outline" className="text-[9px] text-muted-foreground">
                  Baseado no Histórico
                </Badge>
              </div>

              {comparison?.anomalies.length === 0 ? (
                <Card className="rounded-2xl p-4 border border-dashed flex items-center gap-3 bg-muted/20">
                  <CheckCircle2 className="size-5 text-success shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    Nenhum gasto anormal detectado em {monthNameA}. Todas as categorias estão alinhadas à média recente.
                  </div>
                </Card>
              ) : (
                <div className="space-y-2">
                  {comparison?.anomalies.map((anom) => (
                    <Card
                      key={anom.id}
                      className="rounded-2xl p-4 border border-amber-500/30 bg-amber-500/5 shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {/* Exemplo solicitado: "Mercado está 60% acima da média recente." */}
                          <h4 className="font-bold text-xs sm:text-sm text-foreground">
                            {anom.message}
                          </h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            O consumo saltou em relação ao padrão dos últimos meses.
                          </p>
                        </div>
                        <Badge
                          variant="destructive"
                          className="text-[10px] font-bold px-2 py-0.5 bg-amber-500 text-white border-0 shrink-0"
                        >
                          +{anom.diffPercent}%
                        </Badge>
                      </div>

                      {/* Exemplo solicitado: Média Mercado R$ 820 | Este mês R$ 1.310 */}
                      <div className="grid grid-cols-3 gap-2 bg-background/80 rounded-xl p-2.5 border text-center text-xs">
                        <div>
                          <div className="text-[10px] text-muted-foreground">Média {anom.categoryName}</div>
                          <div className="font-semibold text-foreground mt-0.5">
                            {formatBRL(anom.historicalAverage)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Este mês ({monthNameA})</div>
                          <div className="font-bold text-amber-600 mt-0.5">
                            {formatBRL(anom.currentSpent)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Diferença a mais</div>
                          <div className="font-bold text-destructive mt-0.5">
                            +{formatBRL(anom.excessAmount)}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* ── SEÇÃO: POSSÍVEIS TRANSAÇÕES DUPLICADAS ────────────────── */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-lg bg-blue-500/15 text-blue-600 flex items-center justify-center">
                    <Copy className="size-3.5" />
                  </div>
                  <h3 className="font-bold text-xs sm:text-sm">
                    Possíveis Duplicidades ({comparison?.potentialDuplicates.length ?? 0})
                  </h3>
                </div>
                <Badge variant="outline" className="text-[9px] text-muted-foreground">
                  Conferência Segura
                </Badge>
              </div>

              {/* Aviso explícito de segurança: Não excluir nada automaticamente */}
              <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-2.5 text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0" />
                <span>
                  <strong>Aviso:</strong> Nenhuma transação é excluída automaticamente. Revise os lançamentos antes de tomar qualquer ação.
                </span>
              </div>

              {comparison?.potentialDuplicates.length === 0 ? (
                <Card className="rounded-2xl p-4 border border-dashed flex items-center gap-3 bg-muted/20">
                  <CheckCircle2 className="size-5 text-success shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    Nenhuma suspeita de transação duplicada encontrada em {monthNameA}.
                  </div>
                </Card>
              ) : (
                <div className="space-y-2">
                  {comparison?.potentialDuplicates.map((dup) => (
                    <Card
                      key={dup.id}
                      className="rounded-2xl p-3.5 border border-border shadow-sm space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-xs sm:text-sm text-foreground">
                            {dup.description}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {dup.reason}
                          </div>
                        </div>
                        <div className="font-bold text-sm text-destructive shrink-0">
                          {formatBRL(dup.amount)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t text-[11px]">
                        <span className="text-muted-foreground">
                          Datas: {formatDateOnly(dup.dateA)} e {formatDateOnly(dup.dateB)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2 rounded-lg gap-1"
                            onClick={() => setSelectedTxId(dup.transactionB.id)}
                          >
                            <span>Revisar 2ª transação</span>
                            <ExternalLink className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* ── SEÇÃO: COMPARAÇÃO DETALHADA POR CATEGORIAS ────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <PieChart className="size-3.5" />
                  </div>
                  <h3 className="font-bold text-xs sm:text-sm">Comparação por Categorias</h3>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCategoryFilter("all")}
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition ${
                      categoryFilter === "all" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setCategoryFilter("up")}
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition ${
                      categoryFilter === "up" ? "bg-destructive text-white" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Subiram
                  </button>
                  <button
                    onClick={() => setCategoryFilter("down")}
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition ${
                      categoryFilter === "down" ? "bg-success text-white" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Reduziram
                  </button>
                </div>
              </div>

              {filteredCategories.length === 0 ? (
                <Card className="rounded-2xl p-4 text-center border-dashed text-xs text-muted-foreground">
                  Nenhuma categoria correspondente ao filtro.
                </Card>
              ) : (
                <div className="space-y-2">
                  {filteredCategories.map((cat) => {
                    const isUp = cat.diffPercent > 0;
                    const isDown = cat.diffPercent < 0;

                    return (
                      <Card
                        key={cat.categoryId}
                        className="rounded-2xl p-3 border shadow-sm flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="size-3.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.categoryColor }}
                          />
                          <div className="min-w-0">
                            {/* Formato solicitado: Mercado +14%, Combustível -18% */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-xs sm:text-sm truncate">
                                {cat.categoryName}
                              </span>
                              <span
                                className={`text-[11px] font-bold ${
                                  isUp
                                    ? "text-destructive"
                                    : isDown
                                    ? "text-success"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {cat.diffPercentFormatted}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {monthNameA}: {formatBRL(cat.amountA)} · {monthNameB}: {formatBRL(cat.amountB)}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-semibold text-xs sm:text-sm text-foreground">
                            {formatBRL(cat.amountA)}
                          </div>
                          <div
                            className={`text-[10px] font-medium ${
                              cat.diffAmount > 0
                                ? "text-destructive"
                                : cat.diffAmount < 0
                                ? "text-success"
                                : "text-muted-foreground"
                            }`}
                          >
                            {cat.diffAmount > 0 ? "+" : ""}
                            {formatBRL(cat.diffAmount)}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Drawer de Conferência de Transação Duplicada */}
        <TransactionEditDrawer
          transactionId={selectedTxId}
          open={!!selectedTxId}
          onOpenChange={(op) => !op && setSelectedTxId(null)}
        />
      </div>
    </>
  );
}
