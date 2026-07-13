
-- 0a. Categories: add fields
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);

-- 0b. Dedupe: archive extra duplicates keeping the oldest
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY COALESCE(couple_id::text, user_id::text), lower(name), type, visibility
           ORDER BY created_at
         ) rn
  FROM public.categories
  WHERE is_archived=false AND parent_id IS NULL
)
UPDATE public.categories c SET is_archived=true
FROM ranked r WHERE c.id=r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_private
  ON public.categories(user_id, lower(name), type)
  WHERE visibility='private' AND is_archived=false AND parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_shared
  ON public.categories(couple_id, lower(name), type)
  WHERE visibility='shared' AND couple_id IS NOT NULL AND is_archived=false AND parent_id IS NULL;

-- 1. SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id UUID REFERENCES public.couples(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('private','shared')),
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  icon TEXT,
  url TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  billing_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_frequency IN ('weekly','monthly','bimonthly','quarterly','semiannual','annual','custom')),
  billing_interval INTEGER NOT NULL DEFAULT 1,
  start_date DATE,
  next_billing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  billing_day INTEGER,
  renewal_date DATE,
  end_date DATE,
  payment_method TEXT NOT NULL DEFAULT 'pix' CHECK (payment_method IN ('pix','debit','bank_account','credit_card','boleto','other')),
  account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','paused','canceled','ended')),
  trial_enabled BOOLEAN NOT NULL DEFAULT false,
  trial_end_date DATE,
  amount_after_trial NUMERIC(14,2),
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  last_charged_at TIMESTAMPTZ,
  last_generated_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_couple ON public.subscriptions(couple_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next ON public.subscriptions(next_billing_date) WHERE status IN ('active','trial');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated
USING ((visibility='private' AND user_id=auth.uid())
    OR (visibility='shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    OR (visibility='shared' AND couple_id IS NULL AND user_id=auth.uid()));
CREATE POLICY subscriptions_insert ON public.subscriptions FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid() AND (visibility='private' OR (visibility='shared' AND (couple_id IS NULL OR public.is_couple_member(couple_id)))));
CREATE POLICY subscriptions_update ON public.subscriptions FOR UPDATE TO authenticated
USING ((visibility='private' AND user_id=auth.uid())
    OR (visibility='shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    OR (visibility='shared' AND couple_id IS NULL AND user_id=auth.uid()));
CREATE POLICY subscriptions_delete ON public.subscriptions FOR DELETE TO authenticated
USING (user_id=auth.uid() OR (visibility='shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id)));

CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. SUBSCRIPTION HISTORY
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_history_sub ON public.subscription_history(subscription_id, created_at DESC);
GRANT SELECT, INSERT ON public.subscription_history TO authenticated;
GRANT ALL ON public.subscription_history TO service_role;
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_history_select ON public.subscription_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_history.subscription_id
  AND ((s.visibility='private' AND s.user_id=auth.uid())
    OR (s.visibility='shared' AND s.couple_id IS NOT NULL AND public.is_couple_member(s.couple_id))
    OR (s.visibility='shared' AND s.couple_id IS NULL AND s.user_id=auth.uid()))));
CREATE POLICY sub_history_insert ON public.subscription_history FOR INSERT TO authenticated WITH CHECK (true);

-- 3. CARD INVOICES
CREATE TABLE IF NOT EXISTS public.card_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id UUID REFERENCES public.couples(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('private','shared')),
  reference_month DATE NOT NULL,
  closing_date DATE NOT NULL,
  due_date DATE NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','due','overdue','partially_paid','paid','cancelled')),
  paid_at TIMESTAMPTZ,
  payment_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_id, reference_month)
);
CREATE INDEX IF NOT EXISTS idx_card_invoices_card ON public.card_invoices(card_id, reference_month DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_invoices TO authenticated;
GRANT ALL ON public.card_invoices TO service_role;
ALTER TABLE public.card_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY card_invoices_select ON public.card_invoices FOR SELECT TO authenticated
USING ((visibility='private' AND user_id=auth.uid())
    OR (visibility='shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    OR (visibility='shared' AND couple_id IS NULL AND user_id=auth.uid()));
CREATE POLICY card_invoices_insert ON public.card_invoices FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid() AND (visibility='private' OR couple_id IS NULL OR public.is_couple_member(couple_id)));
CREATE POLICY card_invoices_update ON public.card_invoices FOR UPDATE TO authenticated
USING ((visibility='private' AND user_id=auth.uid())
    OR (visibility='shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    OR (visibility='shared' AND couple_id IS NULL AND user_id=auth.uid()));
CREATE POLICY card_invoices_delete ON public.card_invoices FOR DELETE TO authenticated
USING (user_id=auth.uid() OR (visibility='shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id)));
CREATE TRIGGER trg_card_invoices_updated BEFORE UPDATE ON public.card_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RESOLVE CARD INVOICE CYCLE
CREATE OR REPLACE FUNCTION public.resolve_card_invoice_cycle(
  _purchase_date DATE, _closing_day INTEGER, _due_day INTEGER, _installment_number INTEGER DEFAULT 1
) RETURNS TABLE(closing_date DATE, due_date DATE, reference_month DATE)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE base_year INT; base_month INT; cd DATE; dd DATE; effective_close DATE; last_day INT;
BEGIN
  base_year := EXTRACT(YEAR FROM _purchase_date)::int;
  base_month := EXTRACT(MONTH FROM _purchase_date)::int;
  last_day := EXTRACT(DAY FROM (make_date(base_year, base_month, 1) + INTERVAL '1 month - 1 day'))::int;
  effective_close := make_date(base_year, base_month, LEAST(_closing_day, last_day));
  IF _purchase_date <= effective_close THEN cd := effective_close;
  ELSE cd := (effective_close + INTERVAL '1 month')::date; END IF;
  IF _installment_number > 1 THEN
    cd := (cd + ((_installment_number - 1) || ' months')::interval)::date;
  END IF;
  dd := (date_trunc('month', cd) + INTERVAL '1 month' + ((_due_day - 1) || ' days')::interval)::date;
  closing_date := cd; due_date := dd; reference_month := date_trunc('month', dd)::date;
  RETURN NEXT;
END; $$;

-- 5. PROCESS SUBSCRIPTION CHARGES
CREATE OR REPLACE FUNCTION public.process_subscription_charges()
RETURNS TABLE(subscription_id UUID, transaction_id UUID, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD; new_tx_id UUID; charge_amount NUMERIC; next_date DATE; dedupe_desc TEXT;
BEGIN
  FOR s IN SELECT * FROM public.subscriptions
    WHERE status IN ('active','trial') AND next_billing_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  LOOP
    IF s.trial_enabled AND s.trial_end_date IS NOT NULL AND s.trial_end_date > CURRENT_DATE THEN
      charge_amount := 0;
    ELSE
      charge_amount := COALESCE(CASE WHEN s.trial_enabled AND s.trial_end_date IS NOT NULL AND s.trial_end_date <= CURRENT_DATE
        THEN s.amount_after_trial ELSE NULL END, s.amount);
    END IF;
    dedupe_desc := 'subscription_charge:' || s.id::text || ':' || s.next_billing_date::text;
    IF EXISTS (SELECT 1 FROM public.transactions WHERE note = dedupe_desc) THEN
      subscription_id := s.id; transaction_id := NULL; status := 'skipped_duplicate'; RETURN NEXT; CONTINUE;
    END IF;
    new_tx_id := NULL;
    IF charge_amount > 0 THEN
      INSERT INTO public.transactions (user_id, couple_id, visibility, type, amount, category_id,
        description, date, credit_card_id, source, note, responsible_user_id)
      VALUES (s.user_id, s.couple_id, s.visibility, 'expense', charge_amount, s.category_id,
        s.name, s.next_billing_date,
        CASE WHEN s.payment_method='credit_card' THEN s.card_id ELSE NULL END,
        'subscription', dedupe_desc, COALESCE(s.responsible_user_id, s.user_id))
      RETURNING id INTO new_tx_id;
      INSERT INTO public.subscription_history(subscription_id, changed_by, action, new_values)
      VALUES (s.id, s.user_id, 'charge_generated',
        jsonb_build_object('transaction_id', new_tx_id, 'amount', charge_amount, 'date', s.next_billing_date));
    END IF;
    next_date := CASE s.billing_frequency
      WHEN 'weekly' THEN (s.next_billing_date + (7 * s.billing_interval || ' days')::interval)::date
      WHEN 'monthly' THEN (s.next_billing_date + (s.billing_interval || ' months')::interval)::date
      WHEN 'bimonthly' THEN (s.next_billing_date + INTERVAL '2 months')::date
      WHEN 'quarterly' THEN (s.next_billing_date + INTERVAL '3 months')::date
      WHEN 'semiannual' THEN (s.next_billing_date + INTERVAL '6 months')::date
      WHEN 'annual' THEN (s.next_billing_date + INTERVAL '1 year')::date
      WHEN 'custom' THEN (s.next_billing_date + (s.billing_interval || ' months')::interval)::date
      ELSE (s.next_billing_date + INTERVAL '1 month')::date END;
    UPDATE public.subscriptions SET next_billing_date = next_date, last_charged_at = now(),
      last_generated_transaction_id = COALESCE(new_tx_id, last_generated_transaction_id),
      status = CASE WHEN s.trial_enabled AND s.trial_end_date IS NOT NULL
        AND s.trial_end_date <= CURRENT_DATE AND s.status='trial' THEN 'active' ELSE s.status END,
      updated_at = now() WHERE id = s.id;
    subscription_id := s.id; transaction_id := new_tx_id; status := 'charged'; RETURN NEXT;
  END LOOP;
END; $$;

-- 6. MARK CARD INVOICE PAID
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
  INSERT INTO public.transactions (user_id, couple_id, visibility, type, amount, description, date, is_card_payment, source, note)
  VALUES (auth.uid(), inv.couple_id, inv.visibility, 'expense', _payment_amount,
    'Pagamento fatura ' || COALESCE(card_rec.name, 'Cartão'),
    _payment_date, true, 'card_payment',
    'card_invoice_payment:' || _invoice_id::text || ':' || _payment_date::text)
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

-- 7. NOTIFY PARTNER ON SUBSCRIPTION
CREATE OR REPLACE FUNCTION public.notify_partner_on_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid; v_actor_name text; v_partner uuid; v_title text; v_body text; v_dedupe text;
BEGIN
  IF NEW.visibility <> 'shared' OR NEW.couple_id IS NULL THEN RETURN NEW; END IF;
  v_actor := COALESCE(auth.uid(), NEW.created_by);
  SELECT id INTO v_partner FROM public.profiles
    WHERE couple_id = NEW.couple_id AND id <> v_actor LIMIT 1;
  IF v_partner IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, 'Seu parceiro') INTO v_actor_name FROM public.profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Seu parceiro');
  IF TG_OP='INSERT' THEN
    v_title := v_actor_name || ' adicionou uma assinatura compartilhada';
    v_body := NEW.name || ' — R$ ' || to_char(NEW.amount, 'FM999G999G990D00');
    v_dedupe := 'sub_ins:' || NEW.id::text || ':' || v_partner::text;
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.status <> OLD.status AND NEW.status IN ('canceled','paused') THEN
      v_title := v_actor_name || ' ' || CASE NEW.status WHEN 'canceled' THEN 'cancelou' ELSE 'pausou' END || ' uma assinatura';
      v_body := NEW.name;
      v_dedupe := 'sub_' || NEW.status || ':' || NEW.id::text || ':' || v_partner::text;
    ELSE RETURN NEW; END IF;
  END IF;
  INSERT INTO public.notifications (user_id, title, body, type, link, dedupe_key)
  VALUES (v_partner, v_title, v_body, 'subscription', '/app/financas/assinaturas/' || NEW.id::text, v_dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_notify_partner_subscription_ins ON public.subscriptions;
DROP TRIGGER IF EXISTS trg_notify_partner_subscription_upd ON public.subscriptions;
CREATE TRIGGER trg_notify_partner_subscription_ins AFTER INSERT ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_subscription();
CREATE TRIGGER trg_notify_partner_subscription_upd AFTER UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_subscription();

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.card_invoices; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
