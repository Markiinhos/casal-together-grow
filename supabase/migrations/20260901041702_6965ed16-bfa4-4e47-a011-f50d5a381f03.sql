-- Lets the user correct an invoice's reference month (competência), due
-- date (vencimento) and manual adjustment (valores) — both before and
-- after payment — while keeping a full edit history.

CREATE TABLE IF NOT EXISTS public.card_invoice_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.card_invoices(id) ON DELETE CASCADE,
  edited_by UUID NOT NULL REFERENCES auth.users(id),
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_card_invoice_edits_invoice ON public.card_invoice_edits(invoice_id, created_at DESC);

ALTER TABLE public.card_invoice_edits ENABLE ROW LEVEL SECURITY;

-- Readable by whoever can see the invoice itself. No INSERT/UPDATE/DELETE
-- policy is granted to `authenticated` on purpose — rows are only ever
-- written by the edit_card_invoice() function below (SECURITY DEFINER),
-- so the history can't be tampered with from the client.
DROP POLICY IF EXISTS card_invoice_edits_select ON public.card_invoice_edits;
CREATE POLICY card_invoice_edits_select ON public.card_invoice_edits FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.card_invoices ci
    WHERE ci.id = card_invoice_edits.invoice_id
      AND (
        (ci.visibility = 'private' AND ci.user_id = auth.uid())
        OR (ci.visibility = 'shared' AND ci.couple_id IS NOT NULL AND public.is_couple_member(ci.couple_id))
        OR (ci.visibility = 'shared' AND ci.couple_id IS NULL AND ci.user_id = auth.uid())
      )
  )
);

GRANT SELECT ON public.card_invoice_edits TO authenticated;
GRANT ALL ON public.card_invoice_edits TO service_role;

CREATE OR REPLACE FUNCTION public.edit_card_invoice(
  _invoice_id UUID,
  _new_reference_month DATE,
  _new_due_date DATE,
  _new_manual_adjustment NUMERIC,
  _note TEXT DEFAULT NULL
) RETURNS public.card_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.card_invoices;
  v_card RECORD;
  v_old_ref_month DATE;
  v_new_closing_date DATE;
  v_conflict_id UUID;
BEGIN
  SELECT * INTO inv FROM public.card_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;

  IF NOT (inv.user_id = auth.uid() OR (inv.couple_id IS NOT NULL AND public.is_couple_member(inv.couple_id))) THEN
    RAISE EXCEPTION 'Sem permissão para esta fatura';
  END IF;

  IF date_trunc('month', _new_due_date) <> date_trunc('month', _new_reference_month) THEN
    RAISE EXCEPTION 'A data de vencimento deve estar dentro do mês de competência selecionado';
  END IF;

  SELECT * INTO v_card FROM public.credit_cards WHERE id = inv.card_id;
  v_old_ref_month := inv.reference_month;

  IF _new_reference_month IS DISTINCT FROM inv.reference_month THEN
    SELECT id INTO v_conflict_id FROM public.card_invoices
      WHERE card_id = inv.card_id AND reference_month = _new_reference_month AND id <> inv.id;
    IF v_conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'Já existe uma fatura deste cartão nesse mês de competência';
    END IF;
    v_new_closing_date := ((_new_reference_month - INTERVAL '1 month') + ((v_card.closing_day - 1) || ' days')::interval)::date;
  ELSE
    v_new_closing_date := inv.closing_date;
  END IF;

  IF _new_reference_month IS DISTINCT FROM inv.reference_month THEN
    INSERT INTO public.card_invoice_edits (invoice_id, edited_by, field, old_value, new_value, note)
    VALUES (inv.id, auth.uid(), 'reference_month', inv.reference_month::text, _new_reference_month::text, _note);
  END IF;
  IF _new_due_date IS DISTINCT FROM inv.due_date THEN
    INSERT INTO public.card_invoice_edits (invoice_id, edited_by, field, old_value, new_value, note)
    VALUES (inv.id, auth.uid(), 'due_date', inv.due_date::text, _new_due_date::text, _note);
  END IF;
  IF _new_manual_adjustment IS DISTINCT FROM inv.manual_adjustment THEN
    INSERT INTO public.card_invoice_edits (invoice_id, edited_by, field, old_value, new_value, note)
    VALUES (inv.id, auth.uid(), 'manual_adjustment', inv.manual_adjustment::text, _new_manual_adjustment::text, _note);
  END IF;

  UPDATE public.card_invoices
  SET reference_month = _new_reference_month,
      due_date = _new_due_date,
      closing_date = v_new_closing_date,
      manual_adjustment = _new_manual_adjustment,
      updated_at = now()
  WHERE id = _invoice_id;

  PERFORM public.recalculate_card_invoice_totals(_invoice_id);

  -- Moving an invoice out of its month leaves that month's purchases
  -- without an up-to-date invoice row (they're matched by date range, not
  -- a stored link) — recreate/recalculate it so nothing is silently lost.
  IF _new_reference_month IS DISTINCT FROM v_old_ref_month THEN
    PERFORM public.ensure_card_invoice(inv.card_id, v_old_ref_month::text);
  END IF;

  SELECT * INTO inv FROM public.card_invoices WHERE id = _invoice_id;
  RETURN inv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_card_invoice(UUID, DATE, DATE, NUMERIC, TEXT) TO authenticated;