REVOKE EXECUTE ON FUNCTION public.join_couple_by_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_invoice_manual_adjustment(UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.edit_card_invoice(UUID, DATE, DATE, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_card_invoice_paid(UUID, NUMERIC, DATE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_card_invoice_totals(UUID) FROM PUBLIC, anon, authenticated;