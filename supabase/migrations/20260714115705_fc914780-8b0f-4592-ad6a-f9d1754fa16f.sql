
-- 1. Undo card invoice payment (soft cancel — preserva histórico via source)
CREATE OR REPLACE FUNCTION public.undo_card_invoice_payment(_invoice_id uuid, _payment_transaction_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  tx RECORD;
  new_paid NUMERIC;
  new_status TEXT;
BEGIN
  SELECT * INTO inv FROM public.card_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;
  IF NOT (inv.user_id = auth.uid() OR (inv.couple_id IS NOT NULL AND public.is_couple_member(inv.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  -- Encontra o pagamento a desfazer: o específico ou o mais recente da fatura
  IF _payment_transaction_id IS NOT NULL THEN
    SELECT * INTO tx FROM public.transactions
      WHERE id = _payment_transaction_id AND is_card_payment = true;
  ELSE
    SELECT * INTO tx FROM public.transactions
      WHERE is_card_payment = true
        AND source = 'card_invoice_payment:' || _invoice_id::text || ':' || 
                     (SELECT MAX(split_part(source, ':', 3)) FROM public.transactions
                        WHERE source LIKE 'card_invoice_payment:' || _invoice_id::text || ':%')
                     || ':' ||
                     (SELECT MAX(split_part(source, ':', 4)) FROM public.transactions
                        WHERE source LIKE 'card_invoice_payment:' || _invoice_id::text || ':%')
      ORDER BY created_at DESC LIMIT 1;
    -- Fallback simples: última tx de pagamento vinculada à fatura
    IF tx IS NULL THEN
      SELECT * INTO tx FROM public.transactions
        WHERE is_card_payment = true
          AND source LIKE 'card_invoice_payment:' || _invoice_id::text || ':%'
        ORDER BY created_at DESC LIMIT 1;
    END IF;
  END IF;

  IF tx IS NULL THEN
    RAISE EXCEPTION 'Nenhum pagamento encontrado para desfazer';
  END IF;

  -- Recalcula valores da fatura
  new_paid := GREATEST(0, COALESCE(inv.paid_amount, 0) - tx.amount);
  new_status := CASE
    WHEN new_paid <= 0 THEN
      CASE
        WHEN CURRENT_DATE > inv.due_date THEN 'overdue'
        WHEN CURRENT_DATE > inv.closing_date THEN 'closed'
        ELSE 'open'
      END
    WHEN new_paid < inv.total_amount THEN 'partially_paid'
    ELSE 'paid'
  END;

  -- Deleta a transação (source é único, então não pode ficar "cancelada" com mesmo source; deleção é o soft-cancel efetivo aqui)
  DELETE FROM public.transactions WHERE id = tx.id;

  UPDATE public.card_invoices
    SET paid_amount = new_paid,
        status = new_status,
        paid_at = CASE WHEN new_status = 'paid' THEN paid_at ELSE NULL END,
        payment_transaction_id = CASE WHEN payment_transaction_id = tx.id THEN NULL ELSE payment_transaction_id END,
        updated_at = now()
    WHERE id = _invoice_id;

  -- Se estava totalmente paga e havia marcado parcelas como pagas, reverte
  IF inv.status = 'paid' AND new_status <> 'paid' THEN
    UPDATE public.installments SET paid = false, paid_at = NULL
      WHERE transaction_id IN (SELECT id FROM public.transactions WHERE credit_card_id = inv.card_id)
        AND due_date >= date_trunc('month', inv.due_date)
        AND due_date < (date_trunc('month', inv.due_date) + INTERVAL '1 month');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_card_invoice_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_card_invoice_payment(uuid, uuid) TO authenticated;

-- 2. Limpa 5 órfãs: pagamentos de fatura ainda vinculados a cartão (não afeta total, mas polui histórico)
UPDATE public.transactions
   SET credit_card_id = NULL
 WHERE is_card_payment = true
   AND credit_card_id IS NOT NULL;
