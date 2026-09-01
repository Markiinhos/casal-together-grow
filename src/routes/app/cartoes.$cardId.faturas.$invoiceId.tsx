import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, usePartner } from "@/lib/hooks";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/finance";
import { ShoppingBag, CreditCard, Pencil, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoicePaymentDrawer } from "@/components/InvoicePaymentDrawer";
import { toast } from "sonner";

const EDIT_FIELD_LABELS: Record<string, string> = {
  reference_month: "Mês de competência",
  due_date: "Data de vencimento",
  manual_adjustment: "Ajuste manual",
};

function formatEditValue(field: string, value: string | null): string {
  if (value == null) return "—";
  if (field === "manual_adjustment") return formatBRL(Number(value));
  if (field === "reference_month") {
    try {
      return new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    } catch {
      return value;
    }
  }
  if (field === "due_date") {
    try {
      return new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");
    } catch {
      return value;
    }
  }
  return value;
}

export const Route = createFileRoute("/app/cartoes/$cardId/faturas/$invoiceId")({
  component: InvoiceDetailPage,
});

export function InvoiceDetailPage() {
  const { cardId, invoiceId } = Route.useParams();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const qc = useQueryClient();
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [refMonthInput, setRefMonthInput] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [adjustmentInput, setAdjustmentInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function editorName(uid: string) {
    if (uid === user?.id) return profile?.full_name?.split(" ")[0] ?? "Você";
    if (uid === partner?.id) return partner?.full_name?.split(" ")[0] ?? "Parceiro";
    return "—";
  }

  // Fetch accounts para o pagamento
  const { data: accounts = [] } = useQuery({
    queryKey: ["fin-accounts", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("*").order("name");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["card-invoice-detail", invoiceId],
    queryFn: async () => {
      const { data } = await supabase.from("card_invoices").select("*, credit_cards(name, color, closing_day, due_day)").eq("id", invoiceId).single();
      return data;
    },
  });

  const { data: editHistory = [] } = useQuery({
    queryKey: ["card-invoice-edits", invoiceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("card_invoice_edits" as any)
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: !!invoiceId,
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Detalhes da Fatura" fallbackRoute={`/app/cartoes/${cardId}/faturas`} />
        <div className="p-4"><Skeleton className="h-40 rounded-3xl" /></div>
      </>
    );
  }

  if (!invoice) {
    return (
      <>
        <PageHeader title="Detalhes" fallbackRoute={`/app/cartoes/${cardId}/faturas`} />
        <div className="p-4 text-center">Fatura não encontrada.</div>
      </>
    );
  }

  const manualAdjustment = Number((invoice as any).manual_adjustment ?? 0);

  function openInvoiceEditor() {
    setRefMonthInput(invoice!.reference_month.slice(0, 7));
    setDueDateInput(invoice!.due_date.slice(0, 10));
    setAdjustmentInput(String(manualAdjustment));
    setNoteInput("");
    setEditingInvoice(true);
  }

  function handleRefMonthChange(value: string) {
    setRefMonthInput(value);
    // Mantém o mesmo dia, mas move pro novo mês (a vencimento tem que
    // ficar dentro do mês de competência escolhido)
    if (value) {
      const day = dueDateInput ? Number(dueDateInput.slice(8, 10)) : ((invoice as any)?.credit_cards?.due_day ?? 10);
      const [y, m] = value.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const clampedDay = Math.min(day, lastDay);
      setDueDateInput(`${value}-${String(clampedDay).padStart(2, "0")}`);
    }
  }

  async function saveInvoiceEdit() {
    if (!refMonthInput || !dueDateInput) {
      toast.error("Preencha o mês de competência e o vencimento");
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase.rpc("edit_card_invoice" as any, {
      _invoice_id: invoiceId,
      _new_reference_month: `${refMonthInput}-01`,
      _new_due_date: dueDateInput,
      _new_manual_adjustment: Number(adjustmentInput) || 0,
      _note: noteInput || null,
    });
    setSavingEdit(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Fatura atualizada!");
    setEditingInvoice(false);
    qc.invalidateQueries({ queryKey: ["card-invoice-detail", invoiceId] });
    qc.invalidateQueries({ queryKey: ["card-invoice-edits", invoiceId] });
    qc.invalidateQueries({ queryKey: ["card-invoices"] });
  }

  return (
    <>
      <PageHeader 
        title={`Fatura ${(() => {
          try {
            const mk = invoice.reference_month.substring(0, 7);
            const d = new Date(mk + "-01T12:00:00");
            return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
          } catch {
            return invoice.reference_month;
          }
        })()}`}
        subtitle={invoice.credit_cards?.name ?? "Cartão"}
        fallbackRoute={`/app/cartoes/${cardId}/faturas`} 
      />
      
      <div className="px-4 py-4 space-y-4 pb-24">
        <InvoicePaymentDrawer
          open={payDrawerOpen}
          onOpenChange={setPayDrawerOpen}
          card={{ id: invoice.card_id, name: invoice.credit_cards?.name, color: invoice.credit_cards?.color }}
          invoiceTotal={invoice.total_amount}
          paidAmount={invoice.paid_amount}
          invoiceId={invoice.id}
          refMonth={invoice.reference_month}
          accounts={accounts}
          status={invoice.status}
          closingDate={invoice.closing_date}
        />

        <Card className="rounded-3xl p-5 shadow-card bg-primary text-primary-foreground">
           <div className="text-sm opacity-80 mb-1">Total da fatura</div>
           <div className="text-3xl font-bold">{formatBRL(invoice.total_amount)}</div>
           
           <div className="flex justify-between mt-4 text-sm bg-black/10 p-3 rounded-xl">
             <div>
                <div className="opacity-80 text-[11px]">Vencimento</div>
                <div className="font-semibold">{new Date(invoice.due_date).toLocaleDateString("pt-BR")}</div>
             </div>
             <div className="text-right">
                <div className="opacity-80 text-[11px]">Status</div>
                <div className="font-semibold uppercase">{invoice.status === "paid" ? "Paga" : invoice.status === "open" ? "Aberta" : invoice.status}</div>
             </div>
           </div>
           
           {invoice.paid_amount > 0 && (
             <div className="mt-2 text-sm">
                Já pago: {formatBRL(invoice.paid_amount)}
             </div>
           )}
        </Card>

        <Card className="rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-semibold">Editar fatura</div>
            {!editingInvoice && (
              <button onClick={openInvoiceEditor} className="text-primary text-xs flex items-center gap-1">
                <Pencil className="size-3.5" /> Editar
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Corrija a competência, o vencimento ou o valor desta fatura (antes ou depois de paga). Toda alteração fica registrada no histórico abaixo.
          </p>
          {editingInvoice ? (
            <div className="space-y-3">
              <div>
                <Label>Mês de competência</Label>
                <Input
                  type="month"
                  value={refMonthInput}
                  onChange={(e) => handleRefMonthChange(e.target.value)}
                />
              </div>
              <div>
                <Label>Data de vencimento</Label>
                <Input
                  type="date"
                  min={refMonthInput ? `${refMonthInput}-01` : undefined}
                  max={refMonthInput ? `${refMonthInput}-31` : undefined}
                  value={dueDateInput}
                  onChange={(e) => setDueDateInput(e.target.value)}
                />
              </div>
              <div>
                <Label>Ajuste manual (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjustmentInput}
                  onChange={(e) => setAdjustmentInput(e.target.value)}
                  placeholder="Ex: 15.90 ou -10"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Some juros, multa ou desconto ao total calculado automaticamente pelas compras.
                </p>
              </div>
              <div>
                <Label>Motivo da alteração (opcional)</Label>
                <Input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Ex: banco cobrou 1 dia depois por feriado"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setEditingInvoice(false)} disabled={savingEdit}>
                  Cancelar
                </Button>
                <Button className="flex-1 rounded-xl gradient-coral text-white border-0" onClick={saveInvoiceEdit} disabled={savingEdit}>
                  {savingEdit ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm">
              <span className="font-medium capitalize">
                {new Date(invoice.reference_month.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </span>
              {manualAdjustment !== 0 && (
                <span className={`ml-2 font-semibold ${manualAdjustment > 0 ? "text-destructive" : "text-success"}`}>
                  {manualAdjustment > 0 ? "+" : ""}{formatBRL(manualAdjustment)} de ajuste
                </span>
              )}
            </div>
          )}
        </Card>

        <Button
          className={`w-full rounded-xl h-12 font-medium ${invoice.status === "paid" ? "bg-muted text-muted-foreground border border-border" : "gradient-coral text-white border-0"}`}
          onClick={() => setPayDrawerOpen(true)}
        >
          <CreditCard className="size-4 mr-2" /> {invoice.status === "paid" ? "Detalhes do Pgto" : "Marcar fatura como paga"}
        </Button>

        {editHistory.length > 0 && (
          <section>
            <h3 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
              <History className="size-4 text-primary" /> Histórico de alterações
            </h3>
            <Card className="rounded-2xl shadow-card divide-y divide-border overflow-hidden">
              {editHistory.map((e: any) => (
                <div key={e.id} className="px-4 py-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{EDIT_FIELD_LABELS[e.field] ?? e.field}</span>
                    <span className="text-muted-foreground">
                      {editorName(e.edited_by)} · {new Date(e.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {formatEditValue(e.field, e.old_value)} → <span className="text-foreground font-medium">{formatEditValue(e.field, e.new_value)}</span>
                  </div>
                  {e.note && <div className="text-muted-foreground mt-0.5 italic">"{e.note}"</div>}
                </div>
              ))}
            </Card>
          </section>
        )}

        <section>
           <h3 className="font-semibold mb-2 text-sm">Informação Adicional</h3>
           <Card className="rounded-2xl p-4 shadow-space text-sm text-muted-foreground whitespace-pre-wrap">
              Para visualizar os lançamentos desta fatura com detalhes (compras parceladas, etc) retorne ao histórico do cartão na tela principal.
           </Card>
        </section>
      </div>
    </>
  );
}
