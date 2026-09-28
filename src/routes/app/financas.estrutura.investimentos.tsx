import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePartner, useProfile } from "@/lib/hooks";
import { applySpaceFilter, useSpace } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import { formatDateOnly, getLocalISODate } from "@/lib/date-utils";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/app/financas/estrutura/investimentos")({
  head: () => ({ meta: [
    { title: "Investimentos — CASAL" },
    { name: "description", content: "Acompanhamento manual dos investimentos do casal." },
    { property: "og:title", content: "Investimentos — CASAL" },
    { property: "og:description", content: "Acompanhamento manual dos investimentos do casal." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: InvestmentsPage,
});

const investmentTypes: Record<string, string> = {
  cdb: "CDB", tesouro_direto: "Tesouro Direto", fundo: "Fundo", acoes: "Ações",
  etf: "ETF", criptomoedas: "Criptomoedas", poupanca: "Poupança", outros: "Outros",
};

type Investment = {
  id: string; responsible_user_id: string; institution: string; investment_type: string;
  name: string; amount: number; investment_date: string; yield_description: string | null; notes: string | null;
};

type InvestmentForm = {
  institution: string; investment_type: string; name: string; amount: string;
  investment_date: string; yield_description: string; notes: string; responsible_user_id: string;
};

const emptyForm = (userId: string): InvestmentForm => ({
  institution: "", investment_type: "cdb", name: "", amount: "", investment_date: getLocalISODate(),
  yield_description: "", notes: "", responsible_user_id: userId,
});

function InvestmentsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const { space } = useSpace();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState<InvestmentForm>(() => emptyForm(""));
  const coupleId = profile?.couple_id ?? null;
  const people = useMemo(() => [
    { id: user?.id ?? "", name: profile?.full_name || "Você" },
    ...(partner ? [{ id: partner.id, name: partner.full_name || "Parceiro(a)" }] : []),
  ], [partner, profile?.full_name, user?.id]);

  const investments = useQuery({
    queryKey: ["investments", space, coupleId, user?.id],
    queryFn: async () => {
      if (!user) return [];
      let query: any = supabase.from("investments").select("*").order("investment_date", { ascending: false });
      query = applySpaceFilter(query, { space, userId: user.id, coupleId });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Investment[];
    },
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão não encontrada");
      const payload = {
        user_id: user.id,
        couple_id: space === "shared" ? coupleId : null,
        visibility: space,
        responsible_user_id: space === "private" ? user.id : form.responsible_user_id,
        institution: form.institution.trim(), investment_type: form.investment_type,
        name: form.name.trim(), amount: Number(form.amount), investment_date: form.investment_date,
        yield_description: form.yield_description.trim() || null, notes: form.notes.trim() || null,
      };
      const result = editing
        ? await supabase.from("investments").update(payload).eq("id", editing.id)
        : await supabase.from("investments").insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: () => { toast.success(editing ? "Investimento atualizado" : "Investimento adicionado"); setOpen(false); queryClient.invalidateQueries({ queryKey: ["investments"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("investments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Investimento excluído"); queryClient.invalidateQueries({ queryKey: ["investments"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const showNew = () => { setEditing(null); setForm(emptyForm(user?.id ?? "")); setOpen(true); };
  const showEdit = (item: Investment) => {
    setEditing(item);
    setForm({ institution: item.institution, investment_type: item.investment_type, name: item.name,
      amount: String(item.amount), investment_date: item.investment_date, yield_description: item.yield_description ?? "",
      notes: item.notes ?? "", responsible_user_id: item.responsible_user_id });
    setOpen(true);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };
  const set = (field: keyof InvestmentForm, value: string) => setForm((current: InvestmentForm) => ({ ...current, [field]: value }));

  return <>
    <PageHeader title="Investimentos" subtitle="Acompanhamento manual" fallbackRoute="/app/financas/estrutura">
      <Button size="icon" variant="ghost" aria-label="Adicionar investimento" onClick={showNew}><Plus className="size-5" /></Button>
    </PageHeader>
    <main className="mx-auto max-w-3xl space-y-3 px-4 py-5 pb-24">
      <p className="text-xs text-muted-foreground">Registros para acompanhamento. Eles não alteram saldos, receitas ou despesas.</p>
      {investments.isLoading ? <><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></>
        : investments.isError ? <Card className="p-5 text-sm text-destructive">Não foi possível carregar os investimentos.</Card>
        : (investments.data ?? []).length === 0 ? <Card className="rounded-2xl"><EmptyState icon={Landmark} title="Nenhum investimento cadastrado" description="Adicione o primeiro registro para acompanhar manualmente." action={<Button onClick={showNew}><Plus className="mr-1 size-4" />Adicionar</Button>} /></Card>
        : (investments.data ?? []).map((item: Investment) => <Card key={item.id} className="rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10"><Landmark className="size-5 text-success" /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{item.name}</div>
              <div className="text-xs text-muted-foreground">{item.institution} · {investmentTypes[item.investment_type] ?? item.investment_type}</div>
            </div>
            <div className="text-right"><div className="font-semibold">{formatBRL(Number(item.amount))}</div><div className="text-xs text-muted-foreground">{formatDateOnly(item.investment_date)}</div></div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0 text-xs"><span className="text-muted-foreground">Responsável: </span>{people.find((person: { id: string; name: string }) => person.id === item.responsible_user_id)?.name ?? "Pessoa"}{item.yield_description && <div className="mt-1 text-success">Rendimento: {item.yield_description}</div>}{item.notes && <div className="mt-1 truncate text-muted-foreground">{item.notes}</div>}</div>
            <div className="flex shrink-0"><Button size="icon" variant="ghost" aria-label="Editar investimento" onClick={() => showEdit(item)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" aria-label="Excluir investimento" onClick={() => { if (window.confirm("Excluir este investimento?")) remove.mutate(item.id); }}><Trash2 className="size-4" /></Button></div>
          </div>
        </Card>)}
    </main>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle>{editing ? "Editar investimento" : "Novo investimento"}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nome"><Input required value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
        <Field label="Instituição"><Input required placeholder="Nubank, Inter, XP..." value={form.institution} onChange={(event) => set("institution", event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Tipo"><Select value={form.investment_type} onValueChange={(value: string) => set("investment_type", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(investmentTypes).map(([value, label]: [string, string]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Data"><Input required type="date" value={form.investment_date} onChange={(event) => set("investment_date", event.target.value)} /></Field></div>
        <Field label="Valor investido"><Input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => set("amount", event.target.value)} /></Field>
        {space === "shared" && <Field label="Responsável"><Select value={form.responsible_user_id} onValueChange={(value: string) => set("responsible_user_id", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{people.map((person: { id: string; name: string }) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select></Field>}
        <Field label="Rendimento informado"><Input placeholder="Ex.: 110% do CDI ou 8,5%" value={form.yield_description} onChange={(event) => set("yield_description", event.target.value)} /></Field>
        <Field label="Observação"><Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} /></Field>
        <Button className="w-full" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar investimento"}</Button>
      </form>
    </DialogContent></Dialog>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label>{label}</Label>{children}</div>; }