import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import { formatReferenceMonth, formatDateOnly } from "@/lib/date-utils";
import { useFinancialSnapshot } from "@/lib/financial-engine";
import {
  fetchMonthlyClosing,
  fetchMonthlyClosingsHistory,
  fetchMonthGoalsTotal,
  closeMonth,
  reopenMonth,
  computeSavingsRate,
  formatSavingsRate,
  type MonthlyClosingRecord,
} from "@/lib/monthly-closing";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  TrendingUp,
  TrendingDown,
  Sparkles,
  CreditCard,
  ShoppingBag,
  Repeat,
  Target,
  FileSpreadsheet,
  AlertTriangle,
  History,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  PiggyBank,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/financas/fechamento")({
  head: () => ({
    meta: [
      { title: "Fechamento do mês — CASAL" },
      { name: "description", content: "Fotografia financeira mensal, taxa de economia e histórico de fechamentos." },
    ],
  }),
  component: MonthlyClosingPage,
});

function MonthlyClosingPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  // Mês selecionado (inicia no mês atual)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [activeTab, setActiveTab] = useState<"snapshot" | "history">("snapshot");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");

  const refMonthKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}`;
  const engineOpts = useMemo(
    () => ({ space, userId: user?.id ?? "", coupleId }),
    [space, user?.id, coupleId]
  );

  // 1. Consulta o Fechamento Histórico salvo no banco para este mês
  const closingQuery = useQuery({
    queryKey: ["monthly-closing-record", refMonthKey, space, coupleId, user?.id],
    queryFn: () => fetchMonthlyClosing(selectedDate, engineOpts),
    enabled: !!user?.id,
  });

  // 2. Consulta o Histórico Geral de todos os meses
  const historyQuery = useQuery({
    queryKey: ["monthly-closings-history", space, coupleId, user?.id],
    queryFn: () => fetchMonthlyClosingsHistory(engineOpts),
    enabled: !!user?.id,
  });

  // 3. Consulta o Motor Financeiro Central (em tempo real)
  const isMonthClosed = closingQuery.data?.status === "closed";
  const { data: liveSnapshot, isLoading: isSnapshotLoading } = useFinancialSnapshot(
    selectedDate,
    engineOpts,
    !!user?.id && !isMonthClosed
  );

  // 4. Consulta Aportes em Metas do Mês
  const goalsTotalQuery = useQuery({
    queryKey: ["monthly-goals-contributions", refMonthKey, space, coupleId, user?.id],
    queryFn: () => fetchMonthGoalsTotal(selectedDate, engineOpts),
    enabled: !!user?.id && !isMonthClosed,
  });

  // Reconcilia dados: se estiver fechado, usa fotografia histórica congelada; se aberto, usa motor financeiro
  const record = closingQuery.data;
  const isClosed = record?.status === "closed";
  const isReopened = record?.status === "reopened";

  const totalIncome = isClosed
    ? Number(record.total_income || 0)
    : (liveSnapshot?.summary.totalIncome ?? 0);

  const totalExpenses = isClosed
    ? Number(record.total_expenses || 0)
    : (liveSnapshot?.summary.totalExpenses ?? 0);

  const monthlyBalance = isClosed
    ? Number(record.monthly_balance || 0)
    : (liveSnapshot?.summary.monthlyBalance ?? (totalIncome - totalExpenses));

  const savingsRate = isClosed
    ? Number(record.savings_rate || 0)
    : computeSavingsRate(totalIncome, totalExpenses);

  const breakdown = isClosed
    ? record.breakdown
    : {
        fixedExpenses: liveSnapshot?.summary.breakdown.fixedExpenses ?? 0,
        variableExpenses: liveSnapshot?.summary.breakdown.variableExpenses ?? 0,
        cardExpenses: liveSnapshot?.summary.breakdown.cardExpenses ?? 0,
        subscriptions: liveSnapshot?.summary.breakdown.subscriptions ?? 0,
        otherExpenses: liveSnapshot?.summary.breakdown.otherExpenses ?? 0,
        goals: goalsTotalQuery.data ?? 0,
        structuredIncome: liveSnapshot?.summary.breakdown.structuredIncome ?? 0,
        extraIncome: liveSnapshot?.summary.breakdown.extraIncome ?? 0,
      };

  // Mutações: Fechar Mês
  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!liveSnapshot) throw new Error("Aguarde o carregamento do motor financeiro.");
      return await closeMonth({
        refDate: selectedDate,
        opts: engineOpts,
        notes: closeNotes,
        snapshot: liveSnapshot,
        goalsTotal: goalsTotalQuery.data ?? 0,
      });
    },
    onSuccess: () => {
      toast.success(`Mês de ${formatReferenceMonth(refMonthKey)} fechado com sucesso!`);
      setCloseDialogOpen(false);
      setCloseNotes("");
      qc.invalidateQueries({ queryKey: ["monthly-closing-record"] });
      qc.invalidateQueries({ queryKey: ["monthly-closings-history"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao fechar mês");
    },
  });

  // Mutações: Reabrir Mês
  const reopenMutation = useMutation({
    mutationFn: async () => {
      if (!record?.id) throw new Error("Registro de fechamento não encontrado.");
      return await reopenMonth({
        closingId: record.id,
        refMonthStr: record.reference_month,
        opts: engineOpts,
        reason: "Reabertura manual confirmada pelo usuário",
      });
    },
    onSuccess: () => {
      toast.success(`Fechamento de ${formatReferenceMonth(refMonthKey)} reaberto.`);
      setReopenDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["monthly-closing-record"] });
      qc.invalidateQueries({ queryKey: ["monthly-closings-history"] });
      qc.invalidateQueries({ queryKey: ["financial-snapshot"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao reabrir fechamento");
    },
  });

  const nextMonth = () => {
    setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const selectHistoryMonth = (refMonthStr: string) => {
    const parts = refMonthStr.substring(0, 7).split("-").map(Number);
    setSelectedDate(new Date(parts[0], parts[1] - 1, 1));
    setActiveTab("snapshot");
  };

  const isLoading = closingQuery.isLoading || (!isClosed && isSnapshotLoading);

  return (
    <>
      <PageHeader
        title="Fechamento do mês"
        subtitle="Fotografia financeira e histórico consolidado"
        fallbackRoute="/app/financas"
      />

      <div className="px-4 py-4 space-y-4 pb-24 max-w-3xl mx-auto">
        {/* Barra superior de navegação de abas */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex bg-muted/60 p-1 rounded-2xl border text-xs">
            <button
              onClick={() => setActiveTab("snapshot")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all ${
                activeTab === "snapshot"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileSpreadsheet className="size-3.5" />
              <span>Fotografia</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all ${
                activeTab === "history"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="size-3.5" />
              <span>Histórico ({historyQuery.data?.length ?? 0})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link to={"/app/financas/comparacao" as any}>
              <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs gap-1 shadow-none">
                <ArrowLeftRight className="size-3.5 text-primary" />
                <span>Comparar</span>
              </Button>
            </Link>
            <Badge variant={space === "shared" ? "secondary" : "outline"} className="text-xs">
              {space === "shared" ? "Espaço do Casal" : "Meu Espaço"}
            </Badge>
          </div>
        </div>

        {activeTab === "snapshot" && (
          <>
            {/* Seletor de Mês Canônico (Zero 'Invalid Date', Zero '-1 dia') */}
            <div className="flex items-center justify-between bg-card border rounded-2xl p-2 shadow-sm">
              <button
                onClick={prevMonth}
                className="size-9 rounded-xl hover:bg-accent flex items-center justify-center transition-colors"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="size-5" />
              </button>

              <div className="text-center">
                <div className="font-bold text-base capitalize">
                  {formatReferenceMonth(refMonthKey)}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5 mt-0.5">
                  {isClosed ? (
                    <span className="inline-flex items-center gap-1 text-success font-medium">
                      <Lock className="size-3" /> Mês fechado
                    </span>
                  ) : isReopened ? (
                    <span className="inline-flex items-center gap-1 text-blue-500 font-medium">
                      <Unlock className="size-3" /> Reaberto para ajustes
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                      <Clock className="size-3" /> Mês em aberto (ao vivo)
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={nextMonth}
                className="size-9 rounded-xl hover:bg-accent flex items-center justify-center transition-colors"
                aria-label="Próximo mês"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>

            {/* Banner de Status Informativo */}
            {isClosed ? (
              <div className="rounded-2xl bg-success/10 border border-success/30 p-3.5 flex items-start gap-3 text-xs">
                <ShieldCheck className="size-4 text-success shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold text-success block">
                    Fotografia Histórica Congelada
                  </span>
                  <span className="text-muted-foreground block mt-0.5">
                    Este mês foi fechado oficialmente
                    {record?.closed_at ? ` em ${new Date(record.closed_at).toLocaleDateString("pt-BR")} às ${new Date(record.closed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}.
                    Os números refletem o fechamento definitivo.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReopenDialogOpen(true)}
                  className="rounded-xl text-xs h-8 border-success/40 text-success hover:bg-success/20 shrink-0"
                >
                  <Unlock className="size-3.5 mr-1" />
                  Reabrir
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 flex items-start gap-3 text-xs">
                <Sparkles className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold text-amber-600 dark:text-amber-400 block">
                    Fotografia Prévia em Tempo Real
                  </span>
                  <span className="text-muted-foreground block mt-0.5">
                    Os valores abaixo estão sendo calculados dinamicamente pelo Motor Financeiro Central.
                    Ao finalizar o mês, feche o período para congelar o snapshot oficial.
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setCloseDialogOpen(true)}
                  disabled={isLoading}
                  className="rounded-xl text-xs h-8 bg-amber-500 hover:bg-amber-600 text-white shrink-0 font-medium"
                >
                  <CalendarCheck className="size-3.5 mr-1" />
                  Fechar mês
                </Button>
              </div>
            )}

            {/* CARD PRINCIPAL COM OS 4 INDICADORES (CONFORME SOLICITADO PELO USUÁRIO) */}
            <Card className="rounded-3xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <span className="text-xs text-muted-foreground block">Fotografia do Período</span>
                  <h2 className="text-xl font-bold capitalize">
                    {formatReferenceMonth(refMonthKey)}
                  </h2>
                </div>
                {isClosed ? (
                  <Badge className="bg-success text-white hover:bg-success">
                    <CheckCircle2 className="size-3 mr-1" /> Fechado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    <Clock className="size-3 mr-1" /> Em aberto
                  </Badge>
                )}
              </div>

              {isLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-8 w-48 rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-2xl" />
                </div>
              ) : (
                <>
                  {/* Grid de Métricas Principais */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Receitas Realizadas */}
                    <div className="rounded-2xl bg-success/10 border border-success/20 p-3.5">
                      <div className="flex items-center gap-1.5 text-success mb-1">
                        <TrendingUp className="size-4" />
                        <span className="text-xs font-semibold">Receitas realizadas</span>
                      </div>
                      <div className="text-xl font-bold text-success">
                        {formatBRL(totalIncome)}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        Estruturais + extras
                      </span>
                    </div>

                    {/* Despesas Realizadas */}
                    <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3.5">
                      <div className="flex items-center gap-1.5 text-destructive mb-1">
                        <TrendingDown className="size-4" />
                        <span className="text-xs font-semibold">Despesas realizadas</span>
                      </div>
                      <div className="text-xl font-bold text-destructive">
                        {formatBRL(totalExpenses)}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        Fixas, cartões e contas
                      </span>
                    </div>

                    {/* Resultado do Mês */}
                    <div className="rounded-2xl bg-muted/60 border p-3.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                        <CalendarCheck className="size-4" />
                        <span className="text-xs font-semibold">Resultado do mês</span>
                      </div>
                      <div
                        className={`text-xl font-bold ${
                          monthlyBalance >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {formatBRL(monthlyBalance)}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        Receitas − Despesas
                      </span>
                    </div>

                    {/* Taxa de Economia */}
                    <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-3.5">
                      <div className="flex items-center gap-1.5 text-blue-500 mb-1">
                        <PiggyBank className="size-4" />
                        <span className="text-xs font-semibold">Taxa de economia</span>
                      </div>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {formatSavingsRate(savingsRate)}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        Poupado do total
                      </span>
                    </div>
                  </div>

                  {/* Barra Visual da Taxa de Economia */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Eficiência da Poupança</span>
                      <span className="font-semibold text-foreground">
                        {formatSavingsRate(savingsRate)}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          savingsRate >= 20
                            ? "bg-success"
                            : savingsRate > 0
                            ? "bg-amber-500"
                            : "bg-muted-foreground/30"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, savingsRate))}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* DETALHAMENTO COMPLETO (EXIGIDO PELO USUÁRIO) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Layers className="size-4 text-muted-foreground" />
                  <span>Detalhamento das despesas</span>
                </h3>
                <span className="text-xs text-muted-foreground">Classificação do motor</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Fixas */}
                <DetailRow
                  icon={Calendar}
                  label="Despesas Fixas"
                  sublabel="Aluguel, luz, condomínio, etc."
                  amount={breakdown?.fixedExpenses ?? 0}
                  tone="destructive"
                />

                {/* Variáveis */}
                <DetailRow
                  icon={ShoppingBag}
                  label="Despesas Variáveis"
                  sublabel="Mercado, combustível, farmácia..."
                  amount={breakdown?.variableExpenses ?? 0}
                  tone="destructive"
                />

                {/* Cartões */}
                <DetailRow
                  icon={CreditCard}
                  label="Cartões de Crédito"
                  sublabel="Faturas do mês de referência"
                  amount={breakdown?.cardExpenses ?? 0}
                  tone="destructive"
                />

                {/* Assinaturas */}
                <DetailRow
                  icon={Repeat}
                  label="Assinaturas"
                  sublabel="Serviços recorrentes ativos"
                  amount={breakdown?.subscriptions ?? 0}
                  tone="destructive"
                />

                {/* Outras despesas */}
                <DetailRow
                  icon={TrendingDown}
                  label="Outras despesas"
                  sublabel="Gastos avulsos em conta/Pix"
                  amount={breakdown?.otherExpenses ?? 0}
                  tone="destructive"
                />

                {/* Metas / Aportes */}
                <DetailRow
                  icon={Target}
                  label="Metas Financeiras"
                  sublabel="Aportes realizados no período"
                  amount={breakdown?.goals ?? 0}
                  tone="blue"
                />
              </div>
            </div>

            {/* Detalhamento de Receitas */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <TrendingUp className="size-4 text-success" />
                  <span>Detalhamento das receitas</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <DetailRow
                  icon={TrendingUp}
                  label="Receitas Estruturais"
                  sublabel="Salário, pro-labore, fixas"
                  amount={breakdown?.structuredIncome ?? 0}
                  tone="success"
                />
                <DetailRow
                  icon={ArrowUpRight}
                  label="Receitas Avulsas / Extras"
                  sublabel="Vendas, bônus, rendimentos extras"
                  amount={breakdown?.extraIncome ?? 0}
                  tone="success"
                />
              </div>
            </div>

            {/* Ações inferiores de Fechamento */}
            <div className="pt-4 flex flex-col sm:flex-row gap-2.5">
              {!isClosed ? (
                <Button
                  onClick={() => setCloseDialogOpen(true)}
                  disabled={isLoading}
                  className="w-full rounded-2xl h-12 bg-success hover:bg-success/90 text-white font-semibold text-sm shadow-sm"
                >
                  <CalendarCheck className="size-4 mr-2" />
                  Fechar mês de {formatReferenceMonth(refMonthKey)}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setReopenDialogOpen(true)}
                  className="w-full rounded-2xl h-12 border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold text-sm"
                >
                  <Unlock className="size-4 mr-2" />
                  Reabrir fechamento de {formatReferenceMonth(refMonthKey)}
                </Button>
              )}
            </div>
          </>
        )}

        {/* ABA HISTÓRICO */}
        {activeTab === "history" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">Histórico de Fechamentos</h3>
                <p className="text-xs text-muted-foreground">
                  Navegue pelos snapshots congelados e meses registrados
                </p>
              </div>
            </div>

            {historyQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ) : (historyQuery.data ?? []).length === 0 ? (
              <Card className="rounded-3xl p-8 text-center space-y-3 shadow-card">
                <div className="size-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <History className="size-6" />
                </div>
                <h4 className="font-semibold text-base">Nenhum mês fechado ainda</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Ao final do mês atual, clique em "Fechar mês" para gerar a primeira fotografia financeira oficial do casal.
                </p>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("snapshot")}
                  className="rounded-xl mt-2"
                >
                  Ir para fotografia atual
                </Button>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {historyQuery.data!.map((item) => {
                  const itemIsClosed = item.status === "closed";
                  const itemBalance = Number(item.monthly_balance || 0);
                  const itemRate = Number(item.savings_rate || 0);

                  return (
                    <Card
                      key={item.id}
                      onClick={() => selectHistoryMonth(item.reference_month)}
                      className="rounded-2xl p-4 shadow-sm hover:border-primary/50 transition-all cursor-pointer space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm capitalize">
                            {formatReferenceMonth(item.reference_month)}
                          </span>
                          {itemIsClosed ? (
                            <Badge className="bg-success text-white text-[10px] px-2 py-0">
                              <Lock className="size-2.5 mr-1" /> Fechado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-blue-500 text-blue-500 text-[10px] px-2 py-0">
                              <Unlock className="size-2.5 mr-1" /> Reaberto
                            </Badge>
                          )}
                        </div>

                        <span className="text-xs font-bold text-foreground">
                          {formatSavingsRate(itemRate)} economia
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Receitas</span>
                          <span className="font-medium text-success">
                            {formatBRL(Number(item.total_income))}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Despesas</span>
                          <span className="font-medium text-destructive">
                            {formatBRL(Number(item.total_expenses))}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Resultado</span>
                          <span
                            className={`font-semibold ${
                              itemBalance >= 0 ? "text-success" : "text-destructive"
                            }`}
                          >
                            {formatBRL(itemBalance)}
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DIÁLOGO: FECHAR MÊS */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="size-5 text-success" />
              <span>Fechar mês de {formatReferenceMonth(refMonthKey)}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              O fechamento gera um snapshot histórico definitivo deste período.
              Nenhuma transação existente será modificada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-2xl bg-muted/50 p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Receitas consolidadas:</span>
                <b className="text-success">{formatBRL(totalIncome)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Despesas consolidadas:</span>
                <b className="text-destructive">{formatBRL(totalExpenses)}</b>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Resultado final:</span>
                <span className={monthlyBalance >= 0 ? "text-success" : "text-destructive"}>
                  {formatBRL(monthlyBalance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa de economia:</span>
                <b className="text-blue-500">{formatSavingsRate(savingsRate)}</b>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-muted-foreground">
                Observações do mês (opcional):
              </label>
              <Textarea
                placeholder="Ex: Mês com despesas extras de viagem, reserva mantida intacta..."
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="rounded-2xl text-xs resize-none"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCloseDialogOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
              className="rounded-xl bg-success hover:bg-success/90 text-white font-medium"
            >
              {closeMutation.isPending ? "Fechando..." : "Confirmar e fechar mês"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: REABRIR FECHAMENTO (SOMENTE COM CONFIRMAÇÃO) */}
      <AlertDialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <AlertDialogContent className="rounded-3xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              <span>Reabrir fechamento do mês?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Você está prestes a reabrir o mês de <b>{formatReferenceMonth(refMonthKey)}</b>.
              Ao reabrir, os números voltarão a ser recalculados dinamicamente com base nas transações atuais do motor financeiro.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
              className="rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {reopenMutation.isPending ? "Reabrindo..." : "Sim, reabrir fechamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  sublabel,
  amount,
  tone,
}: {
  icon: any;
  label: string;
  sublabel: string;
  amount: number;
  tone: "destructive" | "success" | "blue";
}) {
  const colorMap = {
    destructive: "text-destructive bg-destructive/10 border-destructive/20",
    success: "text-success bg-success/10 border-success/20",
    blue: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  };

  return (
    <div className="rounded-2xl border bg-card p-3 flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`size-8 rounded-xl flex items-center justify-center shrink-0 border ${colorMap[tone]}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-xs block truncate">{label}</span>
          <span className="text-[10px] text-muted-foreground block truncate">{sublabel}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className={`font-bold text-sm ${tone === "success" ? "text-success" : tone === "blue" ? "text-blue-600 dark:text-blue-400" : ""}`}>
          {formatBRL(amount)}
        </span>
      </div>
    </div>
  );
}
