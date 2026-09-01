-- Lets a user wipe all of their credit-card data (cards, purchases,
-- installments, invoices, invoice edit history) in one deliberate action,
-- triggered from a confirmation screen in Settings — never automatically.
--
-- Deletion order matters for correctness, not just for cascades:
-- transactions are deleted explicitly first (their installments cascade via
-- installments.transaction_id ON DELETE CASCADE), THEN the cards themselves
-- are deleted (card_invoices cascade via card_id ON DELETE CASCADE, and
-- card_invoice_edits cascade from card_invoices). If cards were deleted
-- first, transactions.credit_card_id would just be SET NULL, leaving all
-- old purchases behind as ordinary (uncategorized-by-card) expenses instead
-- of actually clearing them.
CREATE OR REPLACE FUNCTION public.reset_credit_cards_data()
RETURNS TABLE(deleted_transactions BIGINT, deleted_cards BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_card_ids UUID[];
  v_tx_count BIGINT := 0;
  v_card_count BIGINT := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT array_agg(id) INTO v_card_ids FROM public.credit_cards
  WHERE user_id = v_user OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id));

  IF v_card_ids IS NULL THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  WITH deleted AS (
    DELETE FROM public.transactions WHERE credit_card_id = ANY(v_card_ids) RETURNING 1
  )
  SELECT count(*) INTO v_tx_count FROM deleted;

  WITH deleted AS (
    DELETE FROM public.credit_cards WHERE id = ANY(v_card_ids) RETURNING 1
  )
  SELECT count(*) INTO v_card_count FROM deleted;

  RETURN QUERY SELECT v_tx_count, v_card_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_credit_cards_data() TO authenticated;
