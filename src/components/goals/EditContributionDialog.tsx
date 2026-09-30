import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/lib/finance";
import { editGoalContribution, GoalContributionItem } from "@/lib/financial-goals";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

interface EditContributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contribution: GoalContributionItem | null;
  onSuccess: () => void;
}

export function EditContributionDialog({
  open,
  onOpenChange,
  contribution,
  onSuccess,
}: EditContributionDialogProps) {
  const [amountStr, setAmountStr] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contribution) {
      setAmountStr(String(contribution.amount));
      setDate(contribution.date?.slice(0, 10) || "");
      setNote(contribution.note || "");
    }
  }, [contribution]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contribution) return;

    const cleanAmount = parseFloat(amountStr.replace(/\./g, "").replace(",", "."));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      toast.error("Informe um valor válido maior que zero");
      return;
    }

    try {
      setLoading(true);
      await editGoalContribution({
        contributionId: contribution.id,
        goalId: contribution.goal_id,
        amount: cleanAmount,
        date: date,
        note: note.trim() || null,
      });

      toast.success(`Aporte atualizado para ${formatBRL(cleanAmount)}!`);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao editar aporte");
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
              <Pencil className="size-5" />
            </div>
            <div>
              <DialogTitle>Editar Aporte</DialogTitle>
              <DialogDescription className="text-xs">
                Ajuste o valor, data ou observação deste aporte.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <Label htmlFor="edit-amount">Valor (R$)</Label>
            <Input
              id="edit-amount"
              inputMode="decimal"
              placeholder="0,00"
              required
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="text-lg font-semibold h-11"
            />
          </div>

          <div>
            <Label htmlFor="edit-date">Data</Label>
            <Input
              id="edit-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="edit-note">Observação</Label>
            <Textarea
              id="edit-note"
              rows={2}
              placeholder="Ex: Sobra do salário..."
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
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
