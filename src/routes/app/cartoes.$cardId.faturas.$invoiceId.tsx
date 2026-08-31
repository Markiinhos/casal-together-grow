import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/finance";
import { ShoppingBag, CreditCard, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoicePaymentDrawer } from "@/components/InvoicePaymentDrawer";
import { toast } from "sonner";

export const Route = createFileRoute("/app/cartoes/$cardId/faturas/$invoiceId")({
  component: InvoiceDetailPage,
});

export function InvoiceDetailPage() {
  const { cardId, invoiceId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState(false);
  const [adjustmentInput, setAdjustmentInput] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);

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
      const { data } = await supabase.from("card_invoices").select("*, credit_cards(name, color)").eq("id", invoiceId).single();
      return data;
    },
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

  function openAdjustmentEditor() {
    setAdjustmentInput(String(manualAdjustment));
    setEditingAdjustment(true);
  }

  async function saveAdjustment() {
    setSavingAdjustment(true);
    const { error } = await supabase.rpc("set_invoice_manual_adjustment" as any, {
      _invoice_id: invoiceId,
      _adjustment: Number(adjustmentInput) || 0,
    });
    setSavingAdjustment(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ajuste salvo!");
    setEditingAdjustment(false);
    qc.invalidateQueries({ queryKey: ["card-invoice-detail", invoiceId] });
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
            <div className="text-sm font-semibold">Ajuste manual</div>
            {!editingAdjustment && (
              <button onClick={openAdjustmentEditor} className="text-primary text-xs flex items-center gap-1">
                <Pencil className="size-3.5" /> {manualAdjustment !== 0 ? "Editar" : "Adicionar"}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Some juros, multa ou desconto ao total calculado automaticamente pelas compras. Positivo aumenta a fatura, negativo diminui.
          </p>
          {editingAdjustment ? (
            <div className="space-y-2">
              <div>
                <Label>Valor do ajuste (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adjustmentInput}
                  onChange={(e) => setAdjustmentInput(e.target.value)}
                  placeholder="Ex: 15.90 ou -10"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setEditingAdjustment(false)} disabled={savingAdjustment}>
                  Cancelar
                </Button>
                <Button className="flex-1 rounded-xl gradient-coral text-white border-0" onClick={saveAdjustment} disabled={savingAdjustment}>
                  {savingAdjustment ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className={`text-lg font-bold ${manualAdjustment > 0 ? "text-destructive" : manualAdjustment < 0 ? "text-success" : ""}`}>
              {manualAdjustment === 0 ? "Nenhum ajuste" : formatBRL(manualAdjustment)}
            </div>
          )}
        </Card>

        <Button
          className={`w-full rounded-xl h-12 font-medium ${invoice.status === "paid" ? "bg-muted text-muted-foreground border border-border" : "gradient-coral text-white border-0"}`} 
          onClick={() => setPayDrawerOpen(true)}
        >
          <CreditCard className="size-4 mr-2" /> {invoice.status === "paid" ? "Detalhes do Pgto" : "Marcar fatura como paga"}
        </Button>

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
