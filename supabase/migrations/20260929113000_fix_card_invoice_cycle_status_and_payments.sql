-- Migration: 20260929113000_fix_card_invoice_cycle_status_and_payments.sql
-- Description: Unify card invoice cycle resolution, prevent over-payment, fix closing/due calculation, and align installment due dates

-- 1. Canonical cycle resolver
CREATE OR REPLACE FUNCTION public.resolve_card_invoice_cycle(
  _purchase_date DATE, 
  _closing_day INTEGER, 
  _due_day INTEGER, 
  _installment_number INTEGER DEFAULT 1
) RETURNS TABLE(closing_date DATE, due_date DATE, reference_month DATE)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  base_year INT;
  base_month INT;
  cd DATE;
  dd DATE;
  effective_close DATE;
  last_day INT;
  cd_year INT;
  cd_month INT;
  cd_last_day INT;
  dd_year INT;
  dd_month INT;
  dd_last_day INT;
BEGIN
  base_year := EXTRACT(YEAR FROM _purchase_date)::int;
  base_month := EXTRACT(MONTH FROM _purchase_date)::int;
  last_day := EXTRACT(DAY FROM (make_date(base_year, base_month, 1) + INTERVAL '1 month - 1 day'))::int;
  effective_close := make_date(base_year, base_month, LEAST(_closing_day, last_day));

  -- Compra realizada antes ou no dia do fechamento entra na fatura que fecha nesse mês;
  -- Compra realizada após o dia do fechamento vai para o fechamento do mês seguinte.
  IF _purchase_date <= effective_close THEN
    cd := effective_close;
  ELSE
    cd := (effective_close + INTERVAL '1 month')::date;
    cd_year := EXTRACT(YEAR FROM cd)::int;
    cd_month := EXTRACT(MONTH FROM cd)::int;
    cd_last_day := EXTRACT(DAY FROM (make_date(cd_year, cd_month, 1) + INTERVAL '1 month - 1 day'))::int;
    cd := make_date(cd_year, cd_month, LEAST(_closing_day, cd_last_day));
  END IF;

  -- Para parcelas posteriores (i > 1), avança (i - 1) meses a partir do fechamento inicial
  IF _installment_number > 1 THEN
    cd := (cd + ((_installment_number - 1) || ' months')::interval)::date;
    cd_year := EXTRACT(YEAR FROM cd)::int;
    cd_month := EXTRACT(MONTH FROM cd)::int;
    cd_last_day := EXTRACT(DAY FROM (make_date(cd_year, cd_month, 1) + INTERVAL '1 month - 1 day'))::int;
    cd := make_date(cd_year, cd_month, LEAST(_closing_day, cd_last_day));
  END IF;

  -- Regra canônica de vencimento:
  -- Se due_day >= closing_day: vencimento ocorre no MESMO mês do fechamento
  -- Se due_day < closing_day: vencimento ocorre no MÊS SEGUINTE ao fechamento
  cd_year := EXTRACT(YEAR FROM cd)::int;
  cd_month := EXTRACT(MONTH FROM cd)::int;

  IF _due_day >= _closing_day THEN
    dd_year := cd_year;
    dd_month := cd_month;
  ELSE
    IF cd_month = 12 THEN
      dd_year := cd_year + 1;
      dd_month := 1;
    ELSE
      dd_year := cd_year;
      dd_month := cd_month + 1;
    END IF;
  END IF;

  dd_last_day := EXTRACT(DAY FROM (make_date(dd_year, dd_month, 1) + INTERVAL '1 month - 1 day'))::int;
  dd := make_date(dd_year, dd_month, LEAST(_due_day, dd_last_day));

  closing_date := cd;
  due_date := dd;
  reference_month := make_date(dd_year, dd_month, 1);
  RETURN NEXT;
END;
$$;

-- 2. Ensure card invoice uses canonical cycle math
CREATE OR REPLACE FUNCTION public.ensure_card_invoice(
  p_card_id UUID, 
  p_reference_month TEXT
) RETURNS public.card_invoices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card RECORD;
  v_invoice public.card_invoices;
  v_ref_date DATE;
  v_due_date DATE;
  v_closing_date DATE;
  v_ref_year INT;
  v_ref_month INT;
  v_ref_last_day INT;
  v_prev_year INT;
  v_prev_month INT;
  v_prev_last_day INT;
