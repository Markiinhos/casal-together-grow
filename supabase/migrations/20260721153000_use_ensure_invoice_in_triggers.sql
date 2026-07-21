-- Replace the manual recalculation with ensure_card_invoice so it automatically creates missing invoices!
CREATE OR REPLACE FUNCTION public.trg_recalculate_invoice_on_tx()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_card RECORD;
  v_inv_month DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.credit_card_id IS NOT NULL AND OLD.total_installments IS NULL AND OLD.is_card_payment = false AND (OLD.source IS NULL OR OLD.source NOT LIKE 'card_invoice_payment:%') THEN
      SELECT * INTO v_card FROM public.credit_cards WHERE id = OLD.credit_card_id;
      IF FOUND THEN
        v_inv_month := date_trunc('month', OLD.date + (CASE WHEN EXTRACT(DAY FROM OLD.date) >= v_card.closing_day THEN INTERVAL '1 month' ELSE INTERVAL '0' END))::DATE;
        PERFORM public.ensure_card_invoice(OLD.credit_card_id, v_inv_month::text);
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.credit_card_id IS NOT NULL AND NEW.total_installments IS NULL AND NEW.is_card_payment = false AND (NEW.source IS NULL OR NEW.source NOT LIKE 'card_invoice_payment:%') THEN
    SELECT * INTO v_card FROM public.credit_cards WHERE id = NEW.credit_card_id;
    IF FOUND THEN
      v_inv_month := date_trunc('month', NEW.date + (CASE WHEN EXTRACT(DAY FROM NEW.date) >= v_card.closing_day THEN INTERVAL '1 month' ELSE INTERVAL '0' END))::DATE;
      PERFORM public.ensure_card_invoice(NEW.credit_card_id, v_inv_month::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalculate_invoice_on_inst()
 RETURNS trigger 
 LANGUAGE plpgsql 
 SECURITY DEFINER 
 SET search_path = public
AS $function$
DECLARE
  v_tx RECORD;
  v_inv_month DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v_tx FROM public.transactions WHERE id = OLD.transaction_id;
    IF FOUND AND v_tx.credit_card_id IS NOT NULL AND v_tx.is_card_payment = false THEN
      v_inv_month := date_trunc('month', OLD.due_date)::DATE;
      PERFORM public.ensure_card_invoice(v_tx.credit_card_id, v_inv_month::text);
    END IF;
    RETURN OLD;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = NEW.transaction_id;
  IF FOUND AND v_tx.credit_card_id IS NOT NULL AND v_tx.is_card_payment = false THEN
    v_inv_month := date_trunc('month', NEW.due_date)::DATE;
    PERFORM public.ensure_card_invoice(v_tx.credit_card_id, v_inv_month::text);
  END IF;
  RETURN NEW;
END;
$function$;
