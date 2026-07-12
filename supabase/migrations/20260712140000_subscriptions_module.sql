-- ============================================================
-- SUBSCRIPTIONS MODULE — Tables, RLS, Indexes, Functions
-- ============================================================

-- 1. Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id       UUID REFERENCES public.couples(id) ON DELETE SET NULL,
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility      TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared','private')),

  -- Identification
  name            TEXT NOT NULL,
  description     TEXT,
  category_id     UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  icon            TEXT,
  url             TEXT,

  -- Value
  amount          NUMERIC NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'BRL',
  billing_frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_frequency IN ('weekly','monthly','bimonthly','quarterly','semiannual','annual','custom')),
  billing_interval INTEGER NOT NULL DEFAULT 1 CHECK (billing_interval >= 1),

  -- Dates
  start_date      DATE,
  next_billing_date DATE NOT NULL,
  billing_day     INTEGER CHECK (billing_day BETWEEN 1 AND 31),
  renewal_date    DATE,
  end_date        DATE,

  -- Payment
  payment_method  TEXT DEFAULT 'pix'
    CHECK (payment_method IN ('pix','debit','bank_account','credit_card','boleto','other')),
  account_id      UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  card_id         UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,

  -- Responsibility
  responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Status
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial','active','paused','canceled','ended')),

  -- Trial
  trial_enabled       BOOLEAN NOT NULL DEFAULT false,
  trial_end_date      DATE,
  amount_after_trial  NUMERIC,
  auto_renew          BOOLEAN NOT NULL DEFAULT true,

  -- Tracking
  last_charged_at           TIMESTAMPTZ,
  last_generated_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,

  -- Flexible metadata (notes, plan details, screen count, etc.)
  metadata        JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create subscription_history table
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  changed_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  old_values      JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Idempotency: prevent duplicate charges for same subscription + billing date
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_charge_idempotency
  ON public.transactions (source, date)
  WHERE source IS NOT NULL AND source LIKE 'subscription_charge:%';

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_couple_id ON public.subscriptions (couple_id) WHERE couple_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON public.subscriptions (next_billing_date) WHERE status IN ('active','trial');
CREATE INDEX IF NOT EXISTS idx_subscription_history_sub ON public.subscription_history (subscription_id);

-- 5. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_subscriptions_updated_at();

-- 6. Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for subscriptions
-- SELECT: user can see own private OR couple's shared
CREATE POLICY "subscriptions_select" ON public.subscriptions
  FOR SELECT USING (
    (visibility = 'private' AND user_id = auth.uid())
    OR
    (visibility = 'shared' AND couple_id IN (
      SELECT couple_id FROM public.profiles WHERE id = auth.uid() AND couple_id IS NOT NULL
    ))
  );

-- INSERT: user must be authenticated, user_id = auth.uid()
-- For shared: couple_id must match the user's profile
CREATE POLICY "subscriptions_insert" ON public.subscriptions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND auth.uid() = created_by
    AND (
      (visibility = 'private' AND couple_id IS NULL)
      OR
      (visibility = 'shared' AND couple_id IN (
        SELECT couple_id FROM public.profiles WHERE id = auth.uid() AND couple_id IS NOT NULL
      ))
    )
  );

-- UPDATE: same visibility rules
CREATE POLICY "subscriptions_update" ON public.subscriptions
  FOR UPDATE USING (
    (visibility = 'private' AND user_id = auth.uid())
    OR
    (visibility = 'shared' AND couple_id IN (
      SELECT couple_id FROM public.profiles WHERE id = auth.uid() AND couple_id IS NOT NULL
    ))
  ) WITH CHECK (
    (visibility = 'private' AND user_id = auth.uid())
    OR
    (visibility = 'shared' AND couple_id IN (
      SELECT couple_id FROM public.profiles WHERE id = auth.uid() AND couple_id IS NOT NULL
    ))
  );

-- DELETE: only owner for private, couple member for shared
CREATE POLICY "subscriptions_delete" ON public.subscriptions
  FOR DELETE USING (
    (visibility = 'private' AND user_id = auth.uid())
    OR
    (visibility = 'shared' AND couple_id IN (
      SELECT couple_id FROM public.profiles WHERE id = auth.uid() AND couple_id IS NOT NULL
    ))
  );

