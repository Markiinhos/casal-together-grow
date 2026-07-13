-- 1. ADD account_id TO transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

-- 2. RECALCULATE INVOICES
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
  ELSIF v_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSE
    IF CURRENT_DATE > v_invoice.due_date THEN
      v_new_status := 'overdue';
    ELSIF CURRENT_DATE > v_invoice.closing_date THEN
      IF CURRENT_DATE = v_invoice.due_date THEN
        v_new_status := 'due';
      ELSE
        v_new_status := 'closed';
      END IF;
    ELSE
      v_new_status := 'open';
    END IF;
  END IF;

  UPDATE public.card_invoices
  SET total_amount = v_total,
      status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE v_new_status END,
      updated_at = now()
  WHERE id = p_invoice_id;
END;
$$;

-- 3. TRIGGERS TO AUTO-RECALCULATE INVOICES
CREATE OR REPLACE FUNCTION public.trg_recalculate_invoice_on_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_card RECORD;
  v_inv_month DATE;
  v_inv_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.credit_card_id IS NOT NULL AND OLD.total_installments IS NULL AND OLD.is_card_payment = false THEN
      SELECT * INTO v_card FROM public.credit_cards WHERE id = OLD.credit_card_id;
      IF FOUND THEN
        v_inv_month := date_trunc('month', OLD.date + (CASE WHEN EXTRACT(DAY FROM OLD.date) >= v_card.closing_day THEN INTERVAL '1 month' ELSE INTERVAL '0' END))::DATE;
        SELECT id INTO v_inv_id FROM public.card_invoices WHERE card_id = OLD.credit_card_id AND reference_month = v_inv_month;
        IF v_inv_id IS NOT NULL THEN PERFORM public.recalculate_card_invoice_totals(v_inv_id); END IF;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.credit_card_id IS NOT NULL AND NEW.total_installments IS NULL AND NEW.is_card_payment = false THEN
    SELECT * INTO v_card FROM public.credit_cards WHERE id = NEW.credit_card_id;
    IF FOUND THEN
      v_inv_month := date_trunc('month', NEW.date + (CASE WHEN EXTRACT(DAY FROM NEW.date) >= v_card.closing_day THEN INTERVAL '1 month' ELSE INTERVAL '0' END))::DATE;
      SELECT id INTO v_inv_id FROM public.card_invoices WHERE card_id = NEW.credit_card_id AND reference_month = v_inv_month;
      IF v_inv_id IS NOT NULL THEN PERFORM public.recalculate_card_invoice_totals(v_inv_id); END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalculate_invoice_on_inst()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tx RECORD;
  v_inv_month DATE;
  v_inv_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v_tx FROM public.transactions WHERE id = OLD.transaction_id;
    IF FOUND AND v_tx.credit_card_id IS NOT NULL AND v_tx.is_card_payment = false THEN
      v_inv_month := date_trunc('month', OLD.due_date)::DATE;
      SELECT id INTO v_inv_id FROM public.card_invoices WHERE card_id = v_tx.credit_card_id AND reference_month = v_inv_month;
      IF v_inv_id IS NOT NULL THEN PERFORM public.recalculate_card_invoice_totals(v_inv_id); END IF;
    END IF;
    RETURN OLD;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = NEW.transaction_id;
  IF FOUND AND v_tx.credit_card_id IS NOT NULL AND v_tx.is_card_payment = false THEN
    v_inv_month := date_trunc('month', NEW.due_date)::DATE;
    SELECT id INTO v_inv_id FROM public.card_invoices WHERE card_id = v_tx.credit_card_id AND reference_month = v_inv_month;
    IF v_inv_id IS NOT NULL THEN PERFORM public.recalculate_card_invoice_totals(v_inv_id); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_recalc_tx ON public.transactions;
CREATE TRIGGER trg_invoice_recalc_tx AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_invoice_on_tx();

DROP TRIGGER IF EXISTS trg_invoice_recalc_inst ON public.installments;
CREATE TRIGGER trg_invoice_recalc_inst AFTER INSERT OR UPDATE OR DELETE ON public.installments
FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_invoice_on_inst();