BEGIN
  v_ref_date := p_reference_month::DATE;

  SELECT * INTO v_card FROM public.credit_cards WHERE id = p_card_id;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'Cartão não encontrado';
  END IF;

  IF NOT (v_card.user_id = auth.uid() OR (v_card.couple_id IS NOT NULL AND public.is_couple_member(v_card.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão para acessar este cartão';
  END IF;

  v_ref_year := EXTRACT(YEAR FROM v_ref_date)::int;
  v_ref_month := EXTRACT(MONTH FROM v_ref_date)::int;
  v_ref_last_day := EXTRACT(DAY FROM (make_date(v_ref_year, v_ref_month, 1) + INTERVAL '1 month - 1 day'))::int;
  v_due_date := make_date(v_ref_year, v_ref_month, LEAST(v_card.due_day, v_ref_last_day));

  -- Calcula a data de fechamento correspondente a este vencimento
  IF v_card.due_day >= v_card.closing_day THEN
    v_closing_date := make_date(v_ref_year, v_ref_month, LEAST(v_card.closing_day, v_ref_last_day));
  ELSE
    IF v_ref_month = 1 THEN
      v_prev_year := v_ref_year - 1;
      v_prev_month := 12;
    ELSE
      v_prev_year := v_ref_year;
      v_prev_month := v_ref_month - 1;
    END IF;
    v_prev_last_day := EXTRACT(DAY FROM (make_date(v_prev_year, v_prev_month, 1) + INTERVAL '1 month - 1 day'))::int;
    v_closing_date := make_date(v_prev_year, v_prev_month, LEAST(v_card.closing_day, v_prev_last_day));
  END IF;

  INSERT INTO public.card_invoices (
    card_id, user_id, couple_id, visibility, reference_month,
    closing_date, due_date, status
  ) VALUES (
    p_card_id, auth.uid(), v_card.couple_id, v_card.visibility, v_ref_date,
    v_closing_date, v_due_date, 'open'
  )
  ON CONFLICT (card_id, reference_month) DO UPDATE
  SET closing_date = EXCLUDED.closing_date,
      due_date = EXCLUDED.due_date;

  SELECT * INTO v_invoice 
  FROM public.card_invoices 
  WHERE card_id = p_card_id AND reference_month = v_ref_date;

  PERFORM public.recalculate_card_invoice_totals(v_invoice.id);

  SELECT * INTO v_invoice 
  FROM public.card_invoices 
  WHERE card_id = p_card_id AND reference_month = v_ref_date;

  RETURN v_invoice;
END;
$$;

-- 3. Recalculate card invoice totals and status
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
  v_prev_closing := make_date(v_prev_year, v_prev_month, LEAST(v_card.closing_day, v_prev_last_day));

  -- Compras à vista: compras feitas após o fechamento anterior e até a data deste fechamento
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_total
  FROM public.transactions
  WHERE credit_card_id = v_invoice.card_id
    AND type = 'expense'
    AND total_installments IS NULL
    AND is_card_payment = false
    AND date > v_prev_closing
    AND date <= v_invoice.closing_date;

  -- Parcelas vinculadas a este mês de vencimento da fatura
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

-- 4. Generate installments using card cycle
CREATE OR REPLACE FUNCTION public.generate_installments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i int;
  per numeric(12,2);
  base_date date;
  v_card RECORD;
  v_inst_due DATE;
BEGIN
  IF NEW.total_installments IS NULL OR NEW.total_installments <= 1 THEN
    RETURN NEW;
  END IF;

  per := round(NEW.amount::numeric / NEW.total_installments, 2);
  base_date := COALESCE(NEW.date, CURRENT_DATE);

  IF NEW.credit_card_id IS NOT NULL THEN
    SELECT * INTO v_card FROM public.credit_cards WHERE id = NEW.credit_card_id;
  END IF;

  FOR i IN 1..NEW.total_installments LOOP
    IF v_card IS NOT NULL THEN
      SELECT due_date INTO v_inst_due
      FROM public.resolve_card_invoice_cycle(base_date, v_card.closing_day, v_card.due_day, i);
    ELSE
      v_inst_due := (base_date + ((i - 1) || ' months')::interval)::date;
    END IF;

    INSERT INTO public.installments (transaction_id, couple_id, user_id, installment_number, total_installments, amount, due_date)
    VALUES (NEW.id, NEW.couple_id, NEW.user_id, i, NEW.total_installments, per, v_inst_due);
  END LOOP;
  RETURN NEW;
END;
$$;

-- 5. Mark card invoice paid: overpayment protection and idempotency
CREATE OR REPLACE FUNCTION public.mark_card_invoice_paid(
  _invoice_id UUID, 
  _payment_amount NUMERIC, 
  _payment_date DATE DEFAULT CURRENT_DATE, 
  _account_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv RECORD;
  card_rec RECORD;
  new_tx_id UUID;
  new_paid NUMERIC;
  new_status TEXT;
  dedupe_key TEXT;
  v_remaining NUMERIC;
BEGIN
  SELECT * INTO inv FROM public.card_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;

  IF NOT (inv.user_id = auth.uid() OR (inv.couple_id IS NOT NULL AND public.is_couple_member(inv.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão para esta fatura';
  END IF;

  IF inv.status = 'open' THEN
    RAISE EXCEPTION 'O ciclo desta fatura ainda não fechou (fecha em %). Aguarde o fechamento para marcar como paga.',
      to_char(inv.closing_date, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;

  v_remaining := GREATEST(0, inv.total_amount - COALESCE(inv.paid_amount, 0));
  IF _payment_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do pagamento deve ser maior que zero';
  END IF;
  IF _payment_amount > v_remaining THEN
    RAISE EXCEPTION 'O valor do pagamento (R$ %) não pode ultrapassar o saldo restante da fatura (R$ %)', _payment_amount, v_remaining;
  END IF;

  SELECT * INTO card_rec FROM public.credit_cards WHERE id = inv.card_id;

  dedupe_key := 'card_invoice_payment:' || _invoice_id::text || ':' || _payment_date::text || ':' || _payment_amount::text;
  SELECT id INTO new_tx_id FROM public.transactions WHERE source = dedupe_key;
  IF new_tx_id IS NOT NULL THEN
    RETURN new_tx_id; -- Idempotente
  END IF;

  new_paid := COALESCE(inv.paid_amount, 0) + _payment_amount;
  new_status := CASE
    WHEN new_paid >= inv.total_amount THEN 'paid'
    WHEN new_paid > 0 THEN 'partially_paid'
    ELSE inv.status
  END;

  INSERT INTO public.transactions (user_id, couple_id, visibility, type, amount, description, date, is_card_payment, source, note, account_id)
  VALUES (auth.uid(), inv.couple_id, inv.visibility, 'card_payment', _payment_amount,
    'Pagamento fatura ' || COALESCE(card_rec.name, 'Cartão'),
    _payment_date, true, dedupe_key, dedupe_key, _account_id)
  RETURNING id INTO new_tx_id;

  UPDATE public.card_invoices
  SET paid_amount = new_paid,
      status = new_status,
      paid_at = CASE WHEN new_status = 'paid' THEN now() ELSE paid_at END,
      payment_transaction_id = COALESCE(payment_transaction_id, new_tx_id),
      updated_at = now()
  WHERE id = _invoice_id;

  -- Marca parcelas como quitadas unicamente quando a fatura for totalmente paga
  IF new_status = 'paid' THEN
    UPDATE public.installments SET paid = true, paid_at = now()
    WHERE transaction_id IN (SELECT id FROM public.transactions WHERE credit_card_id = inv.card_id)
      AND due_date >= date_trunc('month', inv.due_date)
      AND due_date < (date_trunc('month', inv.due_date) + INTERVAL '1 month');
  END IF;

  RETURN new_tx_id;
END;
$$;

-- 6. Undo card invoice payment
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

  IF _payment_transaction_id IS NOT NULL THEN
    SELECT * INTO tx FROM public.transactions
      WHERE id = _payment_transaction_id AND is_card_payment = true;
  ELSE
    SELECT * INTO tx FROM public.transactions
      WHERE is_card_payment = true
        AND source LIKE 'card_invoice_payment:' || _invoice_id::text || ':%'
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF tx IS NULL THEN
    RAISE EXCEPTION 'Nenhum pagamento encontrado para desfazer';
  END IF;

  new_paid := GREATEST(0, COALESCE(inv.paid_amount, 0) - tx.amount);
  new_status := CASE
    WHEN new_paid <= 0 THEN
      CASE
        WHEN CURRENT_DATE > inv.due_date THEN 'overdue'
        WHEN CURRENT_DATE = inv.due_date THEN 'due'
        WHEN CURRENT_DATE > inv.closing_date THEN 'closed'
        ELSE 'open'
      END
    WHEN new_paid < inv.total_amount THEN 'partially_paid'
    ELSE 'paid'
  END;

  DELETE FROM public.transactions WHERE id = tx.id;

  UPDATE public.card_invoices
    SET paid_amount = new_paid,
        status = new_status,
        paid_at = CASE WHEN new_status = 'paid' THEN paid_at ELSE NULL END,
        payment_transaction_id = CASE WHEN payment_transaction_id = tx.id THEN NULL ELSE payment_transaction_id END,
        updated_at = now()
    WHERE id = _invoice_id;

  IF inv.status = 'paid' AND new_status <> 'paid' THEN
    UPDATE public.installments SET paid = false, paid_at = NULL
      WHERE transaction_id IN (SELECT id FROM public.transactions WHERE credit_card_id = inv.card_id)
        AND due_date >= date_trunc('month', inv.due_date)
        AND due_date < (date_trunc('month', inv.due_date) + INTERVAL '1 month');
  END IF;
END;
$$;

-- 7. Update my invoice statuses
CREATE OR REPLACE FUNCTION public.update_my_invoice_statuses()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv_id UUID;
BEGIN
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
