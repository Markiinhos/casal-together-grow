import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Calculator, ListChecks, Paperclip, Receipt, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, ITEM_TYPES, PAY_METHODS, PRIORITIES, STATUSES, fmtBRL, labelFor, priorityBadge, statusBadge } from "@/lib/household";

export const Route = createFileRoute("/app/casa/compras/$id")({
  component: ItemDetail,
});

function ItemDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: item, isLoading } = useQuery({
    queryKey: ["household_need", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("household_needs").select("*").eq("id", id).maybeSingle();
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

  const [showConvert, setShowConvert] = useState(false);
  const [actualAmount, setActualAmount] = useState("");
  const [payMethod, setPayMethod] = useState("pix");

  useEffect(() => {
    if (item) {
      setActualAmount(String(item.actual_amount ?? item.estimated_amount ?? ""));
      setPayMethod(item.planned_payment_method ?? "pix");
    }
  }, [item]);

  const updateStatus = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await (supabase as any).from("household_needs").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["household_need", id] });
      qc.invalidateQueries({ queryKey: ["household_needs"] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("household_needs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["household_needs"] });
      toast.success("Item excluído");
      navigate({ to: "/app/casa/compras" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
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
      toast.success("Tarefa criada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const convertToExpense = useMutation({
    mutationFn: async () => {
      if (!user || !item) throw new Error("sem sessão");
      const amount = Number((actualAmount || "0").replace(",", "."));
      if (!amount || amount <= 0) throw new Error("Informe o valor real.");
      const { data, error } = await (supabase as any).from("transactions").insert({
        user_id: user.id,
        couple_id: item.couple_id,
        type: "expense",
        amount,
        description: item.title,
        date: new Date().toISOString().slice(0, 10),
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
      toast.success("Despesa criada");
      setShowConvert(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

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

  if (isLoading) return <div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div>;
  if (!item) return <div className="p-6 text-center text-sm text-muted-foreground">Item não encontrado.</div>;

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/app/casa/compras" className="size-9 rounded-full hover:bg-accent flex items-center justify-center"><ArrowLeft className="size-5" /></Link>
          <h1 className="font-bold flex-1 truncate">{item.title}</h1>
          <button onClick={() => { if (confirm("Excluir este item?")) remove.mutate(); }} className="size-9 rounded-full hover:bg-accent text-destructive flex items-center justify-center">
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-4 space-y-3 pb-24">
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
          </div>
          {item.actual_amount && item.estimated_amount && (
            <div className={`text-xs mt-1 ${Number(item.actual_amount) > Number(item.estimated_amount) ? "text-destructive" : "text-success"}`}>
              {Number(item.actual_amount) > Number(item.estimated_amount)
                ? `Gastou R$ ${(Number(item.actual_amount) - Number(item.estimated_amount)).toFixed(2)} a mais que o previsto`
                : `Economia de R$ ${(Number(item.estimated_amount) - Number(item.actual_amount)).toFixed(2)}`}
            </div>
          )}
        </Card>

        <Card className="rounded-2xl p-4 shadow-card space-y-2">
          <div className="font-semibold text-sm">Ações</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="rounded-xl gap-2" onClick={simulateInFinance}>
              <Calculator className="size-4" /> Simular no financeiro
            </Button>
            <Button variant="outline" className="rounded-xl gap-2" onClick={() => createTask.mutate()} disabled={!!item.task_id || createTask.isPending}>
              <ListChecks className="size-4" /> {item.task_id ? "Tarefa criada" : "Criar tarefa"}
            </Button>
            {item.expense_id ? (
              <Button variant="secondary" className="rounded-xl gap-2 col-span-2" disabled>
                <Receipt className="size-4" /> Despesa registrada
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
              <Button className="w-full rounded-xl gradient-coral text-white border-0" onClick={() => convertToExpense.mutate()} disabled={convertToExpense.isPending}>
                {convertToExpense.isPending ? "Salvando…" : "Confirmar e criar despesa"}
              </Button>
            </div>
          )}
        </Card>

        <Card className="rounded-2xl p-4 shadow-card space-y-2">
          <div className="font-semibold text-sm">Alterar status</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button key={s.v} onClick={() => updateStatus.mutate({ status: s.v, completed_at: ["done", "purchased"].includes(s.v) ? new Date().toISOString() : null })}
                className={`text-[11px] px-2.5 py-1 rounded-full border ${item.status === s.v ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </Card>

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
    </>
  );
}
