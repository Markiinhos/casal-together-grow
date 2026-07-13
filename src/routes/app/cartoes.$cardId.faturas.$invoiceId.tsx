import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/finance";
import { ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/app/cartoes/$cardId/faturas/$invoiceId")({
  component: InvoiceDetailPage,
});

export function InvoiceDetailPage() {
  const { cardId, invoiceId } = Route.useParams();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["card-invoice-detail", invoiceId],
    queryFn: async () => {
      const { data } = await supabase.from("card_invoices").select("*, credit_cards(name)").eq("id", invoiceId).single();
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

  return (
    <>
      <PageHeader 
        title={`Fatura ${new Date(invoice.reference_month + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
        subtitle={invoice.credit_cards?.name ?? "Cartão"}
        fallbackRoute={`/app/cartoes/${cardId}/faturas`} 
      />
      
      <div className="px-4 py-4 space-y-4 pb-24">
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
