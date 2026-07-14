-- 1. CORRIGIR OS REGISTROS CORROMPIDOS (is_card_payment = false quando deveriam ser true)
UPDATE public.transactions
SET is_card_payment = true,
    credit_card_id = COALESCE(credit_card_id, (
        SELECT id FROM public.credit_cards 
        WHERE name ILIKE '%' || replace(replace(description, 'Pagamento fatura ', ''), 'Pagamento Fatura ', '') || '%'
        LIMIT 1
    ))
WHERE type = 'expense' 
  AND is_card_payment = false 
  AND (description ILIKE 'Pagamento fatura%' OR description ILIKE '%para pagar o cartão%');

-- 2. REFAZER A FUNÇÃO DE MARCAR COMO PAGO PARA SETAR credit_card_id CORRETAMENTE E is_card_payment = true
CREATE OR REPLACE FUNCTION public.mark_card_invoice_paid(
  _invoice_id UUID, _payment_amount NUMERIC, _payment_date DATE DEFAULT CURRENT_DATE, _account_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  inv RECORD; 
  card_rec RECORD; 
  new_tx_id UUID; 
  new_paid NUMERIC; 
  new_status TEXT;
  dedupe_key TEXT;
BEGIN
  SELECT * INTO inv FROM public.card_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;
  
  IF NOT (inv.user_id = auth.uid() OR (inv.couple_id IS NOT NULL AND public.is_couple_member(inv.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão para esta fatura';
  END IF;

  SELECT * INTO card_rec FROM public.credit_cards WHERE id = inv.card_id;
  
  dedupe_key := 'card_invoice_payment:' || _invoice_id::text || ':' || _payment_date::text || ':' || _payment_amount::text;
  SELECT id INTO new_tx_id FROM public.transactions WHERE source = dedupe_key;
  IF new_tx_id IS NOT NULL THEN
    RETURN new_tx_id;
  END IF;

  new_paid := COALESCE(inv.paid_amount, 0) + _payment_amount;
  new_status := CASE 
    WHEN new_paid >= inv.total_amount THEN 'paid'
    WHEN new_paid > 0 THEN 'partially_paid' 
    ELSE inv.status 
  END;

  INSERT INTO public.transactions (user_id, couple_id, visibility, type, amount, description, date, is_card_payment, credit_card_id, source, note, account_id)
  VALUES (auth.uid(), inv.couple_id, inv.visibility, 'expense', _payment_amount,
    'Pagamento fatura ' || COALESCE(card_rec.name, 'Cartão'),
    _payment_date, true, inv.card_id, dedupe_key, dedupe_key, _account_id)
  RETURNING id INTO new_tx_id;

  UPDATE public.card_invoices 
  SET paid_amount = new_paid, 
      status = new_status,
      paid_at = CASE WHEN new_status='paid' THEN now() ELSE paid_at END,
      payment_transaction_id = COALESCE(payment_transaction_id, new_tx_id),
      updated_at = now() 
  WHERE id = _invoice_id;

  IF new_status = 'paid' THEN
    UPDATE public.installments SET paid = true, paid_at = now()
    WHERE transaction_id IN (SELECT id FROM public.transactions WHERE credit_card_id = inv.card_id)
      AND due_date >= date_trunc('month', inv.due_date)
      AND due_date < (date_trunc('month', inv.due_date) + INTERVAL '1 month');
  END IF;

  RETURN new_tx_id;
END; $$;

-- 3. GARANTIR QUE A TRIGGER NÃO DISPARE PARA is_card_payment = true
CREATE OR REPLACE FUNCTION public.trg_recalculate_invoice_on_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_card RECORD;
  v_inv_month DATE;
  v_inv_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.credit_card_id IS NOT NULL AND OLD.total_installments IS NULL AND OLD.is_card_payment = false AND (OLD.source IS NULL OR OLD.source NOT LIKE 'card_invoice_payment:%') THEN
      SELECT * INTO v_card FROM public.credit_cards WHERE id = OLD.credit_card_id;
      IF FOUND THEN
        v_inv_month := date_trunc('month', OLD.date + (CASE WHEN EXTRACT(DAY FROM OLD.date) >= v_card.closing_day THEN INTERVAL '1 month' ELSE INTERVAL '0' END))::DATE;
        SELECT id INTO v_inv_id FROM public.card_invoices WHERE card_id = OLD.credit_card_id AND reference_month = v_inv_month;
        IF v_inv_id IS NOT NULL THEN PERFORM public.recalculate_card_invoice_totals(v_inv_id); END IF;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.credit_card_id IS NOT NULL AND NEW.total_installments IS NULL AND NEW.is_card_payment = false AND (NEW.source IS NULL OR NEW.source NOT LIKE 'card_invoice_payment:%') THEN
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

-- 4. RECALCULAR TODAS AS FATURAS PARA REMOVER O VALOR DUPLICADO
DO $$ 
DECLARE 
  r RECORD;
BEGIN 
  FOR r IN SELECT id FROM public.card_invoices LOOP
    PERFORM public.recalculate_card_invoice_totals(r.id);
  END LOOP;
END $$;
