-- 1. Refinar a prioridade de status das faturas de cartão
CREATE OR REPLACE FUNCTION public.recalculate_card_invoice_totals(p_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice RECORD;
  v_card RECORD;
  v_cycle_start DATE;
  v_cycle_end DATE;
  v_cash_total NUMERIC := 0;
  v_inst_total NUMERIC := 0;
  v_total NUMERIC := 0;
  v_new_status TEXT;
  v_paid NUMERIC;
BEGIN
  SELECT * INTO v_invoice FROM public.card_invoices WHERE id = p_invoice_id;
  IF v_invoice IS NULL THEN RETURN; END IF;

  SELECT * INTO v_card FROM public.credit_cards WHERE id = v_invoice.card_id;

  v_cycle_end := v_invoice.closing_date - INTERVAL '1 day';
  v_cycle_start := (v_invoice.reference_month - INTERVAL '1 month')::DATE + (v_card.closing_day - 1);

  -- Sum of cash purchases matching the cycle
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_total
  FROM public.transactions
  WHERE credit_card_id = v_invoice.card_id
    AND type = 'expense'
    AND total_installments IS NULL
    AND is_card_payment = false
    AND date >= v_cycle_start
    AND date <= v_cycle_end;

  -- Sum of installments matching the invoice due_date month
  SELECT COALESCE(SUM(i.amount), 0) INTO v_inst_total
  FROM public.installments i
  JOIN public.transactions t ON t.id = i.transaction_id
  WHERE t.credit_card_id = v_invoice.card_id
    AND t.type = 'expense'
    AND t.is_card_payment = false
    AND i.due_date >= date_trunc('month', v_invoice.due_date)
    AND i.due_date < (date_trunc('month', v_invoice.due_date) + INTERVAL '1 month');

  v_total := v_cash_total + v_inst_total;
  v_paid := COALESCE(v_invoice.paid_amount, 0);

  IF v_paid >= v_total AND v_total > 0 THEN
    v_new_status := 'paid';
  ELSIF CURRENT_DATE > v_invoice.due_date THEN
    v_new_status := 'overdue';
  ELSIF CURRENT_DATE = v_invoice.due_date THEN
    v_new_status := 'due';
  ELSIF v_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSIF CURRENT_DATE >= v_invoice.closing_date THEN
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

-- 2. Criar RPC para atualizar faturas passadas (útil para rodar diariamente ou on-mount)
CREATE OR REPLACE FUNCTION public.update_my_invoice_statuses()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv_id UUID;
BEGIN
  -- Percorrer todas as faturas do usuário logado (ou casal logado) que não estão pagas/canceladas
  FOR v_inv_id IN
    SELECT i.id 
    FROM public.card_invoices i
    WHERE (i.user_id = auth.uid() OR (i.couple_id IS NOT NULL AND public.is_couple_member(i.couple_id)))
      AND i.status NOT IN ('paid', 'cancelled')
  LOOP
    PERFORM public.recalculate_card_invoice_totals(v_inv_id);
  END LOOP;
END;
$$;