-- 4. FIX mark_card_invoice_paid TO ACCEPT account_id
CREATE OR REPLACE FUNCTION public.mark_card_invoice_paid(
  _invoice_id UUID, _payment_amount NUMERIC, _payment_date DATE DEFAULT CURRENT_DATE, _account_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv RECORD; card_rec RECORD; new_tx_id UUID; new_paid NUMERIC; new_status TEXT;
BEGIN
  SELECT * INTO inv FROM public.card_invoices WHERE id = _invoice_id;
  IF inv IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;
  IF NOT (inv.user_id = auth.uid() OR (inv.couple_id IS NOT NULL AND public.is_couple_member(inv.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão para esta fatura';
  END IF;
  SELECT * INTO card_rec FROM public.credit_cards WHERE id = inv.card_id;
  new_paid := COALESCE(inv.paid_amount, 0) + _payment_amount;
  new_status := CASE WHEN new_paid >= inv.total_amount THEN 'paid'
    WHEN new_paid > 0 THEN 'partially_paid' ELSE inv.status END;
  INSERT INTO public.transactions (user_id, couple_id, visibility, type, amount, description, date, is_card_payment, source, note, account_id)
  VALUES (auth.uid(), inv.couple_id, inv.visibility, 'expense', _payment_amount,
    'Pagamento fatura ' || COALESCE(card_rec.name, 'Cartão'),
    _payment_date, true, 'card_payment',
    'card_invoice_payment:' || _invoice_id::text || ':' || _payment_date::text || ':' || _payment_amount::text,
    _account_id)
  RETURNING id INTO new_tx_id;
  UPDATE public.card_invoices SET paid_amount = new_paid, status = new_status,
    paid_at = CASE WHEN new_status='paid' THEN now() ELSE paid_at END,
    payment_transaction_id = COALESCE(payment_transaction_id, new_tx_id),
    updated_at = now() WHERE id = _invoice_id;
  IF new_status = 'paid' THEN
    UPDATE public.installments SET paid = true, paid_at = now()
    WHERE transaction_id IN (SELECT id FROM public.transactions WHERE credit_card_id = inv.card_id)
      AND due_date >= date_trunc('month', inv.due_date)
      AND due_date < (date_trunc('month', inv.due_date) + INTERVAL '1 month');
  END IF;
  RETURN new_tx_id;
END; $$;

-- 5. FIX process_subscription_charges (AVOID 0.00 AMOUNT)
CREATE OR REPLACE FUNCTION public.process_subscription_charges()
RETURNS TABLE(subscription_id UUID, transaction_id UUID, status TEXT) AS $$
DECLARE
  sub RECORD;
  tx_id UUID;
  dedupe TEXT;
  effective_amount NUMERIC;
BEGIN
  FOR sub IN
    SELECT s.*
    FROM public.subscriptions s
    WHERE s.status IN ('active')
      AND s.next_billing_date <= CURRENT_DATE
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
    ORDER BY s.next_billing_date
  LOOP
    dedupe := 'subscription_charge:' || sub.id || ':' || sub.next_billing_date::TEXT;

    IF EXISTS (SELECT 1 FROM public.transactions WHERE source = dedupe) THEN
      subscription_id := sub.id; transaction_id := NULL; status := 'skipped_duplicate';
      RETURN NEXT; CONTINUE;
    END IF;

    IF sub.trial_enabled AND sub.trial_end_date IS NOT NULL AND sub.next_billing_date <= sub.trial_end_date THEN
      effective_amount := 0;
    ELSE
      effective_amount := COALESCE(sub.amount_after_trial, sub.amount);
    END IF;

    -- FIX: Do not create transaction if amount is 0
    IF effective_amount <= 0 THEN
      UPDATE public.subscriptions SET next_billing_date = public.calculate_next_billing_date(sub.billing_cycle, sub.next_billing_date) WHERE id = sub.id;
      subscription_id := sub.id; transaction_id := NULL; status := 'skipped_zero_amount';
      RETURN NEXT; CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.transactions (
        user_id, couple_id, visibility, type, amount, description, date,
        category_id, credit_card_id, source, is_card_payment
      ) VALUES (
        sub.user_id, sub.couple_id, sub.visibility, 'expense', effective_amount,
        'Assinatura: ' || sub.name, sub.next_billing_date::TEXT,
        sub.category_id, sub.credit_card_id, dedupe, false
      ) RETURNING id INTO tx_id;

      UPDATE public.subscriptions SET next_billing_date = public.calculate_next_billing_date(sub.billing_cycle, sub.next_billing_date) WHERE id = sub.id;
      subscription_id := sub.id; transaction_id := tx_id; status := 'processed';
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      subscription_id := sub.id; transaction_id := NULL; status := 'error: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. BACKFILL / CLEANUP
DELETE FROM public.transactions WHERE source LIKE 'subscription_charge:%' AND amount <= 0;

DO $$ 
DECLARE r RECORD;
BEGIN 
  FOR r IN SELECT id FROM public.card_invoices LOOP
    PERFORM public.recalculate_card_invoice_totals(r.id);
  END LOOP;
END $$;