-- 8. RLS for subscription_history
CREATE POLICY "subscription_history_select" ON public.subscription_history
  FOR SELECT USING (
    subscription_id IN (SELECT id FROM public.subscriptions)
  );

CREATE POLICY "subscription_history_insert" ON public.subscription_history
  FOR INSERT WITH CHECK (
    auth.uid() = changed_by
    AND subscription_id IN (SELECT id FROM public.subscriptions)
  );

-- 9. Helper: calculate next billing date from current date and frequency
CREATE OR REPLACE FUNCTION public.calc_next_billing_date(
  p_current_date DATE,
  p_frequency TEXT,
  p_interval INTEGER DEFAULT 1
) RETURNS DATE AS $$
BEGIN
  RETURN CASE p_frequency
    WHEN 'weekly'     THEN p_current_date + (7 * p_interval)
    WHEN 'monthly'    THEN p_current_date + (INTERVAL '1 month' * p_interval)
    WHEN 'bimonthly'  THEN p_current_date + INTERVAL '2 months'
    WHEN 'quarterly'  THEN p_current_date + INTERVAL '3 months'
    WHEN 'semiannual' THEN p_current_date + INTERVAL '6 months'
    WHEN 'annual'     THEN p_current_date + INTERVAL '1 year'
    WHEN 'custom'     THEN p_current_date + (INTERVAL '1 month' * p_interval)
    ELSE p_current_date + INTERVAL '1 month'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 10. Function to process due subscription charges (called via cron or Edge Function)
-- This is IDEMPOTENT — uses source field as dedupe key
CREATE OR REPLACE FUNCTION public.process_subscription_charges()
RETURNS TABLE(subscription_id UUID, transaction_id UUID, status TEXT) AS $$
DECLARE
  sub RECORD;
  tx_id UUID;
  dedupe TEXT;
  effective_amount NUMERIC;
BEGIN
  FOR sub IN
    SELECT s.*
    FROM public.subscriptions s
    WHERE s.status IN ('active')
      AND s.next_billing_date <= CURRENT_DATE
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
    ORDER BY s.next_billing_date
  LOOP
    dedupe := 'subscription_charge:' || sub.id || ':' || sub.next_billing_date::TEXT;

    -- Check idempotency: skip if transaction already exists
    IF EXISTS (
      SELECT 1 FROM public.transactions
      WHERE source = dedupe
    ) THEN
      subscription_id := sub.id;
      transaction_id := NULL;
      status := 'skipped_duplicate';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Determine effective amount (trial vs normal)
    IF sub.trial_enabled AND sub.trial_end_date IS NOT NULL AND sub.next_billing_date <= sub.trial_end_date THEN
      effective_amount := 0;
    ELSE
      effective_amount := COALESCE(sub.amount_after_trial, sub.amount);
    END IF;

    -- Create the transaction
    BEGIN
      INSERT INTO public.transactions (
        user_id, couple_id, visibility, type, amount, description, date,
        category_id, credit_card_id, source, is_card_payment
      ) VALUES (
        sub.user_id,
        sub.couple_id,
        sub.visibility,
        'expense',
        effective_amount,
        'Assinatura: ' || sub.name,
        sub.next_billing_date::TEXT,
        sub.category_id,
        sub.card_id,
        dedupe,
        false
      ) RETURNING id INTO tx_id;

      -- Update subscription
      UPDATE public.subscriptions SET
        last_charged_at = now(),
        last_generated_transaction_id = tx_id,
        next_billing_date = public.calc_next_billing_date(
          sub.next_billing_date, sub.billing_frequency, sub.billing_interval
        )
      WHERE id = sub.id;

      -- Record history
      INSERT INTO public.subscription_history (subscription_id, changed_by, action, new_values)
      VALUES (sub.id, sub.created_by, 'charge_generated', jsonb_build_object(
        'transaction_id', tx_id,
        'amount', effective_amount,
        'billing_date', sub.next_billing_date
      ));

      subscription_id := sub.id;
      transaction_id := tx_id;
      status := 'charged';
      RETURN NEXT;

    EXCEPTION WHEN unique_violation THEN
      -- Idempotency catch (concurrent execution)
      subscription_id := sub.id;
      transaction_id := NULL;
      status := 'skipped_concurrent';
      RETURN NEXT;
    WHEN OTHERS THEN
      -- Log error but continue with other subscriptions
      subscription_id := sub.id;
      transaction_id := NULL;
      status := 'error: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
