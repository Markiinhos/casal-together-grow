import { useState, useEffect, useCallback } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { getLocalISODate } from "@/lib/date-utils";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────
interface TransactionEditDrawerProps {
  transactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QUERY_KEYS_TO_INVALIDATE = [
  "home-tx",
  "recent-txs",
  "fin-income",
  "fin-expenses",
  "fin-invoices",
  "fin-accounts",
  "fin-accounts-total",
  "card-purchases",
  "card-invoices",
  "cards",
  "subscriptions",
  "tx-projecao",
  "plans",
  "cats",
  "cats-exp",
];

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const key of QUERY_KEYS_TO_INVALIDATE) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

// ── Component ────────────────────────────────────────────────────
export function TransactionEditDrawer({
  transactionId,
  open,
  onOpenChange,
}: TransactionEditDrawerProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  // Fetch the transaction
  const {
    data: tx,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["tx-edit", transactionId],
    queryFn: async () => {
      if (!transactionId) return null;
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "*, categories(name,color,icon), credit_cards(name,closing_day), installments(*)"
        )
        .eq("id", transactionId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!transactionId && open,
  });

  // Form state
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [totalInstallments, setTotalInstallments] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("shared");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Categories
  const { data: categories = [] } = useQuery({
    queryKey: ["cats-edit", coupleId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      return (data ?? []) as any[];
    },
    enabled: !!user && open,
  });

  // Cards
  const { data: cards = [] } = useQuery({
    queryKey: ["cards-edit", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("credit_cards").select("*").order("name");
      const { data } = coupleId
        ? await q.eq("couple_id", coupleId)
        : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user && open,
  });

  // Accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-edit", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("bank_accounts").select("*").eq("hidden", false).order("name");
      const { data } = coupleId
        ? await q.eq("couple_id", coupleId)
        : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user && open,
  });

  // Populate form when tx loads
  useEffect(() => {
    if (tx) {
      setDescription(tx.description ?? "");
      setAmount(String(tx.amount ?? ""));
      setType(tx.type ?? "expense");
      setDate(tx.date ?? getLocalISODate());
      setCategoryId(tx.category_id ?? "");
      setCreditCardId(tx.credit_card_id ?? "");
      setTotalInstallments(
        tx.total_installments ? String(tx.total_installments) : ""
      );
      setVisibility(tx.visibility ?? "shared");
      setNotes(tx.notes ?? "");
      setAccountId(tx.account_id ?? "");
      setConfirmDelete(false);
    }
  }, [tx]);

  // Save handler
  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !transactionId) return;
      setSaving(true);
      try {
        const payload: Record<string, any> = {
          description,
          amount: parseFloat(amount.replace(",", ".")),
          type,
          date,
          category_id: categoryId || null,
          credit_card_id: creditCardId || null,
          total_installments: totalInstallments
            ? parseInt(totalInstallments)
            : null,
          visibility,
          notes: notes || null,
          account_id: accountId || null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("transactions")
          .update(payload as any)
          .eq("id", transactionId);

        if (error) {
          console.error("[tx-edit] save error:", error);
          toast.error(`Erro ao salvar: ${error.message}`);
          return;
        }

        toast.success("Lançamento atualizado!");
        invalidateAll(qc);
        onOpenChange(false);
      } catch (err: any) {
        console.error("[tx-edit] unexpected error:", err);
        toast.error("Erro inesperado ao salvar");
      } finally {
        setSaving(false);
      }
    },
    [
      user,
      transactionId,
      description,
      amount,
      type,
      date,
      categoryId,
      creditCardId,
      totalInstallments,
      visibility,
      notes,
      accountId,
      qc,
      onOpenChange,
    ]
  );

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!user || !transactionId) return;
    setDeleting(true);
    try {
      // Check if there are installments / history
      const hasInstallments = tx?.installments && tx.installments.length > 0;

      if (hasInstallments) {
        // Delete installments first
        await supabase
          .from("installments")
          .delete()
          .eq("transaction_id", transactionId);
      }
      
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", transactionId);
      if (error) throw error;
      toast.success("Lançamento excluído!");

      invalidateAll(qc);
      onOpenChange(false);
    } catch (err: any) {
      console.error("[tx-edit] delete error:", err);
      toast.error(`Erro ao excluir: ${err.message}`);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [user, transactionId, tx, qc, onOpenChange]);

  const isCardPurchase = !!creditCardId;
  const hasInstallments = tx?.installments && tx.installments.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 shadow-xl sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tx ? "Editar lançamento" : "Carregando..."}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Altere os dados e salve. Todas as telas serão atualizadas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : isError ? (
          <div className="text-center py-6 space-y-3">
            <AlertTriangle className="size-8 mx-auto text-destructive" />
            <p className="text-sm text-destructive font-medium">
              Erro ao carregar o lançamento
            </p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="rounded-xl"
            >
              Tentar novamente
            </Button>
          </div>
        ) : tx ? (
          <form onSubmit={handleSave} className="space-y-4">
            {/* Tipo */}
            <div>
              <Label className="text-xs">Tipo</Label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium border transition ${type === "expense" ? "bg-destructive/10 border-destructive text-destructive" : "bg-muted border-border text-muted-foreground"}`}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium border transition ${type === "income" ? "bg-success/10 border-success text-success" : "bg-muted border-border text-muted-foreground"}`}
                >
                  Receita
                </button>
              </div>
            </div>

            {/* Descrição */}
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                placeholder="Ex: Mercado"
              />
            </div>

            {/* Valor + Data */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Data</Label>
                <Input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Categoria */}
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma</SelectItem>
                  {categories
                    .filter(
                      (c: any) =>
                        c.type === type || c.type === "other"
                    )
                    .map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  {categoryId && !categories.find((c: any) => c.id === categoryId && (c.type === type || c.type === "other")) && (
                    <SelectItem value={categoryId}>Categoria Oculta/Excluída</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Cartão */}
            {type === "expense" && (
              <div>
                <Label className="text-xs">Cartão de crédito</Label>
                <Select value={creditCardId} onValueChange={setCreditCardId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Nenhum (à vista)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum (à vista)</SelectItem>
                    {cards.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    {creditCardId && !cards.find((c: any) => c.id === creditCardId) && (
                      <SelectItem value={creditCardId}>Cartão Excluído</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Conta */}
            {(!creditCardId || type !== "expense") && (
              <div>
                <Label className="text-xs">Conta origem/destino</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhuma</SelectItem>
                    {accounts.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                    {accountId && !accounts.find((a: any) => a.id === accountId) && (
                      <SelectItem value={accountId}>Conta Excluída</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Parcelas */}
            {isCardPurchase && (
              <div>
                <Label className="text-xs">Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={48}
                  value={totalInstallments}
                  onChange={(e) => setTotalInstallments(e.target.value)}
                  className="mt-1"
                  placeholder="À vista"
                />
                {hasInstallments && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    ⚠️ Já existem parcelas criadas. Alterar pode recalcular as
                    futuras.
                  </p>
                )}
              </div>
            )}

            {/* Espaço Meu/Nosso */}
            {coupleId && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">
                    {visibility === "shared"
                      ? "Nosso Espaço"
                      : "Meu Espaço"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {visibility === "shared"
                      ? "Visível para o parceiro"
                      : "Apenas você vê"}
                  </div>
                </div>
                <Switch
                  checked={visibility === "shared"}
                  onCheckedChange={(c) =>
                    setVisibility(c ? "shared" : "private")
                  }
                />
              </div>
            )}

            {/* Observações */}
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 resize-none"
                rows={2}
                placeholder="Notas opcionais..."
              />
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl gradient-coral text-white border-0 h-11"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Pencil className="size-4 mr-1.5" /> Salvar
                  </>
                )}
              </Button>

              {!confirmDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-xl h-11 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="rounded-xl h-11 px-4"
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Confirmar exclusão"
                  )}
                </Button>
              )}
            </div>

            {confirmDelete && (
              <div className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="size-4 inline mr-1" />
                {hasInstallments
                  ? "O lançamento será marcado como cancelado, preservando o histórico de parcelas."
                  : "O lançamento será excluído permanentemente."}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  className="ml-2 text-xs h-6"
                >
                  Cancelar
                </Button>
              </div>
            )}
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
