import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Calculator, Edit2, ExternalLink, ListChecks,
  Loader2, Paperclip, Receipt, RefreshCw, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORIES, ITEM_TYPES, PAY_METHODS, PRIORITIES, STATUSES,
  fmtBRL, labelFor, priorityBadge, statusBadge,
} from "@/lib/household";

export const Route = createFileRoute("/app/casa/compras/$id")({
  component: ItemDetail,
});

/* ──────── component ──────── */
function ItemDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── state ── */
  const [showConvert, setShowConvert] = useState(false);
  const [actualAmount, setActualAmount] = useState("");
  const [payMethod, setPayMethod] = useState("pix");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTaskToo, setDeleteTaskToo] = useState(false);
  const [editing, setEditing] = useState(false);

  /* ── edit form state ── */
  const [eTitle, setETitle] = useState("");
  const [eDescription, setEDescription] = useState("");
  const [eItemType, setEItemType] = useState("purchase");
  const [eCategory, setECategory] = useState("");
  const [eEstimated, setEEstimated] = useState("");
  const [ePriority, setEPriority] = useState("medium");
  const [eStatus, setEStatus] = useState("idea");
  const [ePlannedDate, setEPlannedDate] = useState("");
  const [ePlannedMonth, setEPlannedMonth] = useState("");
  const [ePayment, setEPayment] = useState("undefined");
  const [eInstallments, setEInstallments] = useState("1");
  const [eVisibility, setEVisibility] = useState<"shared"|"private">("shared");

  /* ── queries ── */
  const { data: item, isLoading, isError, refetch } = useQuery({
    queryKey: ["household_need", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("household_needs").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ["household_attachments", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("household_need_attachments")
        .select("*")
        .eq("household_need_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  /* populate convert fields */
  useEffect(() => {
    if (item) {
      setActualAmount(String(item.actual_amount ?? item.estimated_amount ?? ""));
      setPayMethod(item.planned_payment_method ?? "pix");
    }
  }, [item]);

  /* populate edit fields */
  function startEditing() {
    if (!item) return;
    setETitle(item.title ?? "");
    setEDescription(item.description ?? "");
    setEItemType(item.item_type ?? "purchase");
    setECategory(item.category ?? "");
    setEEstimated(item.estimated_amount != null ? String(item.estimated_amount) : "");
    setEPriority(item.priority ?? "medium");
    setEStatus(item.status ?? "idea");
    setEPlannedDate(item.planned_date ?? "");
    setEPlannedMonth(item.planned_month ? (item.planned_month as string).slice(0, 7) : "");
    setEPayment(item.planned_payment_method ?? "undefined");
    setEInstallments(String(item.planned_installments ?? 1));
    setEVisibility(item.visibility ?? "shared");
    setEditing(true);
  }

  /* ── mutations ── */
  const updateStatus = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await (supabase as any).from("household_needs").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["household_need", id] });
      qc.invalidateQueries({ queryKey: ["household_needs"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar o item."),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!eTitle.trim()) throw new Error("Informe o nome do item.");
      const patch: any = {
        title: eTitle.trim(),
        description: eDescription.trim() || null,
        item_type: eItemType,
        category: eCategory || null,
        estimated_amount: eEstimated ? Number(eEstimated.replace(",", ".")) : null,
        priority: ePriority,
        status: eStatus,
        planned_date: ePlannedDate || null,
        planned_month: ePlannedMonth ? ePlannedMonth + "-01" : null,
        planned_payment_method: ePayment === "undefined" ? null : ePayment,
        planned_installments: ePayment === "credit_installments" ? Math.max(1, Number(eInstallments) || 1) : 1,
        visibility: eVisibility,
        completed_at: ["done", "purchased"].includes(eStatus) ? new Date().toISOString() : null,
      };
      
      const prevDate = item.planned_date;
      
      const { error } = await (supabase as any).from("household_needs").update(patch).eq("id", id);
      if (error) throw error;

      // Recalculate reminders if date changed
      if (ePlannedDate && ePlannedDate !== prevDate) {
        const { data: pendings } = await (supabase as any).from("household_need_reminders")
          .select("*").eq("household_need_id", id).eq("status", "pending");
          
        if (pendings && pendings.length > 0) {
          for (const rem of pendings) {
            if (rem.reminder_type === "custom") continue;
            let dateObj = new Date(ePlannedDate + "T09:00:00");
            if (rem.reminder_type === "one_day_before") dateObj.setDate(dateObj.getDate() - 1);
            if (rem.reminder_type === "one_week_before") dateObj.setDate(dateObj.getDate() - 7);
            
            if (dateObj.getTime() <= Date.now()) {
              await (supabase as any).from("household_need_reminders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", rem.id);
            } else {
              await (supabase as any).from("household_need_reminders").update({ remind_at: dateObj.toISOString() }).eq("id", rem.id);
            }
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["household_need", id] });
      qc.invalidateQueries({ queryKey: ["household_needs"] });
      toast.success("Item atualizado");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível atualizar o item."),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (item.task_id && deleteTaskToo) {
        await (supabase as any).from("house_tasks").delete().eq("id", item.task_id);
      } else if (item.task_id) {
        // Just unlink the task if we don't delete it
        await (supabase as any).from("house_tasks").update({ source_type: null, source_id: null }).eq("id", item.task_id);
      }
      const { error } = await (supabase as any).from("household_needs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["household_needs"] });
      toast.success("Item excluído");
      navigate({ to: "/app/casa/compras" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível excluir o item."),
  });

  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !item) throw new Error("sem sessão");
      if (item.task_id) throw new Error("Já existe uma tarefa para este item.");
      const { data, error } = await (supabase as any).from("house_tasks").insert({
        user_id: user.id,
        couple_id: item.couple_id,
        name: `Comprar/Providenciar: ${item.title}`,
        description: item.description,
        priority: item.priority === "urgent" ? "high" : item.priority,
        due_date: item.planned_date,
        visibility: item.visibility,
      }).select().single();
      if (error) throw error;
      await (supabase as any).from("household_needs").update({ task_id: data.id }).eq("id", id);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["household_need", id] });
      qc.invalidateQueries({ queryKey: ["household_needs"] });
      toast.success("Tarefa criada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível criar a tarefa."),
  });

  const convertToExpense = useMutation({
    mutationFn: async () => {
      if (!user || !item) throw new Error("sem sessão");
      if (item.expense_id) throw new Error("Despesa já registrada para este item.");
      const amount = Number((actualAmount || "0").replace(",", "."));
      if (!amount || amount <= 0) throw new Error("Informe o valor real.");
      const { data, error } = await (supabase as any).from("transactions").insert({
        user_id: user.id,
        couple_id: item.couple_id,
        type: "expense",
        amount,
        description: item.title,
        date: getLocalISODate(new Date()),
        visibility: item.visibility,
        note: `Origem: compras da casa (${item.id})`,
      }).select().single();
      if (error) throw error;
      await (supabase as any).from("household_needs").update({
        actual_amount: amount,
        expense_id: data.id,
        status: "purchased",
        completed_at: new Date().toISOString(),
      }).eq("id", id);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["household_need", id] });
      qc.invalidateQueries({ queryKey: ["household_needs"] });
      toast.success("Despesa registrada com sucesso");
      setShowConvert(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível registrar a despesa."),
  });

  /* ── file upload ── */
  async function uploadFile(file: File) {
    if (!user) return;
    const path = `${user.id}/${id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("household-attachments").upload(path, file);
    if (error) { toast.error(error.message); return; }
    const { data: signed } = await supabase.storage.from("household-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
    await (supabase as any).from("household_need_attachments").insert({
      household_need_id: id,
      user_id: user.id,
      file_url: signed?.signedUrl ?? path,
      file_name: file.name,
      file_type: file.type,
    });
    refetchAttachments();
    toast.success("Anexo enviado");
  }

  async function deleteAttachment(a: any) {
    await (supabase as any).from("household_need_attachments").delete().eq("id", a.id);
    refetchAttachments();
  }

  /* ── simulate in finance ── */
  function simulateInFinance() {
    if (!item) return;
    const params = new URLSearchParams({
      title: item.title,
      amount: String(item.estimated_amount ?? ""),
      payment: item.planned_payment_method ?? "pix",
      installments: String(item.planned_installments ?? 1),
      origin: `household:${item.id}`,
    });
    if (item.planned_date) params.set("date", item.planned_date);
    navigate({ to: `/app/financas/simular?${params.toString()}` as any });
  }

  /* ── render: loading ── */
  if (isLoading) return (
    <div className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
      <Loader2 className="size-4 animate-spin" /> Carregando…
    </div>
  );

  /* ── render: error ── */
  if (isError) return (
    <div className="p-6 text-center space-y-3">
      <p className="text-sm text-destructive">Não foi possível carregar o item.</p>
      <Button variant="outline" onClick={() => refetch()} className="rounded-xl gap-2">
        <RefreshCw className="size-4" /> Tentar novamente
      </Button>
    </div>
  );

  /* ── render: not found ── */
  if (!item) return (
    <div className="p-6 text-center space-y-3">
      <p className="text-sm text-muted-foreground">Item não encontrado.</p>
      <Link to="/app/casa/compras">
        <Button variant="outline" className="rounded-xl gap-2">
          <ArrowLeft className="size-4" /> Voltar para a lista
        </Button>
      </Link>
    </div>
  );

  /* ── render: editing mode ── */
  if (editing) return (
    <>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setEditing(false)} className="size-9 rounded-full hover:bg-accent flex items-center justify-center">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="font-bold flex-1">Editar item</h1>
        </div>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); editMutation.mutate(); }} className="px-4 py-4 space-y-3 max-w-md mx-auto pb-24">
        <Card className="rounded-2xl p-4 space-y-3 shadow-card">
          <div>
            <Label>Nome</Label>
            <Input value={eTitle} onChange={(e) => setETitle(e.target.value)} required />
          </div>
          <div>
            <Label>Tipo</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={eItemType} onChange={(e) => setEItemType(e.target.value)}>
              {ITEM_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Categoria</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={eCategory} onChange={(e) => setECategory(e.target.value)}>
              <option value="">Sem categoria</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={2} value={eDescription} onChange={(e) => setEDescription(e.target.value)} />
          </div>
        </Card>

        <Card className="rounded-2xl p-4 space-y-3 shadow-card">
          <div>
            <Label>Valor estimado (R$)</Label>
            <Input inputMode="decimal" value={eEstimated} onChange={(e) => setEEstimated(e.target.value)} />
          </div>
          <div>
            <Label>Data planejada</Label>
            <Input type="date" value={ePlannedDate} onChange={(e) => setEPlannedDate(e.target.value)} />
          </div>
          <div>
            <Label>Mês planejado</Label>
            <Input type="month" value={ePlannedMonth} onChange={(e) => setEPlannedMonth(e.target.value)} />
          </div>
          <div>
            <Label>Prioridade</Label>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {PRIORITIES.map((p) => (
                <button type="button" key={p.v} onClick={() => setEPriority(p.v)}
                  className={`py-1.5 rounded-lg text-xs font-medium border ${ePriority === p.v ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl p-4 space-y-3 shadow-card">
          <div>
            <Label>Forma de pagamento</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={ePayment} onChange={(e) => setEPayment(e.target.value)}>
              {PAY_METHODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          {ePayment === "credit_installments" && (
            <div>
              <Label>Parcelas</Label>
              <Input type="number" min={1} max={48} value={eInstallments} onChange={(e) => setEInstallments(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Status</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={eStatus} onChange={(e) => setEStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Visibilidade</Label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setEVisibility("shared")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${eVisibility === "shared" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                Nosso espaço
              </button>
              <button type="button" onClick={() => setEVisibility("private")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${eVisibility === "private" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                Meu espaço
              </button>
            </div>
          </div>
        </Card>

        <Button type="submit" disabled={editMutation.isPending} className="w-full h-12 rounded-xl gradient-coral text-white border-0">
          {editMutation.isPending ? (
            <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Salvando…</span>
          ) : "Salvar alterações"}
        </Button>
      </form>
    </>
  );

  /* ── render: detail view ── */
  return (
    <>
      <PageHeader title={item.title || "Detalhes"} fallbackRoute="/app/casa/compras">
        <button onClick={startEditing} className="size-9 rounded-full hover:bg-accent flex items-center justify-center text-primary" title="Editar">
          <Edit2 className="size-4" />
        </button>
        <button onClick={() => setDeleteOpen(true)} className="size-9 rounded-full hover:bg-accent text-destructive flex items-center justify-center" title="Excluir">
          <Trash2 className="size-4" />
        </button>
      </PageHeader>

      <div className="max-w-md mx-auto px-4 py-4 space-y-3 pb-24">
        {/* info card */}
        <Card className="rounded-2xl p-4 shadow-card space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityBadge(item.priority)}`}>{labelFor(PRIORITIES, item.priority)}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge(item.status)}`}>{labelFor(STATUSES, item.status)}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{labelFor(ITEM_TYPES, item.item_type)}</span>
            {item.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{item.category}</span>}
          </div>
          {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
          <div className="grid grid-cols-2 gap-2 text-xs pt-2">
            <div>
              <div className="text-muted-foreground">Estimado</div>
              <div className="font-semibold">{fmtBRL(Number(item.estimated_amount))}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Real</div>
              <div className="font-semibold">{fmtBRL(Number(item.actual_amount))}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Quando</div>
              <div className="font-medium">
                {item.planned_date ? new Date(item.planned_date).toLocaleDateString("pt-BR") :
                  item.planned_month ? new Date(item.planned_month).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "Sem data"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Pagamento</div>
              <div className="font-medium">{labelFor(PAY_METHODS, item.planned_payment_method ?? "undefined")}</div>
            </div>
            {item.planned_installments && item.planned_installments > 1 && (
              <div>
                <div className="text-muted-foreground">Parcelas</div>
                <div className="font-medium">{item.planned_installments}x</div>
              </div>
            )}
            <div>
              <div className="text-muted-foreground">Visibilidade</div>
              <div className="font-medium">{item.visibility === "shared" ? "Compartilhado" : "Privado"}</div>
            </div>
          </div>
          {item.actual_amount && item.estimated_amount && (
            <div className={`text-xs mt-1 ${Number(item.actual_amount) > Number(item.estimated_amount) ? "text-destructive" : "text-success"}`}>
              {Number(item.actual_amount) > Number(item.estimated_amount)
                ? `Gastou R$ ${(Number(item.actual_amount) - Number(item.estimated_amount)).toFixed(2)} a mais que o previsto`
                : `Economia de R$ ${(Number(item.estimated_amount) - Number(item.actual_amount)).toFixed(2)}`}
            </div>
          )}
        </Card>

        {/* linked items */}
        {(item.task_id || item.simulation_id || item.expense_id) && (
          <Card className="rounded-2xl p-4 shadow-card space-y-2">
            <div className="font-semibold text-sm">Vínculos</div>
            {item.task_id && (
              <div className="flex items-center gap-2 text-xs">
                <ListChecks className="size-4 text-primary" />
                <span>Tarefa vinculada</span>
                <Link to="/app/tarefas" className="text-primary hover:underline ml-auto flex items-center gap-1">
                  Abrir <ExternalLink className="size-3" />
                </Link>
              </div>
            )}
            {item.expense_id && (
              <div className="flex items-center gap-2 text-xs">
                <Receipt className="size-4 text-success" />
                <span>Despesa registrada</span>
                <Link to="/app/financas" className="text-primary hover:underline ml-auto flex items-center gap-1">
                  Abrir <ExternalLink className="size-3" />
                </Link>
              </div>
            )}
            {item.simulation_id && (
              <div className="flex items-center gap-2 text-xs">
                <Calculator className="size-4 text-accent-purple" />
                <span>Simulação salva</span>
                <Link to="/app/financas/simulacoes" className="text-primary hover:underline ml-auto flex items-center gap-1">
                  Abrir <ExternalLink className="size-3" />
                </Link>
              </div>
            )}
          </Card>
        )}

        {/* actions */}
        <Card className="rounded-2xl p-4 shadow-card space-y-2">
          <div className="font-semibold text-sm">Ações</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="rounded-xl gap-2" onClick={simulateInFinance}>
              <Calculator className="size-4" /> Simular
            </Button>
            <Button
              variant="outline" className="rounded-xl gap-2"
              onClick={() => createTask.mutate()}
              disabled={!!item.task_id || createTask.isPending}
            >
              {createTask.isPending ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />}
              {item.task_id ? "Tarefa criada" : "Criar tarefa"}
            </Button>
            {item.expense_id ? (
              <Button variant="secondary" className="rounded-xl gap-2 col-span-2" disabled>
                <Receipt className="size-4" /> Despesa já registrada
              </Button>
            ) : (
              <Button className="rounded-xl gap-2 col-span-2 gradient-coral text-white border-0" onClick={() => setShowConvert((s) => !s)}>
                <Receipt className="size-4" /> Registrar como despesa
              </Button>
            )}
          </div>

          {showConvert && !item.expense_id && (
            <div className="mt-2 space-y-2 rounded-xl bg-muted/30 p-3">
              <div>
                <Label>Valor real (R$)</Label>
                <Input inputMode="decimal" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} />
              </div>
              <div>
                <Label>Forma de pagamento</Label>
                <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {PAY_METHODS.filter((p) => p.v !== "undefined").map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                </select>
              </div>
              <Button
                className="w-full rounded-xl gradient-coral text-white border-0"
                onClick={() => convertToExpense.mutate()}
                disabled={convertToExpense.isPending}
              >
                {convertToExpense.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Salvando…</span>
                ) : "Confirmar e criar despesa"}
              </Button>
            </div>
          )}
        </Card>

        {/* status changer */}
        <Card className="rounded-2xl p-4 shadow-card space-y-2">
          <div className="font-semibold text-sm">Alterar status</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s.v}
                disabled={updateStatus.isPending}
                onClick={() => updateStatus.mutate({
                  status: s.v,
                  completed_at: ["done", "purchased"].includes(s.v) ? new Date().toISOString() : null,
                })}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                  item.status === s.v ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Card>

        {/* attachments */}
        <Card className="rounded-2xl p-4 shadow-card space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm flex items-center gap-2"><Paperclip className="size-4" /> Anexos</div>
            <Button size="sm" variant="outline" className="rounded-full gap-1" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" /> Enviar
            </Button>
            <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
          </div>
          {attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Fotos, orçamentos ou notas fiscais deste item.</p>
          ) : (
            <div className="space-y-1.5">
              {(attachments as any[]).map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <a href={a.file_url} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary hover:underline">{a.file_name ?? "Arquivo"}</a>
                  {a.user_id === user?.id && (
                    <button onClick={() => deleteAttachment(a)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="w-[90vw] max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Excluir item</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir "{item.title}"?
              {(item.expense_id || item.simulation_id || item.task_id) && (
                <span className="block mt-2 text-xs text-warning-foreground">
                  ⚠ Este item possui vínculos (como despesas ou simulações) que serão preservados, apenas o item da casa será excluído.
                </span>
              )}
            </DialogDescription>
            {item.task_id && (
              <div className="mt-4 p-3 bg-muted/30 rounded-xl border border-border">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={deleteTaskToo} onChange={(e) => setDeleteTaskToo(e.target.checked)} className="rounded" />
                  Também excluir a tarefa vinculada
                </label>
              </div>
            )}
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={remove.isPending} className="flex-1">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending} className="flex-1">
              {remove.isPending ? (
                <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Excluindo…</span>
              ) : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
