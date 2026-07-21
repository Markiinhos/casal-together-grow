import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSpace } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import { getInvoiceStatusLabel, getInvoiceStatusColor } from "@/lib/card-aggregate";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, CalendarDays, ExternalLink, RefreshCw } from "lucide-react";
import { InvoicePaymentDrawer } from "@/components/InvoicePaymentDrawer";

export const Route = createFileRoute("/app/cartoes/$cardId/faturas")({
  component: InvoicesPage,
});

export function InvoicesPage() {
  const { cardId } = Route.useParams();
  const { user } = useAuth();
  const { space } = useSpace();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Fetch Cartão
  const { data: card, isLoading: loadingCard } = useQuery({
    queryKey: ["card", cardId],
    queryFn: async () => {
      const { data } = await supabase.from("credit_cards").select("*").eq("id", cardId).single();
      return data;
    },
    enabled: !!cardId,
  });

  // Fetch Invoices da tabela card_invoices
  const { data: invoices, isLoading: loadingInvoices, refetch } = useQuery({
    queryKey: ["card-invoices", cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_invoices")
        .select("*")
        .eq("card_id", cardId)
        .order("reference_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!cardId,
  });

  // Fetch accounts para o pagamento
  const { data: accounts = [] } = useQuery({
    queryKey: ["fin-accounts", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("*").order("name");
      return data ?? [];
    },
    enabled: !!user,
  });

  const abertas = invoices?.filter((i) => i.status === "open" || i.status === "due" || i.status === "overdue" || i.status === "partially_paid") || [];
  const fechadas = invoices?.filter((i) => i.status === "closed" || i.status === "paid") || [];

  if (loadingCard || loadingInvoices) {
    return (
      <>
        <PageHeader title="Faturas" fallbackRoute="/app/cartoes" />
        <div className="px-4 py-6 space-y-4">
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </>
    );
  }

  if (!card) {
    return (
      <>
        <PageHeader title="Faturas" fallbackRoute="/app/cartoes" />
        <div className="px-4 py-8 text-center text-muted-foreground">Cartão não encontrado.</div>
      </>
    );
  }

  function handleOpenPay(inv: any) {
    setSelectedInvoice(inv);
    setPayDrawerOpen(true);
  }

  function renderList(list: any[]) {
    if (list.length === 0) {
      return (
        <Card className="rounded-3xl p-4 shadow-card">
          <EmptyState icon={CalendarDays} title="Nenhuma fatura" description="Não há faturas para este filtro." />
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        {list.map((inv) => {
          const date = new Date(inv.reference_month + "-01T12:00:00");
          const isPaid = inv.status === "paid";
          const remaining = Math.max(0, inv.total_amount - (inv.paid_amount || 0));
          const statusLabel = getInvoiceStatusLabel(inv.status);
          const statusColor = getInvoiceStatusColor(inv.status);

          return (
            <Card key={inv.id} className="rounded-3xl p-4 shadow-card hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold capitalize text-lg flex items-center gap-2">
                    {date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Vencimento: {new Date(inv.due_date).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">{formatBRL(inv.total_amount)}</div>
                  {inv.paid_amount > 0 && !isPaid && (
                    <div className="text-[10px] text-success">Pago: {formatBRL(inv.paid_amount)}</div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-3 border-t border-border/50">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => navigate({ to: `/app/cartoes/${cardId}/faturas/${inv.id}` })}>
                  <ExternalLink className="size-4 mr-2" /> Detalhes
                </Button>
                <Button 
                  className={`flex-1 rounded-xl ${isPaid ? "bg-muted text-muted-foreground" : "gradient-coral text-white border-0"}`} 
                  onClick={() => handleOpenPay(inv)}
                >
                  <CreditCard className="size-4 mr-2" /> {isPaid ? "Detalhes do Pgto" : "Marcar fatura como paga"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Faturas do Cartão" subtitle={card.name} fallbackRoute="/app/cartoes" />
      
      <div className="px-4 py-4 space-y-4 pb-24">
        {selectedInvoice && (
          <InvoicePaymentDrawer
            open={payDrawerOpen}
            onOpenChange={setPayDrawerOpen}
            card={card}
            invoiceTotal={selectedInvoice.total_amount}
            paidAmount={selectedInvoice.paid_amount}
            invoiceId={selectedInvoice.id}
            refMonth={new Date(selectedInvoice.reference_month + "-01T12:00:00")}
            accounts={accounts}
          />
        )}

        {invoices?.length === 0 ? (
          <Card className="rounded-3xl p-6 shadow-card text-center space-y-4 border-dashed">
             <CreditCard className="size-8 mx-auto text-muted-foreground opacity-50" />
             <p className="font-medium text-sm">Este cartão ainda não possui faturas geradas na nova versão do sistema.</p>
             <p className="text-xs text-muted-foreground">Faturas são processadas e criadas automaticamente de acordo com as datas de fechamento, ou você pode continuar usando a aba "Faturas" padrão (simplificada).</p>
             <Button variant="outline" onClick={() => refetch()} className="rounded-xl"><RefreshCw className="size-4 mr-2" /> Atualizar</Button>
          </Card>
        ) : (
          <Tabs defaultValue="abertas">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="abertas">Abertas ({abertas.length})</TabsTrigger>
              <TabsTrigger value="fechadas">Fechadas ({fechadas.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="abertas" className="mt-4">
              {renderList(abertas)}
            </TabsContent>
            
            <TabsContent value="fechadas" className="mt-4">
              {renderList(fechadas)}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}
