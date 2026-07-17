
-- 1) Remove unused/sensitive token columns from bank_connections
ALTER TABLE public.bank_connections
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token,
  DROP COLUMN IF EXISTS expires_at;

-- 2) Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.trg_recalculate_invoice_on_tx()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$;

-- 3) Revoke EXECUTE from authenticated on internal helpers/triggers that
--    should never be called directly from the client.
REVOKE EXECUTE ON FUNCTION public.log_plan_history() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_partner_on_plan() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_partner_on_subscription() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalculate_invoice_on_inst() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalculate_invoice_on_tx() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_card_invoice_totals(uuid) FROM authenticated;
