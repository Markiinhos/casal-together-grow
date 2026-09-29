import { useState, useEffect, useCallback } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { formatBRL } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteCardPurchaseCompletely,
  invalidateAllCardQueries,
  HasPaidPaymentsError,
} from "@/lib/card-purchase-deletion";

interface CardPurchaseEditDrawerProps {
  purchaseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EditScope = "single" | "future" | "all";
type DeleteScope = "force_all" | "all" | "future" | "cancel";

const KEYS = [
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
  "tx-projecao",
  "plans",
  // Additional keys requested by user
  "card-history",
  "transactions",
  "installments",
  "category-expenses",
  "monthly-financial-summary",
  "home-monthly-summary",
  "home-tx",
  "finance-dashboard",
  "monthly-plans",
  "financial-projection",
];

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const k of KEYS) qc.invalidateQueries({ queryKey: [k] });
}

export function CardPurchaseEditDrawer({
  purchaseId,
  open,
  onOpenChange,
}: CardPurchaseEditDrawerProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  const {
    data: tx,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["card-purchase-edit", purchaseId],
    queryFn: async () => {
      if (!purchaseId) return null;
      const { data, error } = await supabase
        .from("transactions")
        .select("*, installments(*)")
        .eq("id", purchaseId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!purchaseId && open,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ["cards-edit", coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("credit_cards").select("*").order("name");
      if (coupleId) {
        q = q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`);
      } else {
        q = q.eq("user_id", user!.id);
      }
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user && open,
  });

  const { data: cats = [] } = useQuery({
    queryKey: ["cats-exp-edit", coupleId, user?.id],
    queryFn: async () => {
      let q: any = supabase.from("categories").select("*").order("name");
      if (coupleId) {
        q = q.or(`couple_id.eq.${coupleId},user_id.eq.${user!.id}`);
      } else {
        q = q.eq("user_id", user!.id);
      }
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!user && open,
  });

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [cardId, setCardId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [installments, setInstallments] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("shared");
  const [notes, setNotes] = useState("");
  const [editScope, setEditScope] = useState<EditScope>("all");
  const [deleteScope, setDeleteScope] = useState<DeleteScope>("all");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [strongConfirmOpen, setStrongConfirmOpen] = useState(false);

  useEffect(() => {
    if (tx) {
      setDescription(tx.description ?? "");
      setAmount(String(tx.amount ?? ""));
      setDate(tx.date ?? "");
      setCardId(tx.credit_card_id ?? "");
      setCategoryId(tx.category_id ?? "");
      setInstallments(tx.total_installments ? String(tx.total_installments) : "1");
      setVisibility(tx.visibility ?? "shared");
      setNotes(tx.note ?? "");
      setConfirmDelete(false);
      setStrongConfirmOpen(false);
      setEditScope("all");
      setDeleteScope(existingInstDefault(tx));
    }
  }, [tx]);

  function existingInstDefault(t: any): DeleteScope {
    const anyPaid = (t?.installments ?? []).some((i: any) => i.paid);
    return anyPaid ? "force_all" : "all";
  }


  const existingInst = (tx?.installments ?? []) as any[];
  const paidCount = existingInst.filter((i: any) => i.paid).length;
  const hasPaid = paidCount > 0;
  const totalAmt = parseFloat(amount.replace(",", ".")) || 0;
  const numInst = Math.max(1, parseInt(installments) || 1);
  const perInst = numInst > 1 ? totalAmt / numInst : totalAmt;

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !purchaseId) return;
      setSaving(true);
      try {
        const payload: Record<string, any> = {};
        if (description !== tx.description) payload.description = description;
        if (totalAmt !== Number(tx.amount)) payload.amount = totalAmt;
        if (date !== tx.date) payload.date = date;
        const normalizedCard = cardId === "none" ? null : (cardId || null);
        if (normalizedCard !== tx.credit_card_id) payload.credit_card_id = normalizedCard;
        const normalizedCat = categoryId === "none" ? null : (categoryId || null);
        if (normalizedCat !== tx.category_id) payload.category_id = normalizedCat;
        const normalizedInst = numInst > 1 ? numInst : null;
        if (normalizedInst !== tx.total_installments) payload.total_installments = normalizedInst;
        if (visibility !== tx.visibility) payload.visibility = visibility;
        const normalizedNotes = notes || null;
        if (normalizedNotes !== tx.note) payload.note = normalizedNotes;

        if (Object.keys(payload).length > 0) {
          payload.updated_at = new Date().toISOString();
          const { error } = await supabase
            .from("transactions")
            .update(payload as never)
            .eq("id", purchaseId);
          if (error) throw error;
        }

        const amtChanged = tx.amount !== totalAmt;
        const instChanged = tx.total_installments !== numInst;
        const shouldUpdateInst = amtChanged || instChanged;

        // Recalculate installments if needed
        if (shouldUpdateInst && numInst > 1 && existingInst.length > 0 && editScope !== "single") {
          const sorted = [...existingInst].sort(
            (a, b) => a.installment_number - b.installment_number
          );

          if (editScope === "all") {
            // Update all installments — preserve paid ones' status
            for (const inst of sorted) {
              await supabase
                .from("installments")
                .update({
                  amount: perInst,
                  total_installments: numInst,
                })
                .eq("id", inst.id);
            }
          } else if (editScope === "future") {
            // Only update unpaid installments
            for (const inst of sorted) {
              if (!inst.paid) {
                await supabase
                  .from("installments")
                  .update({
                    amount: perInst,
                    total_installments: numInst,
                  })
                  .eq("id", inst.id);
              }
            }
          }
        }

        toast.success("Compra atualizada!");
        invalidateAll(qc);
        onOpenChange(false);
      } catch (err: any) {
        console.error("[card-edit] save error:", err);
        toast.error(`Erro: ${err.message}`);
      } finally {
        setSaving(false);
      }
    },
    [
      user,
      purchaseId,
      description,
      totalAmt,
      date,
      cardId,
      categoryId,
      numInst,
      visibility,
      notes,
      editScope,
      existingInst,
      perInst,
      tx,
      qc,
      onOpenChange,
    ]
  );

  const executeDefinitiveDelete = useCallback(
    async (force: boolean) => {
      if (!user || !purchaseId) return;
      setDeleting(true);
      try {
        await deleteCardPurchaseCompletely({
          purchaseId,
          force,
          queryClient: qc,
        });
        toast.success("Compra excluída com sucesso!");
        setStrongConfirmOpen(false);
        setConfirmDelete(false);
        onOpenChange(false);
      } catch (err: any) {
        if (
          err instanceof HasPaidPaymentsError ||
          err?.code === "23514" ||
          err?.message?.includes("já registrados como pagos")
        ) {
          setStrongConfirmOpen(true);
        } else {
          console.error("[card-edit] delete error:", err);
          toast.error(`Erro: ${err.message}`);
        }
      } finally {
        setDeleting(false);
      }
    },
    [user, purchaseId, qc, onOpenChange]
  );

  const handleDelete = useCallback(async () => {
    if (!user || !purchaseId) return;

    if (deleteScope === "force_all") {
      setStrongConfirmOpen(true);
      return;
    }

    if (deleteScope === "all") {
      if (hasPaid) {
        setStrongConfirmOpen(true);
        return;
      }
      await executeDefinitiveDelete(false);
      return;
    }

    if (deleteScope === "cancel") {
      setDeleting(true);
      try {
        await supabase
          .from("installments")
          .delete()
          .eq("transaction_id", purchaseId)
          .eq("paid", false);
        const { error } = await supabase
          .from("transactions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() } as never)
          .eq("id", purchaseId);
        if (error) throw error;
        toast.success("Compra cancelada. Parcelas pagas mantidas no histórico.");
        invalidateAllCardQueries(qc);
        onOpenChange(false);
      } catch (err: any) {
        console.error("[card-edit] cancel error:", err);
        toast.error(`Erro: ${err.message}`);
      } finally {
        setDeleting(false);
        setConfirmDelete(false);
      }
      return;
    }

    if (deleteScope === "future") {
      setDeleting(true);
      try {
        const remaining = existingInst.filter((i: any) => i.paid).length;
        await supabase
          .from("installments")
          .delete()
          .eq("transaction_id", purchaseId)
          .eq("paid", false);
        const newAmount = existingInst
          .filter((i: any) => i.paid)
          .reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0);
        const { error } = await supabase
          .from("transactions")
          .update({
            total_installments: remaining || null,
            amount: newAmount || Number(tx.amount),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", purchaseId);
        if (error) throw error;
        toast.success("Parcelas futuras removidas.");
        invalidateAllCardQueries(qc);
        onOpenChange(false);
      } catch (err: any) {
        console.error("[card-edit] delete future error:", err);
        toast.error(`Erro: ${err.message}`);
      } finally {
        setDeleting(false);
        setConfirmDelete(false);
      }
      return;
    }
  }, [
    user,
    purchaseId,
    deleteScope,
    hasPaid,
    executeDefinitiveDelete,
    existingInst,
    tx,
    qc,
    onOpenChange,
  ]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 shadow-xl sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" />
            {tx ? "Editar compra do cartão" : "Carregando..."}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Altere os dados da compra. Parcelas pagas são preservadas por
            padrão.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-6 space-y-3">
            <AlertTriangle className="size-8 mx-auto text-destructive" />
            <p className="text-sm text-destructive font-medium">
              Erro ao carregar a compra
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
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                placeholder="Ex: Sofá novo"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valor total</Label>
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
                <Label className="text-xs">Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={48}
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {numInst > 1 && totalAmt > 0 && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-xl p-2.5">
                {numInst}x de <b>{formatBRL(perInst)}</b> · Total{" "}
                {formatBRL(totalAmt)}
                {hasPaid && (
                  <span className="text-orange-500 ml-2">
                    ({paidCount} parcela{paidCount > 1 ? "s" : ""} já paga
                    {paidCount > 1 ? "s" : ""})
                  </span>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">Data da compra</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Cartão</Label>
              <Select value={cardId || "none"} onValueChange={(v) => setCardId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione</SelectItem>
                  {cards.filter((c: any) => c.id).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  {!!cardId && !cards.find((c: any) => c.id === cardId) && (
                    <SelectItem value={cardId}>Cartão Excluído</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {cats.filter((c: any) => c.id).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  {!!categoryId && !cats.find((c: any) => c.id === categoryId) && (
                    <SelectItem value={categoryId}>Categoria Desconhecida</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Edit scope for installments */}
            {existingInst.length > 1 && (
              <div>
                <Label className="text-xs">Escopo da edição</Label>
                <Select
                  value={editScope}
                  onValueChange={(v) => setEditScope(v as EditScope)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toda a compra</SelectItem>
                    <SelectItem value="future">
                      Somente parcelas futuras
                    </SelectItem>
                    <SelectItem value="single">
                      Somente dados principais
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Espaço */}
            {coupleId && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">
                    {visibility === "shared" ? "Nosso Espaço" : "Meu Espaço"}
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
                    "Confirmar"
                  )}
                </Button>
              )}
            </div>

            {confirmDelete && (
              <div className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive space-y-2">
                <div>
                  <Label className="text-xs text-destructive font-medium">Modo de exclusão</Label>
                  <Select value={deleteScope} onValueChange={(v) => setDeleteScope(v as any)}>
                    <SelectTrigger className="mt-1 bg-background text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hasPaid ? (
                        <>
                          <SelectItem value="force_all" className="text-destructive font-semibold">
                            Excluir toda a compra e desfazer pagamentos
                          </SelectItem>
                          <SelectItem value="future">
                            Somente parcelas futuras (mantém pagas)
                          </SelectItem>
                          <SelectItem value="cancel">
                            Cancelar compra (mantém histórico)
                          </SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="all">
                            Excluir toda a compra
                          </SelectItem>
                          {existingInst.length > 1 && (
                            <SelectItem value="future">
                              Somente parcelas futuras
                            </SelectItem>
                          )}
                          <SelectItem value="cancel">
                            Cancelar compra (mantém histórico)
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-start gap-1">
                  <AlertTriangle className="size-4 inline shrink-0 mt-0.5" />
                  <span>
                    {deleteScope === "cancel"
                      ? "A compra será marcada como cancelada. Parcelas pagas permanecem no histórico."
                      : deleteScope === "future"
                      ? "Somente as parcelas ainda não pagas serão removidas."
                      : deleteScope === "force_all" || hasPaid
                      ? "Irá desfazer os pagamentos vinculados, remover parcelas e recalcular as faturas e o limite do cartão."
                      : "A compra e todas as parcelas serão excluídas permanentemente."}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    className="ml-auto text-xs h-6"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </form>
        ) : null}
      </DialogContent>
    </Dialog>

    <Dialog open={strongConfirmOpen} onOpenChange={setStrongConfirmOpen}>
      <DialogContent className="rounded-3xl border-0 shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            Esta compra possui valores já registrados como pagos.
          </DialogTitle>
          <DialogDescription className="text-sm pt-2 text-foreground/80 leading-relaxed">
            A exclusão definitiva irá desfazer os pagamentos relacionados, remover as parcelas e recalcular as faturas e o limite do cartão.
            <br /><br />
            Deseja continuar?
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-xl h-11"
            onClick={() => setStrongConfirmOpen(false)}
            disabled={deleting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1 rounded-xl h-11"
            disabled={deleting}
            onClick={() => executeDefinitiveDelete(true)}
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : "Excluir definitivamente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
