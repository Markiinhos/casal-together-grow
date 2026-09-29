-- Migration: delete_card_purchase_completely, updated recalculate_card_invoice_totals and audit_and_cleanup_card_orphans

-- 1. Atualizar recalculate_card_invoice_totals para tratar status <> cancelled e faturas zeradas
CREATE OR REPLACE FUNCTION public.recalculate_card_invoice_totals(p_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice RECORD;
  v_card RECORD;
  v_prev_closing DATE;
  v_prev_year INT;
  v_prev_month INT;
  v_prev_last_day INT;
  v_cash_total NUMERIC := 0;
  v_inst_total NUMERIC := 0;
  v_total NUMERIC := 0;
  v_new_status TEXT;
  v_paid NUMERIC;
BEGIN
  SELECT * INTO v_invoice FROM public.card_invoices WHERE id = p_invoice_id;
  IF v_invoice IS NULL THEN RETURN; END IF;

  SELECT * INTO v_card FROM public.credit_cards WHERE id = v_invoice.card_id;

  -- Fechamento anterior para determinar início do ciclo de compras à vista
  IF EXTRACT(MONTH FROM v_invoice.closing_date)::int = 1 THEN
    v_prev_year := EXTRACT(YEAR FROM v_invoice.closing_date)::int - 1;
    v_prev_month := 12;
  ELSE
    v_prev_year := EXTRACT(YEAR FROM v_invoice.closing_date)::int;
    v_prev_month := EXTRACT(MONTH FROM v_invoice.closing_date)::int - 1;
  END IF;
  v_prev_last_day := EXTRACT(DAY FROM (make_date(v_prev_year, v_prev_month, 1) + INTERVAL '1 month - 1 day'))::int;
  v_prev_closing := make_date(v_prev_year, v_prev_month, LEAST(COALESCE(v_card.closing_day, 1), v_prev_last_day));

  -- Compras à vista não canceladas
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_total
  FROM public.transactions
  WHERE credit_card_id = v_invoice.card_id
    AND type = 'expense'
    AND total_installments IS NULL
    AND is_card_payment = false
    AND COALESCE(status, '') <> 'cancelled'
    AND date > v_prev_closing
    AND date <= v_invoice.closing_date;

  -- Parcelas vinculadas a este mês de vencimento da fatura e não canceladas
  SELECT COALESCE(SUM(i.amount), 0) INTO v_inst_total
  FROM public.installments i
  JOIN public.transactions t ON t.id = i.transaction_id
  WHERE t.credit_card_id = v_invoice.card_id
    AND t.type = 'expense'
    AND t.is_card_payment = false
    AND COALESCE(t.status, '') <> 'cancelled'
    AND i.due_date >= date_trunc('month', v_invoice.due_date)
    AND i.due_date < (date_trunc('month', v_invoice.due_date) + INTERVAL '1 month');

  v_total := v_cash_total + v_inst_total + COALESCE(v_invoice.manual_adjustment, 0);
  v_paid := COALESCE(v_invoice.paid_amount, 0);

  -- Se a fatura estiver totalmente vazia e sem pagamentos registrados, remove a linha para não deixar resíduo órfão
  IF v_cash_total = 0 AND v_inst_total = 0 AND COALESCE(v_invoice.manual_adjustment, 0) = 0 AND v_paid = 0 THEN
    DELETE FROM public.card_invoices WHERE id = p_invoice_id;
    RETURN;
  END IF;

  IF v_total <= 0 AND v_paid <= 0 THEN
    v_new_status := 'open';
  ELSIF v_paid >= v_total AND v_total > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSIF CURRENT_DATE > v_invoice.due_date THEN
    v_new_status := 'overdue';
  ELSIF CURRENT_DATE = v_invoice.due_date THEN
    v_new_status := 'due';
  ELSIF CURRENT_DATE > v_invoice.closing_date THEN
    v_new_status := 'closed';
  ELSE
    v_new_status := 'open';
  END IF;

  UPDATE public.card_invoices
  SET total_amount = v_total,
      status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE v_new_status END,
      updated_at = now()
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_card_invoice_totals(UUID) TO authenticated;

-- 2. Função transacional atômica para exclusão definitiva de compra do cartão
CREATE OR REPLACE FUNCTION public.delete_card_purchase_completely(
  p_purchase_id UUID,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase RECORD;
  v_card RECORD;
  v_total_inst_count INT := 0;
  v_paid_inst_count INT := 0;
  v_has_payments BOOLEAN := false;
  v_affected_invoice_ids UUID[] := ARRAY[]::UUID[];
  v_inv_id UUID;
  v_inv RECORD;
  v_prev_closing DATE;
  v_prev_year INT;
  v_prev_month INT;
  v_prev_last_day INT;
  v_other_inst_sum NUMERIC := 0;
  v_other_inst_count INT := 0;
  v_other_cash_sum NUMERIC := 0;
  v_other_cash_count INT := 0;
  v_other_total NUMERIC := 0;
  v_pay_tx RECORD;
  v_excess NUMERIC := 0;
  v_payments_removed INT := 0;
  v_installments_deleted INT := 0;
  v_invoices_recalculated INT := 0;
  v_invoices_deleted INT := 0;
  v_remaining_inst INT := 0;
  v_remaining_cash INT := 0;
BEGIN
  -- 1. Validar autenticação
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- 2. Localizar compra e travar linha para atualização
  SELECT * INTO v_purchase
  FROM public.transactions
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF v_purchase IS NULL THEN
    RAISE EXCEPTION 'Compra não encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Validar permissões (usuário proprietário ou membro do casal)
  IF NOT (
    v_purchase.user_id = auth.uid() OR
    (v_purchase.couple_id IS NOT NULL AND public.is_couple_member(v_purchase.couple_id))
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir esta compra' USING ERRCODE = '42501';
  END IF;

  -- Se não for compra de cartão, apenas remove de transactions e installments
  IF v_purchase.credit_card_id IS NULL THEN
    DELETE FROM public.installments WHERE transaction_id = p_purchase_id;
    GET DIAGNOSTICS v_installments_deleted = ROW_COUNT;
    DELETE FROM public.transactions WHERE id = p_purchase_id;
    RETURN jsonb_build_object(
      'success', true,
      'purchase_deleted', true,
      'installments_deleted', v_installments_deleted,
      'payments_removed', 0,
      'invoices_recalculated', 0,
      'invoices_deleted', 0
    );
  END IF;

  SELECT * INTO v_card FROM public.credit_cards WHERE id = v_purchase.credit_card_id;

  -- 4. Identificar parcelas
  SELECT COUNT(*), COUNT(*) FILTER (WHERE paid = true)
  INTO v_total_inst_count, v_paid_inst_count
  FROM public.installments
  WHERE transaction_id = p_purchase_id;

  IF v_paid_inst_count > 0 THEN
    v_has_payments := true;
  END IF;

  -- 5. Identificar todas as faturas afetadas
  SELECT array_agg(DISTINCT inv.id)
  INTO v_affected_invoice_ids
  FROM public.card_invoices inv
  WHERE inv.card_id = v_purchase.credit_card_id
    AND (
      EXISTS (
        SELECT 1 FROM public.installments i
        WHERE i.transaction_id = p_purchase_id
          AND (
            inv.reference_month = date_trunc('month', i.due_date)::date
            OR (i.due_date >= date_trunc('month', inv.due_date) AND i.due_date < (date_trunc('month', inv.due_date) + INTERVAL '1 month'))
          )
      )
      OR (
        v_purchase.total_installments IS NULL
        AND (
          inv.reference_month = date_trunc('month', v_purchase.date)::date
          OR (v_purchase.date <= inv.closing_date AND inv.closing_date >= v_purchase.date)
        )
      )
    );

  IF v_affected_invoice_ids IS NULL THEN
    v_affected_invoice_ids := ARRAY[]::UUID[];
  END IF;

  -- Verificar se alguma fatura afetada possui pagamentos registrados
  IF array_length(v_affected_invoice_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.card_invoices
      WHERE id = ANY(v_affected_invoice_ids) AND paid_amount > 0
    ) OR EXISTS (
      SELECT 1 FROM public.transactions
      WHERE is_card_payment = true AND (
        (source LIKE 'card_invoice_payment:%' AND split_part(source, ':', 2)::uuid = ANY(v_affected_invoice_ids))
        OR id IN (SELECT payment_transaction_id FROM public.card_invoices WHERE id = ANY(v_affected_invoice_ids) AND payment_transaction_id IS NOT NULL)
      )
    ) THEN
      v_has_payments := true;
    END IF;
  END IF;

  -- 6. Se possuir pagamentos e p_force for false, solicitar confirmação explícita
  IF v_has_payments AND NOT p_force THEN
    RAISE EXCEPTION 'Esta compra possui valores já registrados como pagos. Confirme a exclusão definitiva para desfazer os pagamentos e recalcular.'
    USING ERRCODE = '23514';
  END IF;

  -- 7. Desfazer pagamentos vinculados às faturas afetadas antes de remover a compra
  FOREACH v_inv_id IN ARRAY v_affected_invoice_ids
  LOOP
    SELECT * INTO v_inv FROM public.card_invoices WHERE id = v_inv_id FOR UPDATE;
    IF v_inv IS NULL THEN CONTINUE; END IF;

    -- Fechamento anterior para compras à vista
    IF EXTRACT(MONTH FROM v_inv.closing_date)::int = 1 THEN
      v_prev_year := EXTRACT(YEAR FROM v_inv.closing_date)::int - 1;
      v_prev_month := 12;
    ELSE
      v_prev_year := EXTRACT(YEAR FROM v_inv.closing_date)::int;
      v_prev_month := EXTRACT(MONTH FROM v_inv.closing_date)::int - 1;
    END IF;
    v_prev_last_day := EXTRACT(DAY FROM (make_date(v_prev_year, v_prev_month, 1) + INTERVAL '1 month - 1 day'))::int;
    v_prev_closing := make_date(v_prev_year, v_prev_month, LEAST(COALESCE(v_card.closing_day, 1), v_prev_last_day));

    -- Verificar outros itens na fatura (que NÃO sejam desta compra)
    SELECT COALESCE(SUM(i.amount), 0), COUNT(i.id)
    INTO v_other_inst_sum, v_other_inst_count
    FROM public.installments i
    JOIN public.transactions t ON t.id = i.transaction_id
    WHERE t.credit_card_id = v_inv.card_id
      AND t.type = 'expense'
      AND t.is_card_payment = false
      AND COALESCE(t.status, '') <> 'cancelled'
      AND t.id <> p_purchase_id
      AND i.due_date >= date_trunc('month', v_inv.due_date)
      AND i.due_date < (date_trunc('month', v_inv.due_date) + INTERVAL '1 month');

    SELECT COALESCE(SUM(t.amount), 0), COUNT(t.id)
    INTO v_other_cash_sum, v_other_cash_count
    FROM public.transactions t
    WHERE t.credit_card_id = v_inv.card_id
      AND t.type = 'expense'
      AND t.total_installments IS NULL
      AND t.is_card_payment = false
      AND COALESCE(t.status, '') <> 'cancelled'
      AND t.id <> p_purchase_id
      AND t.date > v_prev_closing
      AND t.date <= v_inv.closing_date;

    v_other_total := v_other_inst_sum + v_other_cash_sum + COALESCE(v_inv.manual_adjustment, 0);

    -- Caso A: a fatura não possui nenhum outro lançamento (apenas esta compra)
    IF v_other_inst_count = 0 AND v_other_cash_count = 0 AND COALESCE(v_inv.manual_adjustment, 0) = 0 THEN
      -- Remover todos os lançamentos de pagamento vinculados a esta fatura
      FOR v_pay_tx IN
        SELECT * FROM public.transactions
        WHERE is_card_payment = true
          AND (
            source LIKE 'card_invoice_payment:' || v_inv_id::text || ':%'
            OR id = v_inv.payment_transaction_id
          )
      LOOP
        DELETE FROM public.transactions WHERE id = v_pay_tx.id;
        v_payments_removed := v_payments_removed + 1;
      END LOOP;

      UPDATE public.card_invoices
      SET paid_amount = 0,
          payment_transaction_id = NULL,
          paid_at = NULL,
          updated_at = now()
      WHERE id = v_inv_id;

    -- Caso B: existem outros lançamentos mantidos na fatura
    ELSE
      -- Se o valor pago for maior que o novo total dos outros lançamentos, remove o excesso
      IF COALESCE(v_inv.paid_amount, 0) > v_other_total THEN
        v_excess := COALESCE(v_inv.paid_amount, 0) - v_other_total;

        FOR v_pay_tx IN
          SELECT * FROM public.transactions
          WHERE is_card_payment = true
            AND (
              source LIKE 'card_invoice_payment:' || v_inv_id::text || ':%'
              OR id = v_inv.payment_transaction_id
            )
          ORDER BY created_at DESC
        LOOP
          IF v_excess <= 0 THEN EXIT; END IF;

          IF v_pay_tx.amount <= v_excess THEN
            DELETE FROM public.transactions WHERE id = v_pay_tx.id;
            v_excess := v_excess - v_pay_tx.amount;
            v_payments_removed := v_payments_removed + 1;
          ELSE
            UPDATE public.transactions
            SET amount = v_pay_tx.amount - v_excess,
                updated_at = now()
            WHERE id = v_pay_tx.id;
            v_excess := 0;
          END IF;
        END LOOP;

        UPDATE public.card_invoices
        SET paid_amount = GREATEST(0, v_other_total),
            updated_at = now()
        WHERE id = v_inv_id;
      END IF;
    END IF;
  END LOOP;

  -- 8. Remover parcelas da compra
  DELETE FROM public.installments
  WHERE transaction_id = p_purchase_id;
  GET DIAGNOSTICS v_installments_deleted = ROW_COUNT;

  -- 9. Remover transação original da compra
  DELETE FROM public.transactions
  WHERE id = p_purchase_id;

  -- 10. Reconciliar faturas afetadas
  FOREACH v_inv_id IN ARRAY v_affected_invoice_ids
  LOOP
    SELECT * INTO v_inv FROM public.card_invoices WHERE id = v_inv_id;
    IF v_inv IS NULL THEN CONTINUE; END IF;

    -- Fechamento anterior para compras à vista
    IF EXTRACT(MONTH FROM v_inv.closing_date)::int = 1 THEN
      v_prev_year := EXTRACT(YEAR FROM v_inv.closing_date)::int - 1;
      v_prev_month := 12;
    ELSE
      v_prev_year := EXTRACT(YEAR FROM v_inv.closing_date)::int;
      v_prev_month := EXTRACT(MONTH FROM v_inv.closing_date)::int - 1;
    END IF;
    v_prev_last_day := EXTRACT(DAY FROM (make_date(v_prev_year, v_prev_month, 1) + INTERVAL '1 month - 1 day'))::int;
    v_prev_closing := make_date(v_prev_year, v_prev_month, LEAST(COALESCE(v_card.closing_day, 1), v_prev_last_day));

    -- Contagem de itens remanescentes
    SELECT COUNT(i.id) INTO v_remaining_inst
    FROM public.installments i
    JOIN public.transactions t ON t.id = i.transaction_id
    WHERE t.credit_card_id = v_inv.card_id
      AND t.type = 'expense'
      AND t.is_card_payment = false
      AND COALESCE(t.status, '') <> 'cancelled'
      AND i.due_date >= date_trunc('month', v_inv.due_date)
      AND i.due_date < (date_trunc('month', v_inv.due_date) + INTERVAL '1 month');

    SELECT COUNT(t.id) INTO v_remaining_cash
    FROM public.transactions t
    WHERE t.credit_card_id = v_inv.card_id
      AND t.type = 'expense'
      AND t.total_installments IS NULL
      AND t.is_card_payment = false
      AND COALESCE(t.status, '') <> 'cancelled'
      AND t.date > v_prev_closing
      AND t.date <= v_inv.closing_date;

    -- Se não sobrou nenhum item, ajuste ou pagamento: remove a fatura vazia
    IF v_remaining_inst = 0 AND v_remaining_cash = 0 AND COALESCE(v_inv.manual_adjustment, 0) = 0 AND COALESCE(v_inv.paid_amount, 0) = 0 THEN
      -- Limpa eventuais referências de pagamentos residuais
      DELETE FROM public.transactions
      WHERE is_card_payment = true AND (
        source LIKE 'card_invoice_payment:' || v_inv_id::text || ':%'
        OR id = v_inv.payment_transaction_id
      );
      DELETE FROM public.card_invoices WHERE id = v_inv_id;
      v_invoices_deleted := v_invoices_deleted + 1;
    ELSE
      -- Recalcula faturas que ainda possuem lançamentos
      PERFORM public.recalculate_card_invoice_totals(v_inv_id);
      v_invoices_recalculated := v_invoices_recalculated + 1;
    END IF;
  END LOOP;

  -- 11. Retorno estruturado conforme requisitos
  RETURN jsonb_build_object(
    'success', true,
    'purchase_deleted', true,
    'installments_deleted', v_installments_deleted,
    'payments_removed', v_payments_removed,
    'invoices_recalculated', v_invoices_recalculated,
    'invoices_deleted', v_invoices_deleted
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_card_purchase_completely(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_card_purchase_completely(UUID, BOOLEAN) TO authenticated;

-- 3. Auditoria e limpeza de órfãos residuais
CREATE OR REPLACE FUNCTION public.audit_and_cleanup_card_orphans()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orphan_inst INT := 0;
  v_orphan_payments INT := 0;
  v_empty_invoices INT := 0;
  v_recalculated INT := 0;
  v_inv_rec RECORD;
  v_card RECORD;
  v_prev_closing DATE;
  v_prev_year INT;
  v_prev_month INT;
  v_prev_last_day INT;
  v_items_count INT := 0;
BEGIN
  -- 1. Parcelas órfãs sem transação vinculada
  DELETE FROM public.installments
  WHERE transaction_id NOT IN (SELECT id FROM public.transactions);
  GET DIAGNOSTICS v_orphan_inst = ROW_COUNT;

  -- 2. Transações de pagamento de fatura apontando para faturas inexistentes
  DELETE FROM public.transactions
  WHERE is_card_payment = true
    AND source LIKE 'card_invoice_payment:%'
    AND split_part(source, ':', 2)::uuid NOT IN (SELECT id FROM public.card_invoices);
  GET DIAGNOSTICS v_orphan_payments = ROW_COUNT;

  -- 3. Limpar payment_transaction_id órfãos nas faturas
  UPDATE public.card_invoices
  SET payment_transaction_id = NULL
  WHERE payment_transaction_id IS NOT NULL
    AND payment_transaction_id NOT IN (SELECT id FROM public.transactions);

  -- 4. Faturas vazias sem nenhum item e sem pagamento
  FOR v_inv_rec IN
    SELECT ci.id, ci.card_id, ci.closing_date, ci.due_date, ci.paid_amount, ci.manual_adjustment
    FROM public.card_invoices ci
  LOOP
    SELECT * INTO v_card FROM public.credit_cards WHERE id = v_inv_rec.card_id;

    IF EXTRACT(MONTH FROM v_inv_rec.closing_date)::int = 1 THEN
      v_prev_year := EXTRACT(YEAR FROM v_inv_rec.closing_date)::int - 1;
      v_prev_month := 12;
    ELSE
      v_prev_year := EXTRACT(YEAR FROM v_inv_rec.closing_date)::int;
      v_prev_month := EXTRACT(MONTH FROM v_inv_rec.closing_date)::int - 1;
    END IF;
    v_prev_last_day := EXTRACT(DAY FROM (make_date(v_prev_year, v_prev_month, 1) + INTERVAL '1 month - 1 day'))::int;
    v_prev_closing := make_date(v_prev_year, v_prev_month, LEAST(COALESCE(v_card.closing_day, 1), v_prev_last_day));

    SELECT COUNT(*) INTO v_items_count
    FROM (
      SELECT i.id
      FROM public.installments i
      JOIN public.transactions t ON t.id = i.transaction_id
      WHERE t.credit_card_id = v_inv_rec.card_id
        AND t.type = 'expense'
        AND t.is_card_payment = false
        AND COALESCE(t.status, '') <> 'cancelled'
        AND i.due_date >= date_trunc('month', v_inv_rec.due_date)
        AND i.due_date < (date_trunc('month', v_inv_rec.due_date) + INTERVAL '1 month')
      UNION ALL
      SELECT t.id
      FROM public.transactions t
      WHERE t.credit_card_id = v_inv_rec.card_id
        AND t.type = 'expense'
        AND t.total_installments IS NULL
        AND t.is_card_payment = false
        AND COALESCE(t.status, '') <> 'cancelled'
        AND t.date > v_prev_closing
        AND t.date <= v_inv_rec.closing_date
    ) s;

    IF v_items_count = 0 AND COALESCE(v_inv_rec.paid_amount, 0) = 0 AND COALESCE(v_inv_rec.manual_adjustment, 0) = 0 THEN
      DELETE FROM public.card_invoices WHERE id = v_inv_rec.id;
      v_empty_invoices := v_empty_invoices + 1;
    ELSE
      PERFORM public.recalculate_card_invoice_totals(v_inv_rec.id);
      v_recalculated := v_recalculated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'orphan_installments_deleted', v_orphan_inst,
    'orphan_payments_deleted', v_orphan_payments,
    'empty_invoices_deleted', v_empty_invoices,
    'invoices_recalculated', v_recalculated
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_and_cleanup_card_orphans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_and_cleanup_card_orphans() TO authenticated;
