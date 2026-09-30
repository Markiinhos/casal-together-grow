import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatBRL } from "@/lib/finance";
import {
  GoalCategory,
  GoalPeriodQuick,
  toISODateOnly,
  calculateDeadlineFromPeriod,
  addGoalContribution,
  createGoalWithFallback,
  formatDateBR,
  diffDays,
} from "@/lib/financial-goals";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Target,
  ShieldCheck,
  Plane,
  ShoppingBag,
  AlertTriangle,
  Receipt,
  Briefcase,
  Users,
  User,
  Sparkles,
  Calendar,
} from "lucide-react";

const CATEGORIES: Array<{ key: GoalCategory; label: string; icon: any }> = [
  { key: "Reserva", label: "Reserva", icon: ShieldCheck },
  { key: "Viagem", label: "Viagem", icon: Plane },
  { key: "Compra", label: "Compra", icon: ShoppingBag },
  { key: "Emergência", label: "Emergência", icon: AlertTriangle },
  { key: "Pagamento", label: "Pagamento", icon: Receipt },
  { key: "Projeto", label: "Projeto", icon: Briefcase },
  { key: "Outro", label: "Outro", icon: Target },
];

const QUICK_PERIODS: Array<{ key: GoalPeriodQuick; label: string }> = [
  { key: "7d", label: "7 dias" },
  { key: "2w", label: "2 semanas" },
  { key: "1m", label: "1 mês" },
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "1y", label: "1 ano" },
];

interface GoalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GoalFormDialog({ open, onOpenChange, onSuccess }: GoalFormDialogProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<GoalCategory>("Reserva");
  const [targetAmountStr, setTargetAmountStr] = useState("");
  const [initialAmountStr, setInitialAmountStr] = useState("");
  const [startDate, setStartDate] = useState(toISODateOnly(new Date()));
  const [deadlineMode, setDeadlineMode] = useState<"quick" | "custom">("quick");
  const [quickPeriod, setQuickPeriod] = useState<GoalPeriodQuick>("1m");
  const [customDeadline, setCustomDeadline] = useState("");
  const [visibility, setVisibility] = useState<"shared" | "private">(
    space === "shared" ? "shared" : "private"
  );
  const [trackingMode, setTrackingMode] = useState<"manual" | "automatic" | "hybrid">("manual");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  // Calcula a data de prazo com base no modo selecionado
  const computedDeadline =
    deadlineMode === "quick"
      ? calculateDeadlineFromPeriod(startDate || toISODateOnly(new Date()), quickPeriod)
      : customDeadline;

  const daysUntilDeadline = computedDeadline
    ? Math.max(0, diffDays(computedDeadline, startDate || toISODateOnly(new Date())))
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const targetAmount = parseFloat(targetAmountStr.replace(/\./g, "").replace(",", "."));
    if (isNaN(targetAmount) || targetAmount <= 0) {
      toast.error("Informe um valor alvo válido maior que zero");
      return;
    }

    const initialAmount = initialAmountStr
      ? parseFloat(initialAmountStr.replace(/\./g, "").replace(",", "."))
      : 0;

    if (isNaN(initialAmount) || initialAmount < 0) {
      toast.error("Valor inicial inválido");
      return;
    }

    try {
      setLoading(true);

      const coupleId = visibility === "shared" ? profile?.couple_id ?? null : null;

      // 1. Inserir a Meta Financeira (com suporte resiliente a fallback de schema)
      const createdGoal = await createGoalWithFallback({
        userId: user.id,
        coupleId,
        visibility,
        name: name.trim(),
        category,
        targetAmount,
        startDate,
        deadline: computedDeadline || null,
        trackingMode,
        description: description.trim() || null,
      });

      // 2. Se houver valor inicial guardado, registrar como primeira contribuição
      if (initialAmount > 0 && createdGoal?.id) {
        await addGoalContribution({
          goalId: createdGoal.id,
          userId: user.id,
          amount: initialAmount,
          date: startDate,
          note: "Aporte inicial ao criar a meta",
          sourceType: "initial",
        });
      }

      toast.success("Meta financeira criada com sucesso! 🎯");
      onOpenChange(false);
      resetForm();
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar meta");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setCategory("Reserva");
    setTargetAmountStr("");
    setInitialAmountStr("");
    setStartDate(toISODateOnly(new Date()));
    setDeadlineMode("quick");
    setQuickPeriod("1m");
    setCustomDeadline("");
    setDescription("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-10 rounded-2xl gradient-coral flex items-center justify-center text-white">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Nova Meta Financeira</DialogTitle>
              <DialogDescription className="text-xs">
                Defina quanto quer juntar, o prazo e acompanhe o ritmo necessário dia a dia.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Nome */}
          <div>
            <Label htmlFor="goal-name">Nome da Meta</Label>
            <Input
              id="goal-name"
              required
              placeholder="Ex: Reserva de Emergência, Viagem, IPVA..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 font-medium"
            />
          </div>

          {/* Categoria */}
          <div>
            <Label className="block mb-2 text-xs text-muted-foreground">Categoria</Label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const isSelected = category === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs transition-all border ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4 mb-1" />
                    <span className="truncate w-full text-center text-[10px]">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Valores: Alvo e Inicial */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="goal-target">Quanto precisa juntar? (R$)</Label>
              <Input
                id="goal-target"
                inputMode="decimal"
                required
                placeholder="1.500,00"
                value={targetAmountStr}
                onChange={(e) => setTargetAmountStr(e.target.value)}
                className="h-11 text-lg font-bold"
              />
            </div>
            <div>
              <Label htmlFor="goal-initial">Já possui algum valor? (Opcional)</Label>
              <Input
                id="goal-initial"
                inputMode="decimal"
                placeholder="0,00"
                value={initialAmountStr}
                onChange={(e) => setInitialAmountStr(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          {/* Data de início e Prazo */}
          <div className="rounded-2xl border border-border p-3.5 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" />
                Planejamento de Prazo
              </Label>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDeadlineMode("quick")}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    deadlineMode === "quick"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Período rápido
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={() => setDeadlineMode("custom")}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    deadlineMode === "custom"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Data exata
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="goal-start" className="text-xs">Data de início</Label>
                <Input
                  id="goal-start"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              {deadlineMode === "quick" ? (
                <div>
                  <Label className="text-xs">Prazo sugerido</Label>
                  <div className="grid grid-cols-3 gap-1.5 mt-0.5">
                    {QUICK_PERIODS.map((qp) => (
                      <button
                        key={qp.key}
                        type="button"
                        onClick={() => setQuickPeriod(qp.key)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center transition-all ${
                          quickPeriod === qp.key
                            ? "bg-primary/10 border-primary text-primary"
                            : "border-border hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {qp.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <Label htmlFor="goal-custom-deadline" className="text-xs">Data limite</Label>
                  <Input
                    id="goal-custom-deadline"
                    type="date"
                    required
                    value={customDeadline}
                    onChange={(e) => setCustomDeadline(e.target.value)}
                  />
                </div>
              )}
            </div>

            {computedDeadline && (
              <div className="text-xs text-muted-foreground pt-1 flex justify-between items-center border-t border-border/50">
                <span>Prazo final: <strong className="text-foreground">{formatDateBR(computedDeadline)}</strong></span>
                <span>Duração: <strong className="text-foreground">{daysUntilDeadline} dias</strong></span>
              </div>
            )}
          </div>

          {/* Tipo de Meta: Meu ou Nosso */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Escopo da Meta</Label>
              <RadioGroup
                value={visibility}
                onValueChange={(val: any) => setVisibility(val)}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="scope-private"
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs font-medium transition-all ${
                    visibility === "private"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <RadioGroupItem value="private" id="scope-private" />
                  <User className="size-4" />
                  <span>Minha</span>
                </Label>
                <Label
                  htmlFor="scope-shared"
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs font-medium transition-all ${
                    visibility === "shared"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <RadioGroupItem value="shared" id="scope-shared" />
                  <Users className="size-4" />
                  <span>Do Casal</span>
                </Label>
              </RadioGroup>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Forma de Acompanhamento</Label>
              <Select
                value={trackingMode}
                onValueChange={(val: any) => setTrackingMode(val)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (Aportes registrados por você)</SelectItem>
                  <SelectItem value="automatic">Automático (Integrações/Contas)</SelectItem>
                  <SelectItem value="hybrid">Manual + Automático</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notas */}
          <div>
            <Label htmlFor="goal-desc">Observações / Motivação</Label>
            <Textarea
              id="goal-desc"
              rows={2}
              placeholder="Ex: Juntar para viajar no Réveillon sem comprometer a fatura..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              className="rounded-xl gradient-coral text-white border-0 h-11 px-6 font-semibold"
            >
              {loading ? "Criando meta..." : "Criar Meta Financeira"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
