import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGoalDeadline, toISODateOnly, formatDateBR } from "@/lib/financial-goals";
import { toast } from "sonner";
import { Calendar, Clock } from "lucide-react";

interface ExtendDeadlineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
  goalName: string;
  currentDeadline: string | null;
  onSuccess: () => void;
}

export function ExtendDeadlineDialog({
  open,
  onOpenChange,
  goalId,
  goalName,
  currentDeadline,
  onSuccess,
}: ExtendDeadlineDialogProps) {
  const [newDeadline, setNewDeadline] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setNewDeadline(currentDeadline?.slice(0, 10) || toISODateOnly(new Date()));
    }
  }, [open, currentDeadline]);

  function addDaysToDeadline(days: number) {
    const baseDate = currentDeadline ? new Date(currentDeadline.slice(0, 10)) : new Date();
    baseDate.setDate(baseDate.getDate() + days);
    setNewDeadline(toISODateOnly(baseDate));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeadline) {
      toast.error("Informe uma data válida");
      return;
    }

    try {
      setLoading(true);
      await updateGoalDeadline(goalId, newDeadline);
      toast.success(`Prazo atualizado para ${formatDateBR(newDeadline)}!`);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar prazo");
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
              <Calendar className="size-5" />
            </div>
            <div>
              <DialogTitle>Prorrogar Prazo</DialogTitle>
              <DialogDescription className="text-xs">
                Meta: <span className="font-semibold text-foreground">{goalName}</span>
                {currentDeadline && <> • Prazo atual: {formatDateBR(currentDeadline)}</>}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <Label className="text-xs text-muted-foreground block mb-1.5">Atalhos rápidos para adicionar tempo</Label>
            <div className="grid grid-cols-4 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs"
                onClick={() => addDaysToDeadline(7)}
              >
                +7 dias
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs"
                onClick={() => addDaysToDeadline(15)}
              >
                +15 dias
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs"
                onClick={() => addDaysToDeadline(30)}
              >
                +1 mês
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs"
                onClick={() => addDaysToDeadline(60)}
              >
                +2 meses
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="new-deadline">Novo Prazo Limite</Label>
            <Input
              id="new-deadline"
              type="date"
              required
              value={newDeadline}
              onChange={(e) => setNewDeadline(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="rounded-2xl bg-muted/50 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
            <Clock className="size-4 text-primary shrink-0 mt-0.5" />
            <span>
              Ao prorrogar o prazo, a exigência diária e semanal será recalculada automaticamente para aliviar o ritmo diário.
            </span>
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
              {loading ? "Salvando..." : "Salvar Novo Prazo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
