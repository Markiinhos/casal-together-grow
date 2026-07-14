import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatBRL } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Wallet,
  CreditCard,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

interface InvoicePaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: any;
  invoiceTotal: number;
  paidAmount?: number;
  invoiceId?: string;
  refMonth: Date;
  accounts: any[];
}

const KEYS = [
  "home-tx",
  "recent-txs",
  "fin-income",
  "fin-expenses",
  "fin-invoices",
  "fin-accounts",
  "fin-accounts-total",
  "card-purchases",
  "cards",
  "card-invoices",
  "tx-projecao",
  "plans",
];

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const k of KEYS) qc.invalidateQueries({ queryKey: [k] });
}

export function InvoicePaymentDrawer({
  open,
  onOpenChange,
  card,
  invoiceTotal,
  paidAmount = 0,
  invoiceId,
  refMonth,
  accounts,
}: InvoicePaymentDrawerProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const remaining = invoiceTotal - paidAmount;

  const [payAmount, setPayAmount] = useState(String(remaining));
  const [payDate, setPayDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [accountId, setAccountId] = useState("");
  const [paymentType, setPaymentType] = useState<"full" | "partial">("full");
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [showUndo, setShowUndo] = useState(false);

  const handlePay = useCallback(async () => {
    if (!user || !card || saving) return;
    setSaving(true);
    try {
      const val =
        paymentType === "full"
          ? remaining
          : parseFloat(payAmount.replace(",", ".")) || 0;

      if (val <= 0) {
        toast.error("Informe um valor válido");
        setSaving(false); // Must unlock immediately on error
        return;
      }

      if (invoiceId) {
        // Call the existing RPC
        const { error } = await supabase.rpc("mark_card_invoice_paid", {
          _invoice_id: invoiceId,
          _payment_amount: val,
          _payment_date: payDate,
          _account_id: accountId || undefined,
        });
        if (error) throw error;
      } else {
        // Fallback: create payment transaction manually
        const { error: txError } = await supabase
          .from("transactions")
          .insert({
            user_id: user.id,
            couple_id: card.couple_id ?? null,
            type: "expense",
            amount: val,
            description: `Pagamento fatura ${card.name} - ${refMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`,
            date: payDate,
            credit_card_id: card.id,
            is_card_payment: true,
            visibility: card.visibility ?? "shared",
            account_id: accountId || null,
          } as any);
        if (txError) throw txError;
      }

      const label =
        paymentType === "full" || val >= remaining
          ? "Fatura paga!"
          : "Pagamento parcial registrado!";
      toast.success(label);
      invalidateAll(qc);
      onOpenChange(false);
    } catch (err: any) {
      console.error("[invoice-pay] error:", err);
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [
    user,
    card,
    invoiceId,
    payAmount,
    payDate,
    paymentType,
    remaining,
    accountId,
    refMonth,
    qc,
    onOpenChange,
  ]);

  const handleUndo = useCallback(async () => {
    if (!user || !invoiceId) return;
    setUndoing(true);
    try {
      // Find payment transactions for this invoice
      const { data: payTxs } = await supabase
        .from("transactions")
        .select("id")
        .eq("credit_card_id", card.id)
        .eq("is_card_payment", true)
        .order("date", { ascending: false })
        .limit(1);

      if (payTxs && payTxs.length > 0) {
        // Hard delete the payment transaction
        await supabase
          .from("transactions")
          .delete()
          .eq("id", payTxs[0].id);
      }

      toast.success("Pagamento desfeito! Fatura reaberta.");
      invalidateAll(qc);
      onOpenChange(false);
    } catch (err: any) {
      console.error("[invoice-undo] error:", err);
      toast.error(`Erro: ${err.message}`);
    } finally {
      setUndoing(false);
      setShowUndo(false);
    }
  }, [user, invoiceId, card, qc, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 shadow-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div
              className="size-8 rounded-lg flex items-center justify-center"
              style={{
                background: (card?.color ?? "#7B61FF") + "22",
                color: card?.color ?? "#7B61FF",
              }}
            >
              <CreditCard className="size-4" />
            </div>
            Pagar fatura
          </DialogTitle>
          <DialogDescription className="text-xs">
            {card?.name ?? "Cartão"} —{" "}
            {refMonth.toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo */}
          <div className="rounded-2xl bg-muted/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor total</span>
              <span className="font-semibold">{formatBRL(invoiceTotal)}</span>
            </div>
            {paidAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Já pago</span>
                <span className="font-semibold text-success">
                  {formatBRL(paidAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-border/50 pt-2">
              <span className="font-medium">Valor restante</span>
              <span className="font-bold text-destructive">
                {formatBRL(remaining)}
              </span>
            </div>
          </div>

          {/* Tipo de pagamento */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPaymentType("full");
                setPayAmount(String(remaining));
              }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition ${paymentType === "full" ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground"}`}
            >
              Pagamento total
            </button>
            <button
              onClick={() => setPaymentType("partial")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition ${paymentType === "partial" ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground"}`}
            >
              Pagamento parcial
            </button>
          </div>

          {paymentType === "partial" && (
            <div>
              <Label className="text-xs">Valor do pagamento</Label>
              <Input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mt-1"
                max={remaining}
              />
            </div>
          )}

          <div>
            <Label className="text-xs">Data do pagamento</Label>
            <Input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="mt-1"
            />
          </div>

          {accounts.length > 0 && (
            <div>
              <Label className="text-xs">Conta utilizada</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma</SelectItem>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={handlePay}
            disabled={saving}
            className="w-full rounded-xl gradient-coral text-white border-0 h-11"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="size-4 mr-1.5" />
                {paymentType === "full"
                  ? `Pagar ${formatBRL(remaining)}`
                  : `Pagar ${formatBRL(parseFloat(payAmount.replace(",", ".")) || 0)}`}
              </>
            )}
          </Button>

          {/* Desfazer pagamento */}
          {paidAmount > 0 && (
            <div className="border-t border-border/50 pt-3">
              {!showUndo ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUndo(true)}
                  className="w-full text-xs text-muted-foreground h-8"
                >
                  <Undo2 className="size-3.5 mr-1" /> Desfazer pagamento
                  anterior
                </Button>
              ) : (
                <div className="rounded-xl bg-destructive/10 p-3 space-y-2">
                  <p className="text-xs text-destructive">
                    <AlertTriangle className="size-3.5 inline mr-1" />
                    Isso cancelará a transação de pagamento e reabrirá a fatura.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={undoing}
                      onClick={handleUndo}
                      className="flex-1 rounded-lg"
                    >
                      {undoing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Confirmar"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowUndo(false)}
                      className="rounded-lg"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
