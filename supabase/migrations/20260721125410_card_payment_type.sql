-- 1. Modify the transaction type check constraint to include 'card_payment'
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- First find the existing constraint name if it exists on 'type'
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type %IN%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.transactions DROP CONSTRAINT ' || constraint_name;
  END IF;

  -- Just in case it's named something else
  ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
  
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('income', 'expense', 'transfer', 'card_payment', 'task', 'goal', 'other', 'dream', 'wish', 'goal_shared'));
END $$;

-- 2. Update mark_card_invoice_paid to use type = 'card_payment'
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
  -- FOR UPDATE locks the row to prevent race conditions during concurrent clicks
  SELECT * INTO inv FROM public.card_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;
  
  IF NOT (inv.user_id = auth.uid() OR (inv.couple_id IS NOT NULL AND public.is_couple_member(inv.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão para esta fatura';
  END IF;

  SELECT * INTO card_rec FROM public.credit_cards WHERE id = inv.card_id;
  
  -- Check for existing payment to ensure idempotency (prevent double click duplication)
  dedupe_key := 'card_invoice_payment:' || _invoice_id::text || ':' || _payment_date::text || ':' || _payment_amount::text;
  SELECT id INTO new_tx_id FROM public.transactions WHERE source = dedupe_key;
  IF new_tx_id IS NOT NULL THEN
    RETURN new_tx_id; -- Already processed
  END IF;

  new_paid := COALESCE(inv.paid_amount, 0) + _payment_amount;
  new_status := CASE 
    WHEN new_paid >= inv.total_amount THEN 'paid'
    WHEN new_paid > 0 THEN 'partially_paid' 
    ELSE inv.status 
  END;

  -- CRITICAL FIX: Do NOT set credit_card_id here. 
  -- We now use type = 'card_payment' instead of 'expense' so it doesn't double-count on the dashboard
  INSERT INTO public.transactions (user_id, couple_id, visibility, type, amount, description, date, is_card_payment, source, note, account_id)
  VALUES (auth.uid(), inv.couple_id, inv.visibility, 'card_payment', _payment_amount,
    'Pagamento fatura ' || COALESCE(card_rec.name, 'Cartão'),
    _payment_date, true, dedupe_key, dedupe_key, _account_id)
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
END;
$$;
