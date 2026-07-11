import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, ITEM_TYPES, PAY_METHODS, PRIORITIES, STATUSES } from "@/lib/household";

export const Route = createFileRoute("/app/casa/compras/nova")({
  component: NewItem,
});

function NewItem() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("couple_id").eq("id", user!.id).maybeSingle()).data,
    enabled: !!user,
  });
  const coupleId = profile?.couple_id ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] = useState<string>("purchase");
  const [category, setCategory] = useState<string>("");
  const [estimated, setEstimated] = useState("");
  const [dateMode, setDateMode] = useState<"date" | "month" | "none">("none");
  const [plannedDate, setPlannedDate] = useState("");
  const [plannedMonth, setPlannedMonth] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [assigned, setAssigned] = useState<string>("both");
  const [payment, setPayment] = useState<string>("undefined");
  const [installments, setInstallments] = useState("1");
  const [status, setStatus] = useState<string>("idea");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<"shared" | "private">("shared");

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("sem sessão");
      if (!title.trim()) throw new Error("Informe o nome do item.");
      const payload: any = {
        user_id: user.id,
        created_by: user.id,
        couple_id: visibility === "shared" ? coupleId : null,
        title: title.trim(),
        description: description.trim() || null,
        item_type: itemType,
        category: category || null,
        estimated_amount: estimated ? Number(estimated.replace(",", ".")) : null,
        planned_date: dateMode === "date" && plannedDate ? plannedDate : null,
        planned_month: dateMode === "month" && plannedMonth ? plannedMonth + "-01" : null,
        priority,
        status,
        planned_payment_method: payment === "undefined" ? null : payment,
        planned_installments: payment === "credit_installments" ? Math.max(1, Number(installments) || 1) : 1,
        visibility,
        metadata: { assigned, notes: notes || null },
      };
      const { data, error } = await (supabase as any).from("household_needs").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["household_needs"] });
      toast.success("Item criado");
      navigate({ to: "/app/casa/compras/$id", params: { id: data.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar o item."),
  });

  return (
    <>
      <PageHeader title="Novo item" fallbackRoute="/app/casa/compras" />

      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="px-4 py-4 space-y-3 max-w-md mx-auto pb-24">
        <Card className="rounded-2xl p-4 space-y-3 shadow-card">
          <div>
            <Label>Nome</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Comprar chuveiro elétrico" required />
          </div>
          <div>
            <Label>Tipo</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={itemType} onChange={(e) => setItemType(e.target.value)}>
              {ITEM_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Categoria</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Sem categoria</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes, marca, modelo…" />
          </div>
        </Card>

        <Card className="rounded-2xl p-4 space-y-3 shadow-card">
          <div>
            <Label>Valor estimado (R$)</Label>
            <Input inputMode="decimal" value={estimated} onChange={(e) => setEstimated(e.target.value)} placeholder="0,00" />
          </div>

          <div>
            <Label>Quando?</Label>
            <div className="flex gap-2 mt-1">
              {(["none", "month", "date"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setDateMode(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${dateMode === m ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                  {m === "none" ? "Sem data" : m === "month" ? "Mês/Ano" : "Data"}
                </button>
              ))}
            </div>
            {dateMode === "date" && <Input type="date" className="mt-2" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />}
            {dateMode === "month" && <Input type="month" className="mt-2" value={plannedMonth} onChange={(e) => setPlannedMonth(e.target.value)} />}
          </div>

          <div>
            <Label>Prioridade</Label>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {PRIORITIES.map((p) => (
                <button type="button" key={p.v} onClick={() => setPriority(p.v)}
                  className={`py-1.5 rounded-lg text-xs font-medium border ${priority === p.v ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Responsável</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={assigned} onChange={(e) => setAssigned(e.target.value)}>
              <option value="me">Eu</option>
              <option value="partner">Parceiro(a)</option>
              <option value="both">Ambos</option>
              <option value="undefined">Não definido</option>
            </select>
          </div>
        </Card>

        <Card className="rounded-2xl p-4 space-y-3 shadow-card">
          <div>
            <Label>Forma de pagamento planejada</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={payment} onChange={(e) => setPayment(e.target.value)}>
              {PAY_METHODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          {payment === "credit_installments" && (
            <div>
              <Label>Parcelas</Label>
              <Input type="number" min={1} max={48} value={installments} onChange={(e) => setInstallments(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Status</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Visibilidade</Label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setVisibility("shared")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${visibility === "shared" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                Nosso espaço
              </button>
              <button type="button" onClick={() => setVisibility("private")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${visibility === "private" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                Meu espaço
              </button>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Card>

        <Button type="submit" disabled={create.isPending} className="w-full h-12 rounded-xl gradient-coral text-white border-0">
          {create.isPending ? (
            <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Salvando…</span>
          ) : "Salvar"}
        </Button>
      </form>
    </>
  );
}
