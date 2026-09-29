import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePartner, useProfile } from "@/lib/hooks";
import { applySpaceFilter, useSpace } from "@/lib/space";
import { buildSummary, fetchSubscriptions } from "@/lib/subscriptions";
import { formatBRL, monthlyAmount, planningFrequencyLabel } from "@/lib/finance";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUpCircle,
  CalendarClock,
  ChevronRight,
  Landmark,
  MoreVertical,
  Pencil,
  PiggyBank,
  Plus,
  Power,
  ReceiptText,
  ShoppingBag,
  Trash2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/financas/estrutura/")({
  head: () => ({
    meta: [
      { title: "Estrutura financeira — CASAL" },
      { name: "description", content: "Organize receitas previstas, despesas fixas, variáveis, investimentos e dívidas do casal." },
      { property: "og:title", content: "Estrutura financeira — CASAL" },
      { property: "og:description", content: "Organize receitas previstas, despesas fixas, variáveis, investimentos e dívidas do casal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancialStructure,
});

const incomeTypes: Record<string, string> = {
  salary: "Salário",
  scholarship: "Bolsa",
  freelance: "Freelance",
  benefit: "Benefício",
  commission: "Comissão",
  extra: "Renda extra",
  other: "Outro",
};

const paymentMethods: Record<string, string> = {
  pix: "Pix",
  debit: "Débito",
  bank_account: "Conta bancária",
  credit_card: "Cartão de crédito",
  boleto: "Boleto",
  cash: "Dinheiro",
  other: "Outro",
};

function FinancialStructure() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const { space } = useSpace();
  const coupleId = profile?.couple_id ?? null;
  const opts = { space, userId: user?.id ?? "", coupleId };
  const qc = useQueryClient();

  const [incomeOpen, setIncomeOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [variableOpen, setVariableOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<any>(null);
  const [editingBill, setEditingBill] = useState<any>(null);
  const [editingVariable, setEditingVariable] = useState<any>(null);

  // Receitas previstas
  const incomes = useQuery({
    queryKey: ["income-sources", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("income_sources").select("*").order("name");
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Despesas fixas
  const bills = useQuery({
    queryKey: ["fixed-bills", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("future_bills").select("*, categories(name,color)").order("due_date");
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Despesas variáveis (aba própria e independente)
  const variableExpenses = useQuery({
    queryKey: ["variable-expenses", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase
        .from("variable_expenses")
        .select("*, categories!variable_expenses_category_id_fkey(id,name,color,icon), subcategories:categories!variable_expenses_subcategory_id_fkey(id,name)")
        .order("name");
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Categorias de despesas
  const categories = useQuery({
    queryKey: ["structure-categories", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase
        .from("categories")
        .select("id,name,color,type")
        .eq("type", "expense")
        .is("parent_id", null)
        .eq("is_archived", false)
        .order("name");
      if (coupleId) {
        q = q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`);
      } else {
        q = q.eq("user_id", user!.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Assinaturas ativas
  const subscriptions = useQuery({
    queryKey: ["structure-subscriptions", space, coupleId, user?.id],
    queryFn: async () => buildSummary(await fetchSubscriptions(opts)),
    enabled: !!user,
  });

  // Planejamento atual (utilizado apenas para compor reserva/metas na aba Resumo)
  const currentPlan = useQuery({
    queryKey: ["structure-plan", space, coupleId, user?.id],
    queryFn: async () => {
      const ref = new Date();
      const month = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-01`;
      let q: any = supabase
        .from("monthly_financial_plans")
        .select("*, monthly_budget_allocations(*, categories(name,color))")
        .eq("reference_month", month)
        .eq("status", "active");
      q = applySpaceFilter(q, opts);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });

  // Totais previstos
  const plannedIncome = useMemo(
    () => (incomes.data ?? []).filter((x: any) => x.is_active).reduce((s: number, x: any) => s + monthlyAmount(x.amount, x.frequency), 0),
    [incomes.data]
  );
  const fixedBills = useMemo(
    () => (bills.data ?? []).filter((x: any) => x.is_active && x.recurrence !== "once").reduce((s: number, x: any) => s + monthlyAmount(x.amount, x.recurrence), 0),
    [bills.data]
  );
  const variableTotal = useMemo(
    () => (variableExpenses.data ?? []).filter((x: any) => x.is_active).reduce((s: number, x: any) => s + Number(x.estimated_amount || 0), 0),
    [variableExpenses.data]
  );

  const fixedTotal = fixedBills + (subscriptions.data?.monthlyTotal ?? 0);
  const monthlyEstimatedBalance = plannedIncome - fixedTotal - variableTotal;
  const available = monthlyEstimatedBalance - Number(currentPlan.data?.planned_reserve ?? 0) - Number(currentPlan.data?.planned_goals ?? 0);

  const people = [
    { id: user?.id ?? "", name: profile?.full_name || "Você" },
    ...(partner ? [{ id: partner.id, name: partner.full_name || "Parceiro(a)" }] : []),
  ];

  // Mutações CRUD
  const remove = useMutation({
    mutationFn: async ({ table, id }: { table: "income_sources" | "future_bills" | "variable_expenses"; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      const key = vars.table === "income_sources" ? "income-sources" : vars.table === "future_bills" ? "fixed-bills" : "variable-expenses";
      qc.invalidateQueries({ queryKey: [key] });
      qc.invalidateQueries({ queryKey: ["variable-expenses-projecao"] });
      qc.invalidateQueries({ queryKey: ["structure-plan"] });
      qc.invalidateQueries({ queryKey: ["tx-projecao"] });
      toast.success("Item excluído com sucesso");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = async (table: "income_sources" | "future_bills" | "variable_expenses", id: string, value: boolean) => {
    const { error } = await supabase.from(table).update({ is_active: value }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      const key = table === "income_sources" ? "income-sources" : table === "future_bills" ? "fixed-bills" : "variable-expenses";
      qc.invalidateQueries({ queryKey: [key] });
      qc.invalidateQueries({ queryKey: ["variable-expenses-projecao"] });
      qc.invalidateQueries({ queryKey: ["structure-plan"] });
      qc.invalidateQueries({ queryKey: ["tx-projecao"] });
    }
  };

  const loading = incomes.isLoading || bills.isLoading || subscriptions.isLoading || variableExpenses.isLoading;

  return (
    <>
      <PageHeader title="Estrutura financeira" subtitle="Planejamento previsto do casal" fallbackRoute="/app/financas" />
      <div className="px-4 py-4 space-y-4 pb-24 max-w-3xl mx-auto">
        <Card className="rounded-3xl p-5 shadow-card">
          <div className="text-xs text-muted-foreground">Disponível após compromissos planejados</div>
          <div className={`text-3xl font-bold mt-1 ${available < 0 ? "text-destructive" : "text-success"}`}>
            {loading ? "—" : formatBRL(available)}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
            <SummaryBox label="Receitas" value={plannedIncome} tone="success" />
            <SummaryBox label="Fixas" value={fixedTotal} tone="danger" />
            <SummaryBox label="Variáveis" value={variableTotal} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Previsão mensal da estrutura financeira. Gastos reais continuam no resumo e extrato principal.
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="h-auto justify-start gap-3 rounded-2xl p-4 text-left">
            <Link to="/app/financas/estrutura/investimentos">
              <Landmark className="size-5 shrink-0 text-success" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Investimentos</span>
                <span className="block text-[11px] font-normal text-muted-foreground">Acompanhamento manual</span>
              </span>
              <ChevronRight className="size-4 shrink-0" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start gap-3 rounded-2xl p-4 text-left">
            <Link to="/app/financas/estrutura/dividas">
              <ReceiptText className="size-5 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Dívidas</span>
                <span className="block text-[11px] font-normal text-muted-foreground">Plano para quitar</span>
              </span>
              <ChevronRight className="size-4 shrink-0" />
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="summary">
          <TabsList className="grid grid-cols-4 w-full h-auto rounded-2xl p-1">
            <TabsTrigger value="summary" className="text-xs">Resumo</TabsTrigger>
            <TabsTrigger value="income" className="text-xs">Receitas</TabsTrigger>
            <TabsTrigger value="fixed" className="text-xs">Fixas</TabsTrigger>
            <TabsTrigger value="variable" className="text-xs">Variáveis</TabsTrigger>
          </TabsList>

          {/* ABA RESUMO */}
          <TabsContent value="summary" className="space-y-3 mt-3">
            <PlanRow icon={ArrowUpCircle} label="Receitas previstas" value={plannedIncome} color="text-success" />
            <PlanRow icon={CalendarClock} label="Contas fixas" value={fixedBills} color="text-destructive" />
            <PlanRow icon={ShoppingBag} label="Despesas variáveis previstas" value={variableTotal} color="text-destructive" />
            <PlanRow
              icon={WalletCards}
              label={`Assinaturas (${subscriptions.data?.activeCount ?? 0})`}
              value={subscriptions.data?.monthlyTotal ?? 0}
              color="text-destructive"
            />
            <PlanRow
              icon={PiggyBank}
              label="Reserva e metas"
              value={Number(currentPlan.data?.planned_reserve ?? 0) + Number(currentPlan.data?.planned_goals ?? 0)}
            />

            <Card className="rounded-2xl p-4 flex items-center justify-between border-primary/20 bg-primary/5 mt-3">
              <div>
                <div className="text-sm font-semibold">Saldo previsto mensal</div>
                <div className="text-[11px] text-muted-foreground">Receitas - Fixas - Variáveis - Assinaturas</div>
              </div>
              <b className={`text-base font-bold ${monthlyEstimatedBalance < 0 ? "text-destructive" : "text-success"}`}>
                {formatBRL(monthlyEstimatedBalance)}
              </b>
            </Card>
          </TabsContent>

          {/* ABA RECEITAS */}
          <TabsContent value="income" className="space-y-3 mt-3">
            <Button
              className="w-full rounded-2xl"
              onClick={() => {
                setEditingIncome(null);
                setIncomeOpen(true);
              }}
            >
              <Plus className="size-4 mr-1" /> Nova fonte de receita
            </Button>
            {incomes.isLoading ? (
              <Skeleton className="h-24 rounded-2xl" />
            ) : (incomes.data ?? []).length === 0 ? (
              <Card className="p-4 rounded-2xl">
                <EmptyState icon={ArrowUpCircle} title="Sem receitas previstas" description="Cadastre salários e outras fontes recorrentes." />
              </Card>
            ) : (
              (incomes.data ?? []).map((x: any) => (
                <ItemCard
                  key={x.id}
                  title={x.name}
                  subtitle={`${incomeTypes[x.income_type]} · ${planningFrequencyLabel(x.frequency)} · ${
                    people.find((p) => p.id === x.responsible_user_id)?.name ?? "Responsável"
                  }`}
                  value={monthlyAmount(x.amount, x.frequency)}
                  active={x.is_active}
                  onToggle={(v: boolean) => toggle("income_sources", x.id, v)}
                  onEdit={() => {
                    setEditingIncome(x);
                    setIncomeOpen(true);
                  }}
                  onDelete={() => confirm("Excluir esta fonte de receita?") && remove.mutate({ table: "income_sources", id: x.id })}
                />
              ))
            )}
          </TabsContent>

          {/* ABA FIXAS */}
          <TabsContent value="fixed" className="space-y-3 mt-3">
            <Button
              className="w-full rounded-2xl"
              onClick={() => {
                setEditingBill(null);
                setBillOpen(true);
              }}
            >
              <Plus className="size-4 mr-1" /> Nova despesa fixa
            </Button>
            {(bills.data ?? []).map((x: any) => (
              <ItemCard
                key={x.id}
                title={x.title}
                subtitle={`${x.categories?.name ?? "Sem categoria"} · ${planningFrequencyLabel(x.recurrence)} · vence dia ${new Date(
                  x.due_date + "T12:00:00"
                ).getDate()}`}
                value={monthlyAmount(x.amount, x.recurrence)}
                active={x.is_active}
                onToggle={(v: boolean) => toggle("future_bills", x.id, v)}
                onEdit={() => {
                  setEditingBill(x);
                  setBillOpen(true);
                }}
                onDelete={() => confirm("Excluir esta despesa fixa?") && remove.mutate({ table: "future_bills", id: x.id })}
              />
            ))}
            <Card className="rounded-2xl p-4 flex justify-between">
              <div>
                <div className="text-sm font-medium">Assinaturas ativas</div>
                <div className="text-xs text-muted-foreground">Gerenciadas no módulo de assinaturas</div>
              </div>
              <div className="text-right font-semibold">
                {formatBRL(subscriptions.data?.monthlyTotal ?? 0)}
                <div>
                  <Link to="/app/financas/assinaturas" className="text-xs text-primary">
                    Gerenciar
                  </Link>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ABA VARIÁVEIS (DEDICADA E INDEPENDENTE) */}
          <TabsContent value="variable" className="mt-3">
            <VariableExpensesSection
              variableExpenses={variableExpenses}
              variableTotal={variableTotal}
              loading={variableExpenses.isLoading}
              onAdd={() => {
                setEditingVariable(null);
                setVariableOpen(true);
              }}
              onEdit={(item: any) => {
                setEditingVariable(item);
                setVariableOpen(true);
              }}
              onToggle={(id: string, val: boolean) => toggle("variable_expenses", id, val)}
              onDelete={(id: string) => remove.mutate({ table: "variable_expenses", id })}
            />
          </TabsContent>
        </Tabs>
      </div>

      <IncomeDialog open={incomeOpen} onOpenChange={setIncomeOpen} item={editingIncome} people={people} opts={opts} />
      <BillDialog open={billOpen} onOpenChange={setBillOpen} item={editingBill} people={people} categories={categories.data ?? []} opts={opts} />
      <VariableExpenseDialog
        open={variableOpen}
        onOpenChange={setVariableOpen}
        item={editingVariable}
        categories={categories.data ?? []}
        opts={opts}
      />
    </>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-accent/60 rounded-xl p-2">
      <div className="text-muted-foreground">{label}</div>
      <b className={tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : ""}>
        {formatBRL(value)}
      </b>
    </div>
  );
}

function PlanRow({ icon: Icon, label, value, color = "text-primary" }: any) {
  return (
    <Card className="rounded-2xl p-4 flex items-center gap-3">
      <Icon className={`size-5 ${color}`} />
      <span className="flex-1 text-sm">{label}</span>
      <b className="text-sm">{formatBRL(value)}</b>
    </Card>
  );
}

function ItemCard({ title, subtitle, value, active, onToggle, onEdit, onDelete }: any) {
  return (
    <Card className={`rounded-2xl p-4 ${!active ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onToggle(!active)}
          className={`size-3 rounded-full ${active ? "bg-success" : "bg-muted-foreground"}`}
          aria-label={active ? "Desativar" : "Ativar"}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
        <b className="text-sm">{formatBRL(value)}/mês</b>
        <button type="button" onClick={onEdit} aria-label="Editar">
          <Pencil className="size-4" />
        </button>
        <button type="button" onClick={onDelete} className="text-destructive" aria-label="Excluir">
          <Trash2 className="size-4" />
        </button>
      </div>
    </Card>
  );
}

/**
 * Componente dedicado para gerenciamento de despesas variáveis na estrutura financeira
 */
function VariableExpensesSection({
  variableExpenses,
  variableTotal,
  loading,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  variableExpenses: any;
  variableTotal: number;
  loading: boolean;
  onAdd: () => void;
  onEdit: (item: any) => void;
  onToggle: (id: string, value: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const items = variableExpenses.data ?? [];

  return (
    <div className="space-y-3">
      <Button className="w-full rounded-2xl" onClick={onAdd}>
        <Plus className="size-4 mr-1" /> Adicionar despesa variável
      </Button>

      <Card className="rounded-2xl p-4 bg-muted/40 border flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Despesas variáveis</div>
          <div className="text-xs text-muted-foreground mt-0.5">Previsto por mês</div>
        </div>
        <div className="text-xl font-bold">{formatBRL(variableTotal)}</div>
      </Card>

      {loading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-6 rounded-2xl">
          <EmptyState
            icon={ShoppingBag}
            title="Nenhuma despesa variável cadastrada"
            description="Cadastre uma estimativa mensal para gastos que podem variar, como mercado, combustível, farmácia, lazer ou delivery."
          />
          <Button className="w-full mt-4 rounded-xl" onClick={onAdd}>
            <Plus className="size-4 mr-1" /> Adicionar despesa variável
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((x: any) => (
            <VariableItemCard
              key={x.id}
              item={x}
              onToggle={(v: boolean) => onToggle(x.id, v)}
              onEdit={() => onEdit(x)}
              onDelete={() => {
                if (confirm(`Excluir "${x.name}" da estrutura financeira?`)) {
                  onDelete(x.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariableItemCard({ item, onToggle, onEdit, onDelete }: any) {
  const catName = item.categories?.name ?? "Sem categoria";
  const subcatName = item.subcategories?.name;
  const isShared = item.visibility === "shared";
  const details = [catName];
  if (subcatName) details.push(subcatName);
  details.push(isShared ? "Nosso" : "Meu");
  if (item.notes) details.push(item.notes);

  return (
    <Card className={`rounded-2xl p-4 transition-opacity ${!item.is_active ? "opacity-60 bg-muted/30" : ""}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onToggle(!item.is_active)}
          className={`size-3.5 rounded-full shrink-0 transition-colors ${
            item.is_active ? "bg-success" : "bg-muted-foreground/40"
          }`}
          title={item.is_active ? "Clique para desativar" : "Clique para ativar"}
          aria-label={item.is_active ? "Desativar" : "Ativar"}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{item.name}</div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {details.join(" · ")}
          </div>
        </div>
        <div className="text-right shrink-0">
          <b className="text-sm font-semibold">{formatBRL(Number(item.estimated_amount || 0))}/mês</b>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-lg shrink-0" aria-label="Opções">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem onClick={onEdit} className="gap-2">
              <Pencil className="size-3.5" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggle(!item.is_active)} className="gap-2">
              <Power className="size-3.5" /> {item.is_active ? "Desativar" : "Ativar"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
              <Trash2 className="size-3.5" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

function VariableExpenseDialog({ open, onOpenChange, item, categories, opts }: any) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});

  const values = open
    ? {
        name: form.name ?? item?.name ?? "",
        estimated_amount: form.estimated_amount ?? item?.estimated_amount ?? "",
        category_id: form.category_id ?? item?.category_id ?? "none",
        subcategory_id: form.subcategory_id ?? item?.subcategory_id ?? "none",
        visibility: form.visibility ?? item?.visibility ?? opts.space,
        notes: form.notes ?? item?.notes ?? "",
        is_active: form.is_active ?? item?.is_active ?? true,
      }
    : form;

  const set = (k: string, v: any) => {
    if (k === "category_id") {
      setForm({ ...values, category_id: v, subcategory_id: "none" });
    } else {
      setForm({ ...values, [k]: v });
    }
  };

  const selectedCatId = values.category_id;
  const subcategories = useQuery({
    queryKey: ["structure-subcategories", selectedCatId],
    queryFn: async () => {
      if (!selectedCatId || selectedCatId === "none") return [];
      const { data, error } = await supabase
        .from("categories")
        .select("id,name")
        .eq("parent_id", selectedCatId)
        .eq("is_archived", false)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) return [];
      return data ?? [];
    },
    enabled: !!selectedCatId && selectedCatId !== "none",
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name?.trim()) return toast.error("Informe o nome da despesa");
    const amt = Number(values.estimated_amount);
    if (isNaN(amt) || amt < 0) return toast.error("Informe um valor previsto mensal válido");

    const payload: any = {
      name: values.name.trim(),
      estimated_amount: amt,
      category_id: values.category_id === "none" ? null : values.category_id,
      subcategory_id: values.subcategory_id === "none" ? null : values.subcategory_id,
      visibility: values.visibility,
      couple_id: values.visibility === "shared" ? opts.coupleId : null,
      user_id: user!.id,
      created_by: user!.id,
      notes: values.notes?.trim() || null,
      is_active: values.is_active,
    };

    const { error } = item
      ? await supabase.from("variable_expenses").update(payload).eq("id", item.id)
      : await supabase.from("variable_expenses").insert(payload);

    if (error) return toast.error(error.message);
    toast.success("Despesa variável salva");
    setForm({});
    qc.invalidateQueries({ queryKey: ["variable-expenses"] });
    qc.invalidateQueries({ queryKey: ["variable-expenses-projecao"] });
    qc.invalidateQueries({ queryKey: ["structure-plan"] });
    qc.invalidateQueries({ queryKey: ["tx-projecao"] });
    onOpenChange(false);
  }

  const subcatList = subcategories.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setForm({});
        onOpenChange(v);
      }}
    >
      <DialogContent className="rounded-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Editar despesa variável" : "Nova despesa variável"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <Field label="Nome da despesa *">
            <Input
              required
              placeholder="Ex: Mercado, Combustível, Lazer"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Valor previsto mensal *">
            <Input
              required
              min="0"
              type="number"
              step="0.01"
              placeholder="0,00"
              value={values.estimated_amount}
              onChange={(e) => set("estimated_amount", e.target.value)}
            />
          </Field>
          <Choice
            label="Categoria"
            value={values.category_id}
            setValue={(v: string) => set("category_id", v)}
            options={{ none: "Sem categoria", ...Object.fromEntries(categories.map((c: any) => [c.id, c.name])) }}
          />
          {subcatList.length > 0 && (
            <Choice
              label="Subcategoria"
              value={values.subcategory_id}
              setValue={(v: string) => set("subcategory_id", v)}
              options={{ none: "Sem subcategoria", ...Object.fromEntries(subcatList.map((s: any) => [s.id, s.name])) }}
            />
          )}
          <Choice
            label="Espaço"
            value={values.visibility}
            setValue={(v: string) => set("visibility", v)}
            options={{ shared: "Nosso (Compartilhado)", private: "Meu (Privado)" }}
          />
          <Field label="Observações">
            <Input
              placeholder="Ex: Estimativa mensal média"
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <Choice
            label="Ativa"
            value={values.is_active ? "true" : "false"}
            setValue={(v: string) => set("is_active", v === "true")}
            options={{ true: "Sim (ativa na estrutura)", false: "Não (desativada)" }}
          />
          <Button className="w-full rounded-xl mt-3">Salvar despesa variável</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IncomeDialog({ open, onOpenChange, item, people, opts }: any) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const values = open
    ? {
        name: form.name ?? item?.name ?? "",
        amount: form.amount ?? item?.amount ?? "",
        income_type: form.income_type ?? item?.income_type ?? "salary",
        frequency: form.frequency ?? item?.frequency ?? "monthly",
        receipt_day: form.receipt_day ?? item?.receipt_day ?? "",
        responsible_user_id: form.responsible_user_id ?? item?.responsible_user_id ?? user?.id,
        notes: form.notes ?? item?.notes ?? "",
      }
    : form;
  const set = (k: string, v: any) => setForm({ ...values, [k]: v });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      ...values,
      amount: Number(values.amount),
      receipt_day: values.receipt_day ? Number(values.receipt_day) : null,
      user_id: user!.id,
      created_by: user!.id,
      visibility: opts.space,
      couple_id: opts.space === "shared" ? opts.coupleId : null,
    };
    const { error } = item
      ? await supabase.from("income_sources").update(payload).eq("id", item.id)
      : await supabase.from("income_sources").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Fonte de receita salva");
    setForm({});
    qc.invalidateQueries({ queryKey: ["income-sources"] });
    onOpenChange(false);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setForm({});
        onOpenChange(v);
      }}
    >
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{item ? "Editar receita" : "Nova receita"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <Field label="Nome">
            <Input required value={values.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Valor">
              <Input required min="0" type="number" step="0.01" value={values.amount} onChange={(e) => set("amount", e.target.value)} />
            </Field>
            <Field label="Dia">
              <Input min="1" max="31" type="number" value={values.receipt_day} onChange={(e) => set("receipt_day", e.target.value)} />
            </Field>
          </div>
          <Choice label="Tipo" value={values.income_type} setValue={(v: string) => set("income_type", v)} options={incomeTypes} />
          <Choice
            label="Frequência"
            value={values.frequency}
            setValue={(v: string) => set("frequency", v)}
            options={{ weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", annual: "Anual", variable: "Variável" }}
          />
          <Choice
            label="Responsável"
            value={values.responsible_user_id}
            setValue={(v: string) => set("responsible_user_id", v)}
            options={Object.fromEntries(people.map((p: any) => [p.id, p.name]))}
          />
          <Field label="Observação">
            <Input value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <Button className="w-full rounded-xl">Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BillDialog({ open, onOpenChange, item, people, categories, opts }: any) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const values = open
    ? {
        title: form.title ?? item?.title ?? "",
        amount: form.amount ?? item?.amount ?? "",
        due_date: form.due_date ?? item?.due_date ?? "",
        recurrence: form.recurrence ?? item?.recurrence ?? "monthly",
        category_id: form.category_id ?? item?.category_id ?? "none",
        responsible: form.responsible ?? item?.responsible ?? "both",
        responsible_user_id: form.responsible_user_id ?? item?.responsible_user_id ?? "none",
        payment_method: form.payment_method ?? item?.payment_method ?? "other",
        notes: form.notes ?? item?.notes ?? "",
      }
    : form;
  const set = (k: string, v: any) => setForm({ ...values, [k]: v });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      ...values,
      amount: Number(values.amount),
      category_id: values.category_id === "none" ? null : values.category_id,
      responsible_user_id: values.responsible_user_id === "none" ? null : values.responsible_user_id,
      user_id: user!.id,
      visibility: opts.space,
      couple_id: opts.space === "shared" ? opts.coupleId : null,
    };
    const { error } = item
      ? await supabase.from("future_bills").update(payload).eq("id", item.id)
      : await supabase.from("future_bills").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Despesa fixa salva");
    setForm({});
    qc.invalidateQueries({ queryKey: ["fixed-bills"] });
    onOpenChange(false);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setForm({});
        onOpenChange(v);
      }}
    >
      <DialogContent className="rounded-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Editar despesa fixa" : "Nova despesa fixa"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <Field label="Nome">
            <Input required value={values.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Valor">
              <Input required min="0" type="number" step="0.01" value={values.amount} onChange={(e) => set("amount", e.target.value)} />
            </Field>
            <Field label="Próximo vencimento">
              <Input required type="date" value={values.due_date} onChange={(e) => set("due_date", e.target.value)} />
            </Field>
          </div>
          <Choice
            label="Frequência"
            value={values.recurrence}
            setValue={(v: string) => set("recurrence", v)}
            options={{ weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", yearly: "Anual" }}
          />
          <Choice
            label="Categoria"
            value={values.category_id}
            setValue={(v: string) => set("category_id", v)}
            options={{ none: "Sem categoria", ...Object.fromEntries(categories.map((c: any) => [c.id, c.name])) }}
          />
          <Choice
            label="Responsável"
            value={values.responsible}
            setValue={(v: string) => {
              setForm({ ...values, responsible: v, responsible_user_id: v === "both" ? "none" : values.responsible_user_id });
            }}
            options={{ both: "Ambos", me: "Uma pessoa", partner: "Uma pessoa" }}
          />
          {values.responsible !== "both" && (
            <Choice
              label="Pessoa"
              value={values.responsible_user_id}
              setValue={(v: string) => set("responsible_user_id", v)}
              options={{ none: "Selecione", ...Object.fromEntries(people.map((p: any) => [p.id, p.name])) }}
            />
          )}
          <Choice label="Pagamento" value={values.payment_method} setValue={(v: string) => set("payment_method", v)} options={paymentMethods} />
          <Field label="Observação">
            <Input value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <Button className="w-full rounded-xl">Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Choice({ label, value, setValue, options }: any) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem value={k} key={k}>
              {String(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}