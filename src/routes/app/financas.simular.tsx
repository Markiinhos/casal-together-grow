import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace, applySpaceFilter } from "@/lib/space";
import { formatBRL } from "@/lib/couple";
import { PageHeader } from "@/components/PageHeader";
import { SpaceToggle } from "@/components/SpaceToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  simulate,
  PAYMENT_LABELS,
  RISK_COLORS,
  RISK_LABELS,
  type PaymentMethod,
  type SimulationResult,
} from "@/lib/simulator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { Sparkles, Save, CheckCircle2, GitCompare, History } from "lucide-react";

export const Route = createFileRoute("/app/financas/simular")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      title: search.title as string | undefined,
      amount: search.amount as string | undefined,
      payment: search.payment as PaymentMethod | undefined,
      installments: search.installments ? Number(search.installments) : undefined,
      origin: search.origin as string | undefined,
      date: search.date as string | undefined,
    }
  },
  component: SimulatePage,
});

const CATEGORIES = [
  "Casa",
  "Mercado",
  "Transporte",
  "Lazer",
  "Saúde",
  "Educação",
  "Viagem",
  "Presente",
  "Dívida",
  "Outros",
];

const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 5, 6, 10, 12, 18, 24];

function SimulatePage() {
  const search = Route.useSearch();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const { space } = useSpace();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [title, setTitle] = useState(search.title ?? "");
  const [amount, setAmount] = useState<string>(search.amount ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(search.payment ?? "pix");
  const [installments, setInstallments] = useState<number>(search.installments ?? 1);
  const [interestEnabled, setInterestEnabled] = useState(false);
  const [interestRate, setInterestRate] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<string>(() => search.date ?? new Date().toISOString().slice(0, 10));
  const [firstPaymentDate, setFirstPaymentDate] = useState<string>("");
  const [category, setCategory] = useState<string>("Outros");
  const [cardId, setCardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isConverted, setIsConverted] = useState(false);
  const originParts = search.origin?.split(":") ?? null;

  // Cartões
  const { data: cards = [] } = useQuery({
    queryKey: ["cards", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("credit_cards").select("*");
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Contexto financeiro do mês
  const { data: tx = [] } = useQuery({
    queryKey: ["tx-list", space, coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("transactions").select("*");
      q = applySpaceFilter(q, { space, userId: user!.id, coupleId });
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  const ctx = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let income = 0, expense = 0;
    for (const t of tx as any[]) {
      const d = new Date(t.date);
      if (d >= monthStart) {
        if (t.type === "income") income += Number(t.amount);
        if (t.type === "expense") expense += Number(t.amount);
      }
    }
    return { monthIncome: income, monthExpense: expense };
  }, [tx]);

  const amountNum = Number(amount) || 0;
  const isCredit = paymentMethod === "credit" || paymentMethod === "credit_installments";
  const showInstallments = paymentMethod === "credit_installments" || paymentMethod === "financing";

  const result: SimulationResult | null = useMemo(() => {
    if (!amountNum || amountNum <= 0) return null;
    const card = cardId ? cards.find((c: any) => c.id === cardId) : null;
    return simulate(
      {
        title,
        amount: amountNum,
        paymentMethod,
        installments: showInstallments ? installments : 1,
        interestEnabled,
        interestRate: Number(interestRate) || 0,
        purchaseDate,
        firstPaymentDate: firstPaymentDate || undefined,
        card: card ? { closing_day: card.closing_day, due_day: card.due_day } : null,
      },
      ctx,
    );
  }, [
    title,
    amountNum,
    paymentMethod,
    installments,
    interestEnabled,
    interestRate,
    purchaseDate,
    firstPaymentDate,
    cardId,
    cards,
    ctx,
    showInstallments,
  ]);

  async function handleSave(status: "simulated" | "converted" = "simulated") {
    if (!user || !result || !title.trim() || amountNum <= 0) {
      toast.error("Preencha nome e valor");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        user_id: user.id,
        couple_id: space === "shared" ? coupleId : null,
        visibility: space,
        title: title.trim(),
        amount: amountNum,
        payment_method: paymentMethod,
        card_id: cardId,
        installments: showInstallments ? installments : 1,
        interest_enabled: interestEnabled,
        interest_rate: Number(interestRate) || null,
        final_amount: result.totalCost,
        first_payment_date: firstPaymentDate || null,
        purchase_date: purchaseDate,
        category,
        simulation_result: result as any,
        risk_level: result.risk,
        status,
        source_type: originParts?.[0] ?? null,
        source_id: originParts?.[1] ?? null,
      };

      const { data: sim, error } = await supabase
        .from("expense_simulations")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      if (status === "converted") {
        // Criar transação real
        const txPayload: any = {
          user_id: user.id,
          couple_id: space === "shared" ? coupleId : null,
          visibility: space,
          type: "expense",
          amount: amountNum,
          description: title.trim(),
          date: purchaseDate,
          note: `Convertido da simulação (${PAYMENT_LABELS[paymentMethod]})`,
          total_installments: showInstallments ? installments : null,
        };
        const { data: newTx, error: txErr } = await supabase
          .from("transactions")
          .insert(txPayload)
          .select()
          .single();
        if (txErr) throw txErr;
        await supabase
          .from("expense_simulations")
          .update({ converted_expense_id: newTx.id, status: "converted" })
          .eq("id", sim.id);
        setIsConverted(true);
        setConfirmOpen(false);
        toast.success("Despesa criada a partir da simulação");
        qc.invalidateQueries();
        navigate({ to: "/app/financas" });
        return;
      }

      toast.success("Simulação salva");
      qc.invalidateQueries();
      navigate({ to: "/app/financas/simulacoes" });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Simular despesa" subtitle="Veja o impacto antes de comprar" fallbackRoute="/app/financas" />
      <div className="px-4 py-4 space-y-4 pb-32">
        <div className="flex items-center justify-between gap-2">
          <SpaceToggle />
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/app/financas/simulacoes">
                <History className="size-4 mr-1" /> Histórico
              </Link>
            </Button>
          </div>
        </div>

        <Card className="rounded-3xl p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Sparkles className="size-5" /> Nova simulação
          </div>

          <div className="space-y-2">
            <Label>Nome da despesa</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Comprar celular"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Valor total</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Data da compra</Label>
              <Input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((k) => (
                  <SelectItem key={k} value={k}>{PAYMENT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCredit && (
            <div className="space-y-2">
              <Label>Cartão</Label>
              <Select value={cardId ?? "none"} onValueChange={(v) => setCardId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Genérico" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Genérico</SelectItem>
                  {cards.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showInstallments && (
            <div className="space-y-2">
              <Label>Parcelas</Label>
              <div className="flex flex-wrap gap-2">
                {INSTALLMENT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setInstallments(n)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${
                      installments === n
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    {n === 1 ? "À vista" : `${n}x`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label>Com juros?</Label>
              <p className="text-xs text-muted-foreground">Aplica juros compostos ao mês</p>
            </div>
            <Switch checked={interestEnabled} onCheckedChange={setInterestEnabled} />
          </div>

          {interestEnabled && (
            <div className="space-y-2">
              <Label>Taxa (% ao mês)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="Ex: 2,5"
              />
            </div>
          )}

          {(paymentMethod === "boleto" || paymentMethod === "financing") && (
            <div className="space-y-2">
              <Label>Primeira data de pagamento</Label>
              <Input
                type="date"
                value={firstPaymentDate}
                onChange={(e) => setFirstPaymentDate(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {result && <ResultView result={result} paymentMethod={paymentMethod} />}

        {result && (
          <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 pt-2 bg-background/95 backdrop-blur border-t z-40 flex gap-2">
            <Button variant="outline" onClick={() => handleSave("simulated")} disabled={saving || isConverted} className="flex-1">
              <Save className="size-4 mr-1" /> Salvar
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={saving || isConverted} className="flex-1">
              <CheckCircle2 className="size-4 mr-1" /> Converter em despesa
            </Button>
          </div>
        )}

        {result && (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="w-[90vw] max-w-md rounded-3xl">
              <DialogHeader>
                <DialogTitle>Confirmar conversão</DialogTitle>
                <DialogDescription>Isso criará uma despesa real nos seus registros.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 my-4 text-sm">
                <div className="flex justify-between"><span>Nome:</span> <span className="font-medium">{title}</span></div>
                <div className="flex justify-between"><span>Valor:</span> <span className="font-medium">{formatBRL(result.totalCost)}</span></div>
                <div className="flex justify-between"><span>Forma:</span> <span className="font-medium">{PAYMENT_LABELS[paymentMethod]} {showInstallments && `em ${installments}x`}</span></div>
                <div className="flex justify-between"><span>Categoria:</span> <span className="font-medium">{category}</span></div>
              </div>
              <DialogFooter className="flex-row gap-2 sm:justify-between">
                <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={() => handleSave("converted")} disabled={saving} className="flex-1">
                  Confirmar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </>
  );
}

function ResultView({ result, paymentMethod }: { result: SimulationResult; paymentMethod: PaymentMethod }) {
  const beforeAfter = [
    { name: "Antes", value: result.expenseBefore },
    { name: "Depois", value: result.expenseAfter },
  ];
  const projection = result.monthLabels.map((l, i) => ({
    mes: l,
    valor: Number(result.monthlyImpact[i].toFixed(2)),
  }));
  const riskColor = RISK_COLORS[result.risk];

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Valor da compra</p>
          <p className="text-lg font-bold">{formatBRL(result.totalCost)}</p>
        </Card>
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Forma</p>
          <p className="text-sm font-semibold">{PAYMENT_LABELS[paymentMethod]}</p>
        </Card>
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Parcela</p>
          <p className="text-lg font-bold">{formatBRL(result.installmentAmount)}</p>
        </Card>
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Impacto no mês</p>
          <p className="text-lg font-bold">+ {formatBRL(result.monthlyImpact[0])}</p>
        </Card>
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Saldo antes</p>
          <p className="text-base font-semibold">{formatBRL(result.balanceBefore)}</p>
        </Card>
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Saldo depois</p>
          <p className={`text-base font-semibold ${result.balanceAfter < 0 ? "text-destructive" : ""}`}>
            {formatBRL(result.balanceAfter)}
          </p>
        </Card>
      </div>

      <Card className="rounded-2xl p-4" style={{ borderLeft: `4px solid ${riskColor}` }}>
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: riskColor }}
          >
            {RISK_LABELS[result.risk]}
          </span>
          <span className="text-xs text-muted-foreground">Nível de risco</span>
        </div>
        <p className="text-sm">{result.riskMessage}</p>
        <p className="text-xs text-muted-foreground mt-2">💡 {result.suggestion}</p>
      </Card>

      <Card className="rounded-2xl p-4">
        <p className="text-sm font-semibold mb-2">Despesas do mês</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={beforeAfter}>
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
              <Bar dataKey="value" fill="#FF6B57" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Orçamento usado: {result.budgetPctBefore.toFixed(0)}% → {result.budgetPctAfter.toFixed(0)}%
        </p>
      </Card>

      <Card className="rounded-2xl p-4">
        <p className="text-sm font-semibold mb-2">Projeção — próximos 12 meses</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projection}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
              <Bar dataKey="valor" fill="#7B61FF" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {result.cardImpact > 0 && (
        <Card className="rounded-2xl p-4">
          <p className="text-sm font-semibold mb-2">Evolução da fatura do cartão</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projection}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                <Line type="monotone" dataKey="valor" stroke="#FF6B57" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </>
  );
}
