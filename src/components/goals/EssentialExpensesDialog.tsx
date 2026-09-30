import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatBRL } from "@/lib/finance";
import {
  EssentialExpensesSummary,
  EssentialExpenseItem,
  toggleExpenseEssentialStatus,
} from "@/lib/emergency-fund";
import { toast } from "sonner";
import {
  ShieldAlert,
  Home,
  ShoppingCart,
  Tv,
  CheckCircle2,
  Info,
  DollarSign,
} from "lucide-react";

interface EssentialExpensesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: EssentialExpensesSummary;
  onUpdated: () => void;
}

export function EssentialExpensesDialog({
  open,
  onOpenChange,
  summary,
  onUpdated,
}: EssentialExpensesDialogProps) {
  const [activeTab, setActiveTab] = useState<"fixed" | "variable" | "subs">("fixed");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Estados locais para atualização otimista imediata
  const [itemsState, setItemsState] = useState<Record<string, boolean>>({});

  // Mescla o estado com a prop summary
  const getStatus = (item: EssentialExpenseItem) => {
    if (itemsState[item.id] !== undefined) return itemsState[item.id];
    return item.isEssential;
  };

  const handleToggle = async (item: EssentialExpenseItem) => {
    const current = getStatus(item);
    const next = !current;

    // Atualiza otimista
    setItemsState((prev) => ({ ...prev, [item.id]: next }));
    setLoadingId(item.id);

    try {
      await toggleExpenseEssentialStatus({
        id: item.id,
        type: item.type,
        isEssential: next,
      });
      toast.success(
        next
          ? `"${item.title}" marcada como essencial`
          : `"${item.title}" removida do custo essencial`
      );
      onUpdated();
    } catch (err: any) {
      // Reverte otimista
      setItemsState((prev) => ({ ...prev, [item.id]: current }));
      toast.error(err?.message || "Erro ao salvar alteração");
    } finally {
      setLoadingId(null);
    }
  };

  // Totais computados dinamicamente
  const computedFixedTotal = useMemo(() => {
    return summary.fixedList.reduce((sum, item) => {
      return getStatus(item) ? sum + item.monthlyAmount : sum;
    }, 0);
  }, [summary.fixedList, itemsState]);

  const computedVariableTotal = useMemo(() => {
    return summary.variableList.reduce((sum, item) => {
      return getStatus(item) ? sum + item.monthlyAmount : sum;
    }, 0);
  }, [summary.variableList, itemsState]);

  const computedSubsTotal = useMemo(() => {
    return summary.subscriptionsList.reduce((sum, item) => {
      return getStatus(item) ? sum + item.monthlyAmount : sum;
    }, 0);
  }, [summary.subscriptionsList, itemsState]);

  const totalMonthlyEssential =
    Math.round((computedFixedTotal + computedVariableTotal + computedSubsTotal) * 100) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl p-5 sm:p-6 max-h-[90vh] flex flex-col">
        <DialogHeader className="text-left shrink-0">
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <ShieldAlert className="size-4" />
            <span>Configuração da Reserva</span>
          </div>
          <DialogTitle className="text-xl font-bold">
            Despesas Essenciais Mensais
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Marque os gastos indispensáveis para a sobrevivência básica do casal em caso de crise ou perda de renda.
          </DialogDescription>
        </DialogHeader>

        {/* Card de Resumo do Custo Essencial */}
        <div className="p-4 rounded-2xl bg-muted/50 border border-border/60 shrink-0 my-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">
              Custo essencial mensal do casal:
            </span>
            <span className="text-xl font-extrabold text-foreground">
              {formatBRL(totalMonthlyEssential)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-[11px]">
            <div>
              <span className="text-muted-foreground block">Fixas:</span>
              <span className="font-semibold text-foreground">
                {formatBRL(computedFixedTotal)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Variáveis:</span>
              <span className="font-semibold text-foreground">
                {formatBRL(computedVariableTotal)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Assinaturas:</span>
              <span className="font-semibold text-foreground">
                {formatBRL(computedSubsTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Abas das Categorias de Despesas */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid grid-cols-3 rounded-2xl bg-muted/60 p-1 h-10 shrink-0">
            <TabsTrigger value="fixed" className="rounded-xl text-xs flex items-center gap-1.5">
              <Home className="size-3.5" />
              <span>Fixas ({summary.fixedList.length})</span>
            </TabsTrigger>
            <TabsTrigger value="variable" className="rounded-xl text-xs flex items-center gap-1.5">
              <ShoppingCart className="size-3.5" />
              <span>Variáveis ({summary.variableList.length})</span>
            </TabsTrigger>
            <TabsTrigger value="subs" className="rounded-xl text-xs flex items-center gap-1.5">
              <Tv className="size-3.5" />
              <span>Assinaturas ({summary.subscriptionsList.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Conteúdo rolável */}
          <div className="flex-1 overflow-y-auto pr-1 mt-3 space-y-2">
            {/* 1. Despesas Fixas */}
            <TabsContent value="fixed" className="mt-0 space-y-2">
              {summary.fixedList.length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-6">
                  Nenhuma despesa fixa cadastrada na estrutura financeira.
                </p>
              ) : (
                summary.fixedList.map((item) => {
                  const isChecked = getStatus(item);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isChecked
                          ? "bg-primary/[0.04] border-primary/30"
                          : "bg-card border-border/60 opacity-60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate text-foreground">
                            {item.title}
                          </span>
                          {item.categoryName && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                              {item.categoryName}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatBRL(item.monthlyAmount)} / mês
                        </span>
                      </div>

                      <Switch
                        checked={isChecked}
                        onCheckedChange={() => handleToggle(item)}
                        disabled={loadingId === item.id}
                      />
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* 2. Despesas Variáveis */}
            <TabsContent value="variable" className="mt-0 space-y-2">
              {summary.variableList.length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-6">
                  Nenhuma despesa variável configurada na estrutura financeira.
                </p>
              ) : (
                summary.variableList.map((item) => {
                  const isChecked = getStatus(item);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isChecked
                          ? "bg-primary/[0.04] border-primary/30"
                          : "bg-card border-border/60 opacity-60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate text-foreground">
                            {item.title}
                          </span>
                          {item.categoryName && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                              {item.categoryName}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatBRL(item.monthlyAmount)} estimado / mês
                        </span>
                      </div>

                      <Switch
                        checked={isChecked}
                        onCheckedChange={() => handleToggle(item)}
                        disabled={loadingId === item.id}
                      />
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* 3. Assinaturas */}
            <TabsContent value="subs" className="mt-0 space-y-2">
              <div className="p-2.5 rounded-xl bg-muted/40 text-[11px] text-muted-foreground flex items-start gap-2 mb-2">
                <Info className="size-3.5 text-primary shrink-0 mt-0.5" />
                <span>
                  Normalmente serviços de entretenimento (streaming, jogos) são cortados em uma crise. Marque apenas assinaturas estritamente vitais (como planos de saúde ou seguros).
                </span>
              </div>

              {summary.subscriptionsList.length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-6">
                  Nenhuma assinatura ativa encontrada.
                </p>
              ) : (
                summary.subscriptionsList.map((item) => {
                  const isChecked = getStatus(item);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isChecked
                          ? "bg-primary/[0.04] border-primary/30"
                          : "bg-card border-border/60 opacity-60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold truncate text-foreground block">
                          {item.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatBRL(item.monthlyAmount)} / mês
                        </span>
                      </div>

                      <Switch
                        checked={isChecked}
                        onCheckedChange={() => handleToggle(item)}
                        disabled={loadingId === item.id}
                      />
                    </div>
                  );
                })
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-3 shrink-0">
          <Button
            className="w-full rounded-xl gradient-coral text-white border-0 h-11 font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Concluir Ajustes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
