-- Adds a manual adjustment (juros, multa, desconto, etc.) that the user can
-- set on a card invoice. Unlike total_amount — which is fully recomputed by
-- recalculate_card_invoice_totals every time a linked transaction/installment
-- changes — this column is never touched by that recalculation except to be
-- added into the total, so a value the user sets here survives future syncs.
ALTER TABLE public.card_invoices
  ADD COLUMN IF NOT EXISTS manual_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0;

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

  v_total := v_cash_total + v_inst_total + COALESCE(v_invoice.manual_adjustment, 0);
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

-- Lets the owner (or their couple partner) set a manual adjustment on an
-- invoice and immediately recomputes total_amount/status to reflect it.
CREATE OR REPLACE FUNCTION public.set_invoice_manual_adjustment(_invoice_id UUID, _adjustment NUMERIC)
RETURNS public.card_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.card_invoices;
BEGIN
  SELECT * INTO v_invoice FROM public.card_invoices WHERE id = _invoice_id;
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Fatura não encontrada';
  END IF;
  IF NOT (v_invoice.user_id = auth.uid() OR (v_invoice.couple_id IS NOT NULL AND public.is_couple_member(v_invoice.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão para esta fatura';
  END IF;

  UPDATE public.card_invoices SET manual_adjustment = _adjustment, updated_at = now() WHERE id = _invoice_id;
  PERFORM public.recalculate_card_invoice_totals(_invoice_id);

  SELECT * INTO v_invoice FROM public.card_invoices WHERE id = _invoice_id;
  RETURN v_invoice;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_invoice_manual_adjustment(UUID, NUMERIC) TO authenticated;
