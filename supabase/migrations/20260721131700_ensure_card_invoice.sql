CREATE OR REPLACE FUNCTION public.ensure_card_invoice(
  p_card_id UUID, 
  p_reference_month DATE
) RETURNS public.card_invoices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card RECORD;
  v_cycle RECORD;
  v_invoice public.card_invoices;
BEGIN
  -- 1. Validate card
  SELECT * INTO v_card FROM public.credit_cards WHERE id = p_card_id;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'Cartão não encontrado';
  END IF;

  -- Security check
  IF NOT (v_card.user_id = auth.uid() OR (v_card.couple_id IS NOT NULL AND public.is_couple_member(v_card.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão para acessar este cartão';
  END IF;

  -- 2. Resolve cycle dates based on reference_month
  -- The reference_month passed from frontend is already the first day of the reference month.
  -- To get closing_date and due_date accurately, we can just use the card's day configurations
  -- in the context of the reference_month (which is the due date's month).
  -- reference_month = YYYY-MM-01 where MM is the month of the due date.
  -- Thus, due_date is reference_month + (due_day - 1) days.
  -- closing_date is the month PRIOR to reference_month + (closing_day - 1) days.
  
  -- Use make_date safely or just interval math
  DECLARE
    v_due_date DATE := (p_reference_month + ((v_card.due_day - 1) || ' days')::interval)::date;
    v_closing_date DATE := ((p_reference_month - INTERVAL '1 month') + ((v_card.closing_day - 1) || ' days')::interval)::date;
  BEGIN
    -- 3. Upsert the invoice (using the existing unique constraint on card_id, reference_month)
    INSERT INTO public.card_invoices (
      card_id, user_id, couple_id, visibility, reference_month,
      closing_date, due_date, status
    ) VALUES (
      p_card_id, auth.uid(), v_card.couple_id, v_card.visibility, p_reference_month,
      v_closing_date, v_due_date, 'open'
    )
    ON CONFLICT (card_id, reference_month) DO NOTHING;
    
    -- 4. Retrieve the invoice
    SELECT * INTO v_invoice 
    FROM public.card_invoices 
    WHERE card_id = p_card_id AND reference_month = p_reference_month;

    -- 5. Trigger recalculation to ensure total_amount is up to date based on purchases/installments
    PERFORM public.recalculate_card_invoice_totals(p_card_id, p_reference_month);

    -- Retrieve the updated invoice
    SELECT * INTO v_invoice 
    FROM public.card_invoices 
    WHERE card_id = p_card_id AND reference_month = p_reference_month;

    RETURN v_invoice;
  END;
END;
$$;
