import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { usePartner, useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { formatBRL, parseCurrencyInput } from "@/lib/finance";
import { formatDateOnly, getLocalISODate } from "@/lib/date-utils";
import { useNetWorth, useAccountsBalance } from "@/lib/financial-engine";
import {
  savePatrimonyAsset,
  deletePatrimonyAsset,
  fetchPatrimonyEvolution,
  type PatrimonyAssetInput,
  type AssetGoodItem,
} from "@/lib/patrimony";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Landmark,
  PiggyBank,
  Car,
  Home,
  Laptop,
  Gem,
  Package,
  ReceiptText,
  TrendingUp,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ShieldCheck,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/app/financas/patrimonio")({
  head: () => ({
    meta: [
      { title: "Patrimônio Líquido — CASAL" },
      { name: "description", content: "Acompanhe seus ativos, passivos, bens e a evolução do patrimônio líquido do casal." },
    ],
  }),
  component: PatrimonyPage,
});

const assetCategoryLabels: Record<string, { label: string; icon: any }> = {
  vehicle: { label: "Veículo", icon: Car },
  real_estate: { label: "Imóvel", icon: Home },
  electronics: { label: "Eletrônico", icon: Laptop },
  jewelry: { label: "Jóias / Valiosos", icon: Gem },
  other: { label: "Outro bem", icon: Package },
};

function PatrimonyPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const { space } = useSpace();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  const engineOpts = useMemo(
    () => ({ space, userId: user?.id ?? "", coupleId }),
    [space, user?.id, coupleId]
  );

  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetGoodItem | null>(null);
  const [monthsEvolutionRange, setMonthsEvolutionRange] = useState<number>(6);

  const [assetForm, setAssetForm] = useState<PatrimonyAssetInput>({
    name: "",
    category: "vehicle",
    estimated_value: 0,
    acquisition_date: getLocalISODate(),
    acquisition_value: undefined,
    responsible_user_id: user?.id ?? "",
    notes: "",
  });

  const people = useMemo(
    () => [
      { id: user?.id ?? "", name: profile?.full_name || "Você" },
      ...(partner ? [{ id: partner.id, name: partner.full_name || "Parceiro(a)" }] : []),
    ],
    [partner, profile?.full_name, user?.id]
  );

  // 1. Consulta o Patrimônio Líquido Central (motor financeiro)
  const { data: netWorthData, isLoading: isNetWorthLoading } = useNetWorth(engineOpts, !!user?.id);

  // 2. Consulta a Série Temporal de Evolução do Patrimônio
  const evolutionQuery = useQuery({
    queryKey: ["patrimony-evolution", monthsEvolutionRange, space, coupleId, user?.id],
    queryFn: () => fetchPatrimonyEvolution(monthsEvolutionRange, engineOpts),
    enabled: !!user?.id,
  });

  // Mutações: Salvar Bem
  const saveAssetMutation = useMutation({
    mutationFn: async () => {
      if (!assetForm.name.trim()) throw new Error("Informe o nome do bem.");
      if (assetForm.estimated_value <= 0) throw new Error("Informe um valor estimado válido.");
      return await savePatrimonyAsset(
        { ...assetForm, id: editingAsset?.id },
        engineOpts
      );
    },
    onSuccess: () => {
      toast.success(editingAsset ? "Bem atualizado com sucesso" : "Bem cadastrado com sucesso");
      setAssetDialogOpen(false);
      setEditingAsset(null);
      setAssetForm({
        name: "",
        category: "vehicle",
        estimated_value: 0,
        acquisition_date: getLocalISODate(),
        acquisition_value: undefined,
        responsible_user_id: user?.id ?? "",
        notes: "",
      });
      qc.invalidateQueries({ queryKey: ["financial-net-worth"] });
      qc.invalidateQueries({ queryKey: ["patrimony-evolution"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar bem"),
  });

  // Mutações: Excluir Bem
  const deleteAssetMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deletePatrimonyAsset(id, engineOpts);
    },
    onSuccess: () => {
      toast.success("Bem removido do patrimônio");
      qc.invalidateQueries({ queryKey: ["financial-net-worth"] });
      qc.invalidateQueries({ queryKey: ["patrimony-evolution"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir bem"),
  });

  const openNewAsset = () => {
    setEditingAsset(null);
    setAssetForm({
      name: "",
      category: "vehicle",
      estimated_value: 0,
      acquisition_date: getLocalISODate(),
      acquisition_value: undefined,
      responsible_user_id: user?.id ?? "",
      notes: "",
    });
    setAssetDialogOpen(true);
  };

  const openEditAsset = (asset: AssetGoodItem) => {
    setEditingAsset(asset);
    setAssetForm({
      name: asset.name,
      category: asset.category,
      estimated_value: asset.estimatedValue,
      acquisition_date: asset.acquisitionDate || getLocalISODate(),
      acquisition_value: asset.acquisitionValue || undefined,
      responsible_user_id: asset.responsibleUserId || user?.id || "",
      notes: asset.notes || "",
    });
    setAssetDialogOpen(true);
  };

  const accounts = netWorthData?.accountsBalance ?? 0;
  const investments = netWorthData?.investments ?? 0;
  const goods = netWorthData?.goods ?? 0;
  const totalAssets = netWorthData?.totalAssets ?? accounts + investments + goods;
  const debts = netWorthData?.debts ?? 0;
  const netWorth = netWorthData?.netWorth ?? totalAssets - debts;

  return (
    <>
      <PageHeader
        title="Patrimônio"
        subtitle="Ativos, passivos e evolução patrimonial"
        fallbackRoute="/app/financas"
      />

      <div className="px-4 py-4 space-y-4 pb-24 max-w-3xl mx-auto">
        {/* CARD PRINCIPAL DE PATRIMÔNIO LÍQUIDO */}
        <Card className="rounded-3xl p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground font-medium">Patrimônio Líquido</span>
              <div className="text-3xl font-extrabold mt-0.5 text-foreground">
                {isNetWorthLoading ? <Skeleton className="h-9 w-44 rounded-xl" /> : formatBRL(netWorth)}
              </div>
            </div>
            <Badge variant={netWorth >= 0 ? "secondary" : "destructive"} className="text-xs px-2.5 py-1">
              {netWorth >= 0 ? "Patrimônio Positivo" : "Atenção: Passivo Superior"}
            </Badge>
          </div>

          {/* Fórmula canônica visual: Ativos - Passivos */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="rounded-2xl bg-success/10 border border-success/20 p-3.5">
              <div className="flex items-center gap-1.5 text-success mb-1">
                <TrendingUp className="size-4" />
                <span className="text-xs font-semibold">Total de Ativos</span>
              </div>
              <div className="text-xl font-bold text-success">
                {isNetWorthLoading ? <Skeleton className="h-6 w-24 rounded-lg" /> : formatBRL(totalAssets)}
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Contas + Investimentos + Bens
              </span>
            </div>

            <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3.5">
              <div className="flex items-center gap-1.5 text-destructive mb-1">
                <TrendingDown className="size-4" />
                <span className="text-xs font-semibold">Total de Passivos</span>
              </div>
              <div className="text-xl font-bold text-destructive">
                {isNetWorthLoading ? <Skeleton className="h-6 w-24 rounded-lg" /> : formatBRL(debts)}
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                Saldo total de dívidas ativas
              </span>
            </div>
          </div>

          {/* Composição dos Ativos (Contas, Investimentos, Bens) */}
          <div className="grid grid-cols-3 gap-2 text-xs pt-1">
            <div className="p-2.5 rounded-xl bg-muted/50 border">
              <span className="text-[10px] text-muted-foreground block">1. Contas</span>
              <span className="font-semibold text-foreground">{formatBRL(accounts)}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-muted/50 border">
              <span className="text-[10px] text-muted-foreground block">2. Investimentos</span>
              <span className="font-semibold text-foreground">{formatBRL(investments)}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-muted/50 border">
              <span className="text-[10px] text-muted-foreground block">3. Bens</span>
              <span className="font-semibold text-foreground">{formatBRL(goods)}</span>
            </div>
          </div>
        </Card>

        {/* REGRAS DE ISOLAMENTO PATRIMONIAL */}
        <div className="rounded-2xl bg-muted/40 border p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-medium text-foreground block">Integridade do Motor Financeiro</span>
            <span>
              Cartões de crédito pertencem ao fluxo de caixa operacional e não são duplicados como dívida patrimonial.
              Despesas e contas previstas também não reduzem o patrimônio líquido.
            </span>
          </div>
        </div>

        {/* GRÁFICO DE EVOLUÇÃO PATRIMONIAL */}
        <Card className="rounded-3xl p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Evolução do Patrimônio</h3>
              <p className="text-xs text-muted-foreground">Histórico mensal consolidado</p>
            </div>

            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border text-[11px]">
              <button
                onClick={() => setMonthsEvolutionRange(6)}
                className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                  monthsEvolutionRange === 6 ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                6M
              </button>
              <button
                onClick={() => setMonthsEvolutionRange(12)}
                className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                  monthsEvolutionRange === 12 ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                12M
              </button>
            </div>
          </div>

          <div className="h-56 w-full pt-2">
            {evolutionQuery.isLoading ? (
              <Skeleton className="h-full w-full rounded-2xl" />
            ) : (evolutionQuery.data ?? []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Sem histórico de evolução suficiente.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolutionQuery.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradNetWorth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradAssets" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload;
                      return (
                        <div className="rounded-2xl border bg-background/95 backdrop-blur-sm p-3 shadow-lg text-xs space-y-1">
                          <span className="font-semibold block text-foreground">{item.fullMonthLabel}</span>
                          <div className="flex justify-between gap-4 text-primary font-bold">
                            <span>Patrimônio:</span>
                            <span>{formatBRL(item.netWorth)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-success">
                            <span>Ativos:</span>
                            <span>{formatBRL(item.totalAssets)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-destructive">
                            <span>Dívidas:</span>
                            <span>{formatBRL(item.debts)}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalAssets"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#gradAssets)"
                    name="Ativos"
                  />
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#gradNetWorth)"
                    name="Patrimônio Líquido"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* ABAS DE DETALHAMENTO DO PATRIMÔNIO */}
        <Tabs defaultValue="bens" className="space-y-3">
          <TabsList className="grid grid-cols-4 w-full rounded-2xl p-1 h-auto">
            <TabsTrigger value="bens" className="text-xs">Bens ({netWorthData?.assetsList?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="investimentos" className="text-xs">Investimentos</TabsTrigger>
            <TabsTrigger value="contas" className="text-xs">Contas</TabsTrigger>
            <TabsTrigger value="dividas" className="text-xs">Dívidas</TabsTrigger>
          </TabsList>

          {/* ABA 1: BENS CADASTRADOS */}
          <TabsContent value="bens" className="space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Bens e Ativos Materiais</h3>
                <p className="text-xs text-muted-foreground">Veículos, imóveis, eletrônicos e outros bens</p>
              </div>
              <Button size="sm" onClick={openNewAsset} className="rounded-xl text-xs h-8">
                <Plus className="size-3.5 mr-1" />
                Adicionar bem
              </Button>
            </div>

            {(netWorthData?.assetsList ?? []).length === 0 ? (
              <Card className="rounded-2xl p-6 text-center space-y-2 border-dashed">
                <div className="size-10 rounded-xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <Package className="size-5" />
                </div>
                <h4 className="text-sm font-semibold">Nenhum bem cadastrado</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Cadastre veículos, imóveis ou equipamentos para compor o valor real do patrimônio do casal.
                </p>
                <Button size="sm" variant="outline" onClick={openNewAsset} className="rounded-xl text-xs mt-2">
                  <Plus className="size-3.5 mr-1" /> Cadastrar primeiro bem
                </Button>
              </Card>
            ) : (
              <div className="space-y-2">
                {netWorthData!.assetsList.map((asset) => {
                  const catInfo = assetCategoryLabels[asset.category] || assetCategoryLabels.other;
                  const Icon = catInfo.icon;
                  return (
                    <Card key={asset.id} className="rounded-2xl p-3.5 shadow-xs flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate">{asset.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                              {catInfo.label}
                            </Badge>
                          </div>
                          {asset.acquisitionDate && (
                            <span className="text-[11px] text-muted-foreground block">
                              Adquirido em {formatDateOnly(asset.acquisitionDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-sm text-foreground">
                          {formatBRL(asset.estimatedValue)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditAsset(asset)}
                          className="size-8 rounded-lg"
                        >
                          <Pencil className="size-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteAssetMutation.mutate(asset.id)}
                          className="size-8 rounded-lg text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ABA 2: INVESTIMENTOS */}
          <TabsContent value="investimentos" className="space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Investimentos Cadastrados</h3>
                <p className="text-xs text-muted-foreground">Total: {formatBRL(investments)}</p>
              </div>
              <Button asChild size="sm" variant="outline" className="rounded-xl text-xs h-8">
                <Link to="/app/financas/estrutura/investimentos">
                  Gerenciar investimentos <ChevronRight className="size-3.5 ml-1" />
                </Link>
              </Button>
            </div>

            {(netWorthData?.investmentsList ?? []).length === 0 ? (
              <Card className="rounded-2xl p-6 text-center space-y-2 border-dashed">
                <p className="text-xs text-muted-foreground">Nenhum investimento registrado.</p>
                <Button asChild size="sm" variant="outline" className="rounded-xl text-xs">
                  <Link to="/app/financas/estrutura/investimentos">Adicionar investimento</Link>
                </Button>
              </Card>
            ) : (
              <div className="space-y-2">
                {netWorthData!.investmentsList.map((inv) => (
                  <Card key={inv.id} className="rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-sm block truncate">{inv.name}</span>
                      <span className="text-[11px] text-muted-foreground block">
                        {inv.institution} • {inv.investmentType}
                      </span>
                    </div>
                    <span className="font-bold text-sm text-success shrink-0">{formatBRL(inv.amount)}</span>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ABA 3: CONTAS BANCÁRIAS */}
          <TabsContent value="contas" className="space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Contas Bancárias e Carteiras</h3>
                <p className="text-xs text-muted-foreground">Total: {formatBRL(accounts)}</p>
              </div>
              <Button asChild size="sm" variant="outline" className="rounded-xl text-xs h-8">
                <Link to="/app/financas/contas">
                  Ver contas <ChevronRight className="size-3.5 ml-1" />
                </Link>
              </Button>
            </div>

            <Card className="rounded-2xl p-4 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Wallet className="size-4" />
                </div>
                <div>
                  <span className="font-semibold text-xs block">Saldo Líquido em Contas</span>
                  <span className="text-[10px] text-muted-foreground block">Disponível em contas ativas</span>
                </div>
              </div>
              <span className="font-bold text-sm">{formatBRL(accounts)}</span>
            </Card>
          </TabsContent>

          {/* ABA 4: DÍVIDAS / PASSIVOS */}
          <TabsContent value="dividas" className="space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Passivos e Dívidas</h3>
                <p className="text-xs text-muted-foreground">Saldo a quitar: {formatBRL(debts)}</p>
              </div>
              <Button asChild size="sm" variant="outline" className="rounded-xl text-xs h-8">
                <Link to="/app/financas/estrutura/dividas">
                  Plano de quitação <ChevronRight className="size-3.5 ml-1" />
                </Link>
              </Button>
            </div>

            {(netWorthData?.debtsList ?? []).length === 0 ? (
              <Card className="rounded-2xl p-6 text-center space-y-2 border-dashed">
                <p className="text-xs text-success font-medium">Nenhuma dívida cadastrada! Parabéns!</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {netWorthData!.debtsList.map((d) => (
                  <Card key={d.id} className="rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs">
                    <div className="min-w-0">
                      <span className="font-semibold text-sm block truncate">{d.creditor}</span>
                      <span className="text-[11px] text-muted-foreground block">{d.description}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-sm text-destructive block">-{formatBRL(d.currentAmount)}</span>
                      <span className="text-[10px] text-muted-foreground block">de {formatBRL(d.originalAmount)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* DIÁLOGO: CADASTRAR / EDITAR BEM */}
      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-5 text-primary" />
              <span>{editingAsset ? "Editar Bem Cadastrado" : "Cadastrar Bem no Patrimônio"}</span>
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveAssetMutation.mutate();
            }}
            className="space-y-3 py-1 text-xs"
          >
            <div className="space-y-1">
              <Label className="text-xs">Nome do bem *</Label>
              <Input
                placeholder="Ex: Honda Civic 2022, Apartamento Centro..."
                value={assetForm.name}
                onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                required
                className="rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={assetForm.category}
                  onValueChange={(val) => setAssetForm({ ...assetForm, category: val })}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vehicle">Veículo</SelectItem>
                    <SelectItem value="real_estate">Imóvel</SelectItem>
                    <SelectItem value="electronics">Eletrônico</SelectItem>
                    <SelectItem value="jewelry">Jóias / Valiosos</SelectItem>
                    <SelectItem value="other">Outro bem</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Valor estimado atual *</Label>
                <Input
                  type="text"
                  placeholder="R$ 0,00"
                  value={assetForm.estimated_value ? String(assetForm.estimated_value) : ""}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, estimated_value: parseCurrencyInput(e.target.value) })
                  }
                  required
                  className="rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Data de aquisição</Label>
                <Input
                  type="date"
                  value={assetForm.acquisition_date || ""}
                  onChange={(e) => setAssetForm({ ...assetForm, acquisition_date: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Valor pago na compra</Label>
                <Input
                  type="text"
                  placeholder="Opcional"
                  value={assetForm.acquisition_value ? String(assetForm.acquisition_value) : ""}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, acquisition_value: parseCurrencyInput(e.target.value) })
                  }
                  className="rounded-xl text-xs"
                />
              </div>
            </div>

            {people.length > 1 && space === "shared" && (
              <div className="space-y-1">
                <Label className="text-xs">Responsável / Proprietário</Label>
                <Select
                  value={assetForm.responsible_user_id || user?.id}
                  onValueChange={(val) => setAssetForm({ ...assetForm, responsible_user_id: val })}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea
                placeholder="Ex: Tabela FIPE atualizada, quitado, seguro incluso..."
                value={assetForm.notes || ""}
                onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
                className="rounded-xl text-xs resize-none"
                rows={2}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssetDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saveAssetMutation.isPending}
                className="rounded-xl text-xs font-medium"
              >
                {saveAssetMutation.isPending ? "Salvando..." : "Salvar bem"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
