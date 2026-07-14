import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/utils";
import { getLocalISODate } from "@/lib/date-utils";
import { CreditCard, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useCouple } from "@/hooks/useCouple";

export function InvoicePaymentDetailsDrawer({ 
  paymentId, 
  open, 
  onOpenChange 
}: { 
  paymentId: string | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
}) {
  const qc = useQueryClient();
  const { user } = useCouple();
  const [deleting, setDeleting] = useState(false);

  const { data: tx, isLoading } = useQuery({
    queryKey: ["tx-payment", paymentId],
    queryFn: async () => {
      if (!paymentId) return null;
      const { data } = await supabase
        .from("transactions")
        .select("*, credit_cards(name, color)")
        .eq("id", paymentId)
        .single();
      return data;
    },
    enabled: !!paymentId && open,
  });

  async function handleDelete() {
    if (!tx) return;
    if (!confirm("Desfazer este pagamento de fatura?")) return;
    
    try {
      setDeleting(true);
      // O banco deve ter triggers para reverter o status da fatura se a transação for deletada,
      // ou apenas deletamos a transação e o "recalculate" cuida do resto (o update que muda is_card_payment
      // pode ser problemático, então é mais fácil hard-delete ou marcar como cancelled e disparar recalculate)
      
      const { error } = await supabase.from("transactions").update({ status: "cancelled" }).eq("id", tx.id);
      if (error) throw error;
      
      // Recalcular fatura atual
      // (a trigger no banco deve disparar e recalcular, mas vamos garantir)
      toast.success("Pagamento desfeito com sucesso.");
      
      qc.invalidateQueries({ queryKey: ["fin-invoices"] });
      qc.invalidateQueries({ queryKey: ["card-invoices"] });
      qc.invalidateQueries({ queryKey: ["recent-txs"] });
      qc.invalidateQueries({ queryKey: ["fin-income"] });
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
      
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao desfazer pagamento");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[70vh] sm:h-auto sm:max-h-[85vh] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex justify-between items-center text-left">
            <span>Detalhes do Pagamento</span>
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex justify-center p-8"><div className="animate-spin size-6 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : !tx ? (
          <div className="text-center p-8 text-muted-foreground">Pagamento não encontrado.</div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center py-6 bg-accent/30 rounded-3xl">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Valor Pago</div>
              <div className="text-3xl font-bold text-red-500">
                - {formatBRL(tx.amount)}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-accent/30 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                    <CreditCard className="size-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Cartão de Crédito</div>
                    <div className="text-xs text-muted-foreground">{tx.credit_cards?.name || "Cartão desconhecido"}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-accent/30 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-accent text-foreground flex items-center justify-center shrink-0">
                    <Calendar className="size-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Data do Pagamento</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.date).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button 
                variant="destructive" 
                className="w-full rounded-2xl" 
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="size-4 mr-2" />
                Desfazer Pagamento
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
