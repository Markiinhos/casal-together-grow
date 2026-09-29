import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

export interface DeleteCardPurchaseResult {
  success: boolean;
  purchase_deleted: boolean;
  installments_deleted: number;
  payments_removed: number;
  invoices_recalculated: number;
  invoices_deleted: number;
}

export class HasPaidPaymentsError extends Error {
  constructor(message = "Esta compra possui valores já registrados como pagos.") {
    super(message);
    this.name = "HasPaidPaymentsError";
  }
}

export const ALL_CARD_QUERY_KEYS = [
  "cards",
  "card",
  "cards-edit",
  "card-metrics",
  "card-aggregate",
  "card-invoices",
  "card-invoice-detail",
  "card-invoice-edits",
  "card-purchases",
  "card-history",
  "installments",
  "transactions",
  "recent-txs",
  "home-tx",
  "home-monthly-summary",
  "finance-dashboard",
  "monthly-financial-summary",
  "financial-projection",
  "category-expenses",
  "fin-income",
  "fin-expenses",
  "fin-invoices",
  "fin-accounts",
  "fin-accounts-total",
  "card-purchase-edit",
  "plans",
  "monthly-plans",
  "tx-projecao",
];

export function invalidateAllCardQueries(queryClient: QueryClient) {
  for (const k of ALL_CARD_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [k] });
  }
}

/**
 * Exclui definitivamente uma compra do cartão, suas parcelas e desfaz pagamentos vinculados
 * caso existam.
 *
 * Utiliza prioritariamente a RPC atômica delete_card_purchase_completely.
 * Caso a RPC ainda não esteja no schema cache, executa orquestração equivalente com fallback.
 */
export async function deleteCardPurchaseCompletely({
  purchaseId,
  force = false,
  queryClient,
}: {
  purchaseId: string;
  force?: boolean;
  queryClient?: QueryClient;
}): Promise<DeleteCardPurchaseResult> {
  if (!purchaseId) {
    throw new Error("ID da compra é obrigatório.");
  }

  // 1. Tentar executar a RPC no Supabase
  try {
    const { data, error } = await supabase.rpc("delete_card_purchase_completely" as any, {
      p_purchase_id: purchaseId,
      p_force: force,
    });

    if (error) {
      // Se for a exceção de violação de confirmação (código 23514)
      if (error.code === "23514" || error.message?.includes("já registrados como pagos")) {
        throw new HasPaidPaymentsError(error.message);
      }
      // Se a RPC não foi encontrada no schema cache, lançamos para cair no fallback
      const notFound =
        error.code === "PGRST202" ||
        error.message?.includes("schema cache") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("function delete_card_purchase_completely");
      if (!notFound) {
        throw error;
      }
      console.warn("[deleteCardPurchaseCompletely] RPC não encontrada no schema cache, acionando fallback local seguro.");
    } else if (data) {
      if (queryClient) {
        invalidateAllCardQueries(queryClient);
      }
      return data as DeleteCardPurchaseResult;
    }
  } catch (err: any) {
    if (err instanceof HasPaidPaymentsError) throw err;
    if (err?.code === "23514") throw new HasPaidPaymentsError(err.message);
    if (!err?.message?.includes("schema cache") && !err?.message?.includes("does not exist") && err.code !== "PGRST202") {
      throw err;
    }
  }

  // 2. Orquestração Fallback no Cliente (ordem rigorosa e atômica)
  return await executeClientFallbackDeletion(purchaseId, force, queryClient);
}

