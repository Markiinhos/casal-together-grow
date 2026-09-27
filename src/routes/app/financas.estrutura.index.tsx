import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePartner, useProfile } from "@/lib/hooks";
import { applySpaceFilter, useSpace } from "@/lib/space";
import { buildSummary, fetchSubscriptions } from "@/lib/subscriptions";
import { formatBRL, getCategoryExpenses, monthlyAmount, planningFrequencyLabel } from "@/lib/finance";
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
import { ArrowUpCircle, CalendarClock, ChevronRight, Landmark, Pencil, PiggyBank, Plus, ReceiptText, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/financas/estrutura/")({
  head: () => ({ meta: [
    { title: "Estrutura financeira — CASAL" },
    { name: "description", content: "Organize receitas previstas, despesas fixas, investimentos e dívidas do casal." },
    { property: "og:title", content: "Estrutura financeira — CASAL" },
    { property: "og:description", content: "Organize receitas previstas, despesas fixas, investimentos e dívidas do casal." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: FinancialStructure,
});

const incomeTypes: Record<string, string> = { salary: "Salário", scholarship: "Bolsa", freelance: "Freelance", benefit: "Benefício", commission: "Comissão", extra: "Renda extra", other: "Outro" };
const paymentMethods: Record<string, string> = { pix: "Pix", debit: "Débito", bank_account: "Conta bancária", credit_card: "Cartão de crédito", boleto: "Boleto", cash: "Dinheiro", other: "Outro" };

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
  const [editingIncome, setEditingIncome] = useState<any>(null);
  const [editingBill, setEditingBill] = useState<any>(null);

  const incomes = useQuery({
    queryKey: ["income-sources", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("income_sources").select("*").order("name");
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }, enabled: !!user,
  });
  const bills = useQuery({
    queryKey: ["fixed-bills", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("future_bills").select("*, categories(name,color)").order("due_date");
      q = applySpaceFilter(q, opts);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }, enabled: !!user,
  });
  const categories = useQuery({
    queryKey: ["structure-categories", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("categories").select("id,name,color,type").eq("type", "expense").eq("is_archived", false).order("name");
      if (coupleId) q = q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`); else q = q.eq("user_id", user!.id);
      const { data, error } = await q; if (error) throw error; return data ?? [];
    }, enabled: !!user,
  });
  const subscriptions = useQuery({
    queryKey: ["structure-subscriptions", space, coupleId, user?.id],
    queryFn: async () => buildSummary(await fetchSubscriptions(opts)), enabled: !!user,
  });
  const currentPlan = useQuery({
    queryKey: ["structure-plan", space, coupleId, user?.id],
    queryFn: async () => {
      const ref = new Date(); const month = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-01`;
      let q: any = supabase.from("monthly_financial_plans").select("*, monthly_budget_allocations(*, categories(name,color))").eq("reference_month", month).eq("status", "active");
      q = applySpaceFilter(q, opts);
      const { data, error } = await q.maybeSingle(); if (error) throw error; return data as any;
    }, enabled: !!user,
  });
  const spent = useQuery({ queryKey: ["structure-spent", space, coupleId, user?.id], queryFn: () => getCategoryExpenses(new Date(), opts), enabled: !!user });

  const plannedIncome = useMemo(() => (incomes.data ?? []).filter((x: any) => x.is_active).reduce((s: number, x: any) => s + monthlyAmount(x.amount, x.frequency), 0), [incomes.data]);
  const fixedBills = useMemo(() => (bills.data ?? []).filter((x: any) => x.is_active && x.recurrence !== "once").reduce((s: number, x: any) => s + monthlyAmount(x.amount, x.recurrence), 0), [bills.data]);
  const fixedTotal = fixedBills + (subscriptions.data?.monthlyTotal ?? 0);
  const variableBudget = (currentPlan.data?.monthly_budget_allocations ?? []).reduce((s: number, x: any) => s + Number(x.planned_amount), 0);
  const available = plannedIncome - fixedTotal - variableBudget - Number(currentPlan.data?.planned_reserve ?? 0) - Number(currentPlan.data?.planned_goals ?? 0);
  const people = [{ id: user?.id ?? "", name: profile?.full_name || "Você" }, ...(partner ? [{ id: partner.id, name: partner.full_name || "Parceiro(a)" }] : [])];

  const remove = useMutation({
    mutationFn: async ({ table, id }: { table: "income_sources" | "future_bills"; id: string }) => { const { error } = await supabase.from(table).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["income-sources"] }); qc.invalidateQueries({ queryKey: ["fixed-bills"] }); toast.success("Item excluído"); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggle = async (table: "income_sources" | "future_bills", id: string, value: boolean) => {
    const { error } = await supabase.from(table).update({ is_active: value }).eq("id", id); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: [table === "income_sources" ? "income-sources" : "fixed-bills"] });
  };
  const loading = incomes.isLoading || bills.isLoading || subscriptions.isLoading || currentPlan.isLoading;

  return <>
    <PageHeader title="Estrutura financeira" subtitle="Planejamento previsto do casal" fallbackRoute="/app/financas" />
    <div className="px-4 py-4 space-y-4 pb-24 max-w-3xl mx-auto">
      <Card className="rounded-3xl p-5 shadow-card">
        <div className="text-xs text-muted-foreground">Disponível após compromissos planejados</div>
        <div className={`text-3xl font-bold mt-1 ${available < 0 ? "text-destructive" : "text-success"}`}>{loading ? "—" : formatBRL(available)}</div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
          <SummaryBox label="Receitas" value={plannedIncome} tone="success" />
          <SummaryBox label="Fixas" value={fixedTotal} tone="danger" />
          <SummaryBox label="Variáveis" value={variableBudget} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">Previsão mensal. Lançamentos realizados continuam no resumo financeiro principal.</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-auto justify-start gap-3 rounded-2xl p-4 text-left">
          <Link to="/app/financas/estrutura/investimentos">
            <Landmark className="size-5 shrink-0 text-success" />
            <span className="min-w-0 flex-1"><span className="block font-semibold">Investimentos</span><span className="block text-[11px] font-normal text-muted-foreground">Acompanhamento manual</span></span>
            <ChevronRight className="size-4 shrink-0" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 rounded-2xl p-4 text-left">
          <Link to="/app/financas/estrutura/dividas">
            <ReceiptText className="size-5 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1"><span className="block font-semibold">Dívidas</span><span className="block text-[11px] font-normal text-muted-foreground">Plano para quitar</span></span>
            <ChevronRight className="size-4 shrink-0" />
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="summary">
        <TabsList className="grid grid-cols-4 w-full h-auto rounded-2xl p-1">
          <TabsTrigger value="summary" className="text-xs">Resumo</TabsTrigger><TabsTrigger value="income" className="text-xs">Receitas</TabsTrigger><TabsTrigger value="fixed" className="text-xs">Fixas</TabsTrigger><TabsTrigger value="variable" className="text-xs">Variáveis</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="space-y-3 mt-3">
          <PlanRow icon={ArrowUpCircle} label="Receitas previstas" value={plannedIncome} color="text-success" />
          <PlanRow icon={CalendarClock} label="Contas fixas" value={fixedBills} color="text-destructive" />
          <PlanRow icon={WalletCards} label={`Assinaturas (${subscriptions.data?.activeCount ?? 0})`} value={subscriptions.data?.monthlyTotal ?? 0} color="text-destructive" />
          <PlanRow icon={PiggyBank} label="Reserva e metas" value={Number(currentPlan.data?.planned_reserve ?? 0) + Number(currentPlan.data?.planned_goals ?? 0)} />
        </TabsContent>
        <TabsContent value="income" className="space-y-3 mt-3">
          <Button className="w-full rounded-2xl" onClick={() => { setEditingIncome(null); setIncomeOpen(true); }}><Plus className="size-4 mr-1" /> Nova fonte de receita</Button>
          {incomes.isLoading ? <Skeleton className="h-24 rounded-2xl" /> : (incomes.data ?? []).length === 0 ? <Card className="p-4 rounded-2xl"><EmptyState icon={ArrowUpCircle} title="Sem receitas previstas" description="Cadastre salários e outras fontes recorrentes." /></Card> : (incomes.data ?? []).map((x: any) => <ItemCard key={x.id} title={x.name} subtitle={`${incomeTypes[x.income_type]} · ${planningFrequencyLabel(x.frequency)} · ${people.find(p => p.id === x.responsible_user_id)?.name ?? "Responsável"}`} value={monthlyAmount(x.amount, x.frequency)} active={x.is_active} onToggle={(v: boolean) => toggle("income_sources", x.id, v)} onEdit={() => { setEditingIncome(x); setIncomeOpen(true); }} onDelete={() => confirm("Excluir esta fonte de receita?") && remove.mutate({ table: "income_sources", id: x.id })} />)}
        </TabsContent>
        <TabsContent value="fixed" className="space-y-3 mt-3">
          <Button className="w-full rounded-2xl" onClick={() => { setEditingBill(null); setBillOpen(true); }}><Plus className="size-4 mr-1" /> Nova despesa fixa</Button>
          {(bills.data ?? []).map((x: any) => <ItemCard key={x.id} title={x.title} subtitle={`${x.categories?.name ?? "Sem categoria"} · ${planningFrequencyLabel(x.recurrence)} · vence dia ${new Date(x.due_date + "T12:00:00").getDate()}`} value={monthlyAmount(x.amount, x.recurrence)} active={x.is_active} onToggle={(v: boolean) => toggle("future_bills", x.id, v)} onEdit={() => { setEditingBill(x); setBillOpen(true); }} onDelete={() => confirm("Excluir esta despesa fixa?") && remove.mutate({ table: "future_bills", id: x.id })} />)}
          <Card className="rounded-2xl p-4 flex justify-between"><div><div className="text-sm font-medium">Assinaturas ativas</div><div className="text-xs text-muted-foreground">Gerenciadas no módulo de assinaturas</div></div><div className="text-right font-semibold">{formatBRL(subscriptions.data?.monthlyTotal ?? 0)}<div><Link to="/app/financas/assinaturas" className="text-xs text-primary">Gerenciar</Link></div></div></Card>
        </TabsContent>
        <TabsContent value="variable" className="space-y-3 mt-3">
          {!currentPlan.data ? <Card className="p-4 rounded-2xl"><EmptyState icon={PiggyBank} title="Sem planejamento neste mês" description="Crie um planejamento para definir orçamentos variáveis." /><Button asChild className="w-full mt-3 rounded-xl"><Link to="/app/financas/planejamento/novo">Criar planejamento</Link></Button></Card> : (currentPlan.data.monthly_budget_allocations ?? []).map((a: any) => { const used = spent.data?.byCategory?.[a.category_id] ?? 0; const budget = Number(a.planned_amount); return <Card key={a.id} className="rounded-2xl p-4"><div className="flex justify-between text-sm"><span>{a.categories?.name ?? "Categoria"}</span><b>{formatBRL(budget - used)}</b></div><div className="flex justify-between text-[11px] text-muted-foreground mt-1"><span>Gasto {formatBRL(used)}</span><span>Orçamento {formatBRL(budget)}</span></div><div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden"><div className={`h-full ${used > budget ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, budget ? used / budget * 100 : 0)}%` }} /></div></Card>; })}
        </TabsContent>
      </Tabs>
    </div>
    <IncomeDialog open={incomeOpen} onOpenChange={setIncomeOpen} item={editingIncome} people={people} opts={opts} />
    <BillDialog open={billOpen} onOpenChange={setBillOpen} item={editingBill} people={people} categories={categories.data ?? []} opts={opts} />
  </>;
}

function SummaryBox({ label, value, tone }: { label: string; value: number; tone?: string }) { return <div className="bg-accent/60 rounded-xl p-2"><div className="text-muted-foreground">{label}</div><b className={tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : ""}>{formatBRL(value)}</b></div>; }
function PlanRow({ icon: Icon, label, value, color = "text-primary" }: any) { return <Card className="rounded-2xl p-4 flex items-center gap-3"><Icon className={`size-5 ${color}`} /><span className="flex-1 text-sm">{label}</span><b className="text-sm">{formatBRL(value)}</b></Card>; }
function ItemCard({ title, subtitle, value, active, onToggle, onEdit, onDelete }: any) { return <Card className={`rounded-2xl p-4 ${!active ? "opacity-60" : ""}`}><div className="flex items-center gap-3"><button onClick={() => onToggle(!active)} className={`size-3 rounded-full ${active ? "bg-success" : "bg-muted-foreground"}`} aria-label={active ? "Desativar" : "Ativar"} /><div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{title}</div><div className="text-xs text-muted-foreground truncate">{subtitle}</div></div><b className="text-sm">{formatBRL(value)}/mês</b><button onClick={onEdit}><Pencil className="size-4" /></button><button onClick={onDelete} className="text-destructive"><Trash2 className="size-4" /></button></div></Card>; }

function IncomeDialog({ open, onOpenChange, item, people, opts }: any) {
  const qc = useQueryClient(); const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const values = open ? { name: form.name ?? item?.name ?? "", amount: form.amount ?? item?.amount ?? "", income_type: form.income_type ?? item?.income_type ?? "salary", frequency: form.frequency ?? item?.frequency ?? "monthly", receipt_day: form.receipt_day ?? item?.receipt_day ?? "", responsible_user_id: form.responsible_user_id ?? item?.responsible_user_id ?? user?.id, notes: form.notes ?? item?.notes ?? "" } : form;
  const set = (k: string, v: any) => setForm({ ...values, [k]: v });
  async function save(e: React.FormEvent) { e.preventDefault(); const payload: any = { ...values, amount: Number(values.amount), receipt_day: values.receipt_day ? Number(values.receipt_day) : null, user_id: user!.id, created_by: user!.id, visibility: opts.space, couple_id: opts.space === "shared" ? opts.coupleId : null }; const { error } = item ? await supabase.from("income_sources").update(payload).eq("id", item.id) : await supabase.from("income_sources").insert(payload); if (error) return toast.error(error.message); toast.success("Fonte de receita salva"); setForm({}); qc.invalidateQueries({ queryKey: ["income-sources"] }); onOpenChange(false); }
  return <Dialog open={open} onOpenChange={(v) => { if (!v) setForm({}); onOpenChange(v); }}><DialogContent className="rounded-3xl"><DialogHeader><DialogTitle>{item ? "Editar receita" : "Nova receita"}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-3"><Field label="Nome"><Input required value={values.name} onChange={e => set("name", e.target.value)} /></Field><div className="grid grid-cols-2 gap-2"><Field label="Valor"><Input required min="0" type="number" step="0.01" value={values.amount} onChange={e => set("amount", e.target.value)} /></Field><Field label="Dia"><Input min="1" max="31" type="number" value={values.receipt_day} onChange={e => set("receipt_day", e.target.value)} /></Field></div><Choice label="Tipo" value={values.income_type} setValue={(v: string) => set("income_type", v)} options={incomeTypes} /><Choice label="Frequência" value={values.frequency} setValue={(v: string) => set("frequency", v)} options={{ weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", annual: "Anual", variable: "Variável" }} /><Choice label="Responsável" value={values.responsible_user_id} setValue={(v: string) => set("responsible_user_id", v)} options={Object.fromEntries(people.map((p: any) => [p.id, p.name]))} /><Field label="Observação"><Input value={values.notes} onChange={e => set("notes", e.target.value)} /></Field><Button className="w-full rounded-xl">Salvar</Button></form></DialogContent></Dialog>;
}

function BillDialog({ open, onOpenChange, item, people, categories, opts }: any) {
  const qc = useQueryClient(); const { user } = useAuth(); const [form, setForm] = useState<any>({});
  const values = open ? { title: form.title ?? item?.title ?? "", amount: form.amount ?? item?.amount ?? "", due_date: form.due_date ?? item?.due_date ?? "", recurrence: form.recurrence ?? item?.recurrence ?? "monthly", category_id: form.category_id ?? item?.category_id ?? "none", responsible: form.responsible ?? item?.responsible ?? "both", responsible_user_id: form.responsible_user_id ?? item?.responsible_user_id ?? "none", payment_method: form.payment_method ?? item?.payment_method ?? "other", notes: form.notes ?? item?.notes ?? "" } : form;
  const set = (k: string, v: any) => setForm({ ...values, [k]: v });
  async function save(e: React.FormEvent) { e.preventDefault(); const payload: any = { ...values, amount: Number(values.amount), category_id: values.category_id === "none" ? null : values.category_id, responsible_user_id: values.responsible_user_id === "none" ? null : values.responsible_user_id, user_id: user!.id, visibility: opts.space, couple_id: opts.space === "shared" ? opts.coupleId : null }; const { error } = item ? await supabase.from("future_bills").update(payload).eq("id", item.id) : await supabase.from("future_bills").insert(payload); if (error) return toast.error(error.message); toast.success("Despesa fixa salva"); setForm({}); qc.invalidateQueries({ queryKey: ["fixed-bills"] }); onOpenChange(false); }
  return <Dialog open={open} onOpenChange={(v) => { if (!v) setForm({}); onOpenChange(v); }}><DialogContent className="rounded-3xl max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>{item ? "Editar despesa fixa" : "Nova despesa fixa"}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-3"><Field label="Nome"><Input required value={values.title} onChange={e => set("title", e.target.value)} /></Field><div className="grid grid-cols-2 gap-2"><Field label="Valor"><Input required min="0" type="number" step="0.01" value={values.amount} onChange={e => set("amount", e.target.value)} /></Field><Field label="Próximo vencimento"><Input required type="date" value={values.due_date} onChange={e => set("due_date", e.target.value)} /></Field></div><Choice label="Frequência" value={values.recurrence} setValue={(v: string) => set("recurrence", v)} options={{ weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", yearly: "Anual" }} /><Choice label="Categoria" value={values.category_id} setValue={(v: string) => set("category_id", v)} options={{ none: "Sem categoria", ...Object.fromEntries(categories.map((c: any) => [c.id, c.name])) }} /><Choice label="Responsável" value={values.responsible} setValue={(v: string) => { setForm({ ...values, responsible: v, responsible_user_id: v === "both" ? "none" : values.responsible_user_id }); }} options={{ both: "Ambos", me: "Uma pessoa", partner: "Uma pessoa" }} />{values.responsible !== "both" && <Choice label="Pessoa" value={values.responsible_user_id} setValue={(v: string) => set("responsible_user_id", v)} options={{ none: "Selecione", ...Object.fromEntries(people.map((p: any) => [p.id, p.name])) }} />}<Choice label="Pagamento" value={values.payment_method} setValue={(v: string) => set("payment_method", v)} options={paymentMethods} /><Field label="Observação"><Input value={values.notes} onChange={e => set("notes", e.target.value)} /></Field><Button className="w-full rounded-xl">Salvar</Button></form></DialogContent></Dialog>;
}
function Field({ label, children }: any) { return <div><Label>{label}</Label>{children}</div>; }
function Choice({ label, value, setValue, options }: any) { return <Field label={label}><Select value={value} onValueChange={setValue}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(options).map(([k, v]) => <SelectItem value={k} key={k}>{String(v)}</SelectItem>)}</SelectContent></Select></Field>; }