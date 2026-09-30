import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/finance";
import { toISODateOnly, addGoalContribution } from "@/lib/financial-goals";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlusCircle, Info } from "lucide-react";

interface AddContributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
  goalName: string;
  remainingAmount?: number;
  onSuccess: () => void;
}

export function AddContributionDialog({
  open,
  onOpenChange,
  goalId,
  goalName,
  remainingAmount,
  onSuccess,
}: AddContributionDialogProps) {
  const { user } = useAuth();
  const [amountStr, setAmountStr] = useState("");
  const [date, setDate] = useState(toISODateOnly(new Date()));
  const [note, setNote] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("none");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string | null; type?: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmountStr("");
      setDate(toISODateOnly(new Date()));
      setNote("");
      setSelectedAccountId("none");

      // Buscar contas bancárias apenas para referência informativa
      supabase
        .from("bank_accounts")
        .select("id, name, type")
        .eq("hidden", false)
        .then(({ data }) => {
          if (data) setAccounts(data);
        });
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const cleanAmount = parseFloat(amountStr.replace(/\./g, "").replace(",", "."));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      toast.error("Informe um valor válido maior que zero");
      return;
    }

    try {
      setLoading(true);
      await addGoalContribution({
        goalId,
        userId: user.id,
        amount: cleanAmount,
        date: date || toISODateOnly(new Date()),
        note: note.trim() || null,
        sourceType: selectedAccountId !== "none" ? "bank_account" : "manual",
        sourceId: selectedAccountId !== "none" ? selectedAccountId : null,
      });

      toast.success(`Aporte de ${formatBRL(cleanAmount)} registrado!`);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao registrar aporte");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <PlusCircle className="size-5" />
            </div>
            <div>
              <DialogTitle>Registrar Aporte</DialogTitle>
              <DialogDescription className="text-xs">
                Meta: <span className="font-semibold text-foreground">{goalName}</span>
                {remainingAmount !== undefined && remainingAmount > 0 && (
                  <> • Falta {formatBRL(remainingAmount)}</>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <Label htmlFor="amount">Valor do Aporte (R$)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0,00"
              required
              autoFocus
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="text-lg font-semibold h-11"
            />
          </div>

          <div>
            <Label htmlFor="date">Data do Aporte</Label>
            <Input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="account">Conta de Origem (Opcional)</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger id="account">
                <SelectValue placeholder="Selecione uma conta (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (ou dinheiro/manual)</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name || "Conta"} {acc.type ? `(${acc.type})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
              <Info className="size-3.5 text-muted-foreground shrink-0" />
              <span>Apenas informativo: não altera o saldo da sua conta bancária.</span>
            </div>
          </div>

          <div>
            <Label htmlFor="note">Observação / Nota</Label>
            <Textarea
              id="note"
              rows={2}
              placeholder="Ex: Sobra do salário, extra de freelance..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl gradient-coral text-white border-0"
            >
              {loading ? "Salvando..." : "Confirmar Aporte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