async function executeClientFallbackDeletion(
  purchaseId: string,
  force: boolean,
  queryClient?: QueryClient
): Promise<DeleteCardPurchaseResult> {
  // A. Buscar a compra e suas parcelas
  const { data: purchase, error: pErr } = await supabase
    .from("transactions")
    .select("*, installments(*)")
    .eq("id", purchaseId)
    .single();

  if (pErr || !purchase) {
    throw new Error("Compra não encontrada ou já excluída.");
  }

  const installments = (purchase.installments ?? []) as any[];
  const hasPaidInst = installments.some((i: any) => i.paid);
  const cardId = purchase.credit_card_id;

  // Se não for cartão, apenas exclui
  if (!cardId) {
    await supabase.from("installments").delete().eq("transaction_id", purchaseId);
    await supabase.from("transactions").delete().eq("id", purchaseId);
    if (queryClient) invalidateAllCardQueries(queryClient);
    return {
      success: true,
      purchase_deleted: true,
      installments_deleted: installments.length,
      payments_removed: 0,
      invoices_recalculated: 0,
      invoices_deleted: 0,
    };
  }

  // B. Buscar todas as faturas do cartão
  const { data: rawInvoices } = await supabase
    .from("card_invoices")
    .select("*")
    .eq("card_id", cardId);
  const allInvoices = (rawInvoices ?? []) as any[];

  // Localizar faturas afetadas
  const affectedInvoices: any[] = [];
  if (installments.length > 0) {
    for (const inst of installments) {
      const dueMonth = String(inst.due_date).slice(0, 7);
      const match = allInvoices.find(
        (inv) =>
          String(inv.reference_month).startsWith(dueMonth) ||
          String(inv.due_date).startsWith(dueMonth)
      );
      if (match && !affectedInvoices.some((x) => x.id === match.id)) {
        affectedInvoices.push(match);
      }
    }
  } else {
    const pMonth = String(purchase.date).slice(0, 7);
    const match = allInvoices.find(
      (inv) =>
        String(inv.reference_month).startsWith(pMonth) ||
        (purchase.date <= inv.closing_date && inv.closing_date >= purchase.date)
    );
    if (match) affectedInvoices.push(match);
  }

  // Verificar se há pagamentos registrados
  const anyInvoicePaid = affectedInvoices.some((inv) => Number(inv.paid_amount) > 0);
  const hasPayments = hasPaidInst || anyInvoicePaid;

  if (hasPayments && !force) {
    throw new HasPaidPaymentsError(
      "Esta compra possui valores já registrados como pagos. Confirme a exclusão definitiva para desfazer os pagamentos e recalcular."
    );
  }

  let paymentsRemoved = 0;
  let invoicesRecalculated = 0;
  let invoicesDeleted = 0;

  // C. Para cada fatura afetada, auditar outros itens e limpar pagamentos
  for (const inv of affectedInvoices) {
    // Buscar parcelas de outras compras nesta fatura
    const invMonth = String(inv.reference_month || inv.due_date).slice(0, 7);
    const { data: rawOtherInsts = [] } = await supabase
      .from("installments")
      .select("id, amount, transaction_id, transactions!inner(id, credit_card_id, type, is_card_payment)")
      .neq("transaction_id", purchaseId)
      .eq("transactions.credit_card_id", cardId)
      .eq("transactions.is_card_payment", false)
      .gte("due_date", `${invMonth}-01`)
      .lt("due_date", `${invMonth}-31`);

    const otherInsts = (rawOtherInsts ?? []).filter((x: any) => (x.transactions as any)?.status !== "cancelled");

    // Buscar compras à vista de outras compras nesta fatura
    const { data: rawOtherCash = [] } = await supabase
      .from("transactions")
      .select("id, amount")
      .eq("credit_card_id", cardId)
      .eq("type", "expense")
      .is("total_installments", null)
      .eq("is_card_payment", false)
      .neq("id", purchaseId)
      .lte("date", inv.closing_date);

    const otherCash = (rawOtherCash ?? []).filter((x: any) => x.status !== "cancelled");

    const otherItemsCount = (otherInsts?.length || 0) + (otherCash?.length || 0);
    const otherTotal =
      (otherInsts?.reduce((s, i) => s + Number(i.amount || 0), 0) || 0) +
      (otherCash?.reduce((s, c) => s + Number(c.amount || 0), 0) || 0) +
      Number(inv.manual_adjustment || 0);

    // Buscar transações de pagamento desta fatura
    const { data: payTxs = [] } = await supabase
      .from("transactions")
      .select("id, amount")
      .eq("is_card_payment", true)
      .or(`source.like.card_invoice_payment:${inv.id}:%,id.eq.${inv.payment_transaction_id || '00000000-0000-0000-0000-000000000000'}`);

    if (otherItemsCount === 0) {
      // Fatura continha apenas esta compra: remove todos os pagamentos vinculados
      if (payTxs && payTxs.length > 0) {
        const payIds = payTxs.map((t) => t.id);
        await supabase.from("transactions").delete().in("id", payIds);
        paymentsRemoved += payIds.length;
      }

      await supabase
        .from("card_invoices")
        .update({
          paid_amount: 0,
          payment_transaction_id: null,
          paid_at: null,
        } as never)
        .eq("id", inv.id);
    } else {
      // Fatura possui outros lançamentos: remove excesso de pagamentos
      let paidAmt = Number(inv.paid_amount || 0);
      if (paidAmt > otherTotal && payTxs && payTxs.length > 0) {
        let excess = paidAmt - otherTotal;
        for (const ptx of payTxs) {
          if (excess <= 0) break;
          const pVal = Number(ptx.amount || 0);
          if (pVal <= excess) {
            await supabase.from("transactions").delete().eq("id", ptx.id);
            excess -= pVal;
            paymentsRemoved++;
          } else {
            await supabase
              .from("transactions")
              .update({ amount: pVal - excess } as never)
              .eq("id", ptx.id);
            excess = 0;
          }
        }
        await supabase
          .from("card_invoices")
          .update({ paid_amount: Math.max(0, otherTotal) } as never)
          .eq("id", inv.id);
      }
    }
  }

  // D. Deletar parcelas da compra
  const { error: instDelErr } = await supabase
    .from("installments")
    .delete()
    .eq("transaction_id", purchaseId);
  if (instDelErr) throw instDelErr;

  // E. Deletar transação principal da compra
  const { error: txDelErr } = await supabase
    .from("transactions")
    .delete()
    .eq("id", purchaseId);
  if (txDelErr) throw txDelErr;

  // F. Reconciliar faturas afetadas
  for (const inv of affectedInvoices) {
    const invMonth = String(inv.reference_month || inv.due_date).slice(0, 7);
    const { data: rawRemainingInsts = [] } = await supabase
      .from("installments")
      .select("id, amount, transaction_id, transactions!inner(id, credit_card_id)")
      .eq("transactions.credit_card_id", cardId)
      .gte("due_date", `${invMonth}-01`)
      .lt("due_date", `${invMonth}-31`);

    const remainingInsts = (rawRemainingInsts ?? []).filter((x: any) => (x.transactions as any)?.status !== "cancelled");

    const { data: rawRemainingCash = [] } = await supabase
      .from("transactions")
      .select("id, amount")
      .eq("credit_card_id", cardId)
      .eq("type", "expense")
      .is("total_installments", null)
      .lte("date", inv.closing_date);

    const remainingCash = (rawRemainingCash ?? []).filter((x: any) => x.status !== "cancelled");

    const hasAnyRemaining = (remainingInsts?.length || 0) + (remainingCash?.length || 0) > 0;
    const hasAdjustment = Number(inv.manual_adjustment || 0) !== 0;

    if (!hasAnyRemaining && !hasAdjustment) {
      // Limpa transações de pagamento residuais se restaram
      await supabase
        .from("transactions")
        .delete()
        .eq("is_card_payment", true)
        .like("source", `card_invoice_payment:${inv.id}:%`);

      // Deleta fatura vazia
      await supabase.from("card_invoices").delete().eq("id", inv.id);
      invoicesDeleted++;
    } else {
      // Recalcula totais
      try {
        await supabase.rpc("recalculate_card_invoice_totals" as any, {
          p_invoice_id: inv.id,
        });
      } catch {
        const newTotal =
          (remainingInsts?.reduce((s, i) => s + Number(i.amount || 0), 0) || 0) +
          (remainingCash?.reduce((s, c) => s + Number(c.amount || 0), 0) || 0) +
          Number(inv.manual_adjustment || 0);
        await supabase
          .from("card_invoices")
          .update({ total_amount: newTotal } as never)
          .eq("id", inv.id);
      }
      invoicesRecalculated++;
    }
  }

  // G. Tentar acionar limpeza de órfãos residuais
  try {
    await supabase.rpc("audit_and_cleanup_card_orphans" as any);
  } catch {
    // Silencioso se não disponível
  }

  // H. Invalidar queries do cache
  if (queryClient) {
    invalidateAllCardQueries(queryClient);
  }

  return {
    success: true,
    purchase_deleted: true,
    installments_deleted: installments.length,
    payments_removed: paymentsRemoved,
    invoices_recalculated: invoicesRecalculated,
    invoices_deleted: invoicesDeleted,
  };
}
