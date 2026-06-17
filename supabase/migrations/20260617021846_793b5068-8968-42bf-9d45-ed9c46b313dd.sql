
-- ============================================================
-- FASE 2 — FINANÇAS
-- ============================================================

-- credit_cards
CREATE TABLE IF NOT EXISTS public.credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  bank text,
  color text NOT NULL DEFAULT '#7B61FF',
  limit_amount numeric(12,2) NOT NULL DEFAULT 0,
  closing_day int NOT NULL DEFAULT 1 CHECK (closing_day BETWEEN 1 AND 31),
  due_day int NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 31),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_cards TO authenticated;
GRANT ALL ON public.credit_cards TO service_role;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple cc rw" ON public.credit_cards FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));
CREATE TRIGGER trg_cc_updated BEFORE UPDATE ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- transactions: add card + installment columns
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS credit_card_id uuid REFERENCES public.credit_cards(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS total_installments int;

-- installments
CREATE TABLE IF NOT EXISTS public.installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  installment_number int NOT NULL,
  total_installments int NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installments TO authenticated;
GRANT ALL ON public.installments TO service_role;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple inst rw" ON public.installments FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));

-- trigger: when a transaction has total_installments > 1, generate installments
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
BEGIN
  IF NEW.total_installments IS NULL OR NEW.total_installments <= 1 THEN
    RETURN NEW;
  END IF;
  per := round(NEW.amount::numeric / NEW.total_installments, 2);
  base_date := COALESCE(NEW.date, CURRENT_DATE);
  FOR i IN 1..NEW.total_installments LOOP
    INSERT INTO public.installments (transaction_id, couple_id, user_id, installment_number, total_installments, amount, due_date)
    VALUES (NEW.id, NEW.couple_id, NEW.user_id, i, NEW.total_installments, per, (base_date + ((i - 1) || ' months')::interval)::date);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tx_installments ON public.transactions;
CREATE TRIGGER trg_tx_installments AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.generate_installments();

-- future_bills
CREATE TABLE IF NOT EXISTS public.future_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  recurrence text NOT NULL DEFAULT 'once',  -- once|weekly|monthly|yearly
  category text,
  paid boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.future_bills TO authenticated;
GRANT ALL ON public.future_bills TO service_role;
ALTER TABLE public.future_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple fb rw" ON public.future_bills FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));
CREATE TRIGGER trg_fb_updated BEFORE UPDATE ON public.future_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- bank_connections (stub for future Open Finance)
CREATE TABLE IF NOT EXISTS public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  provider text NOT NULL,   -- mercadopago|nubank|inter|bb|caixa
  status text NOT NULL DEFAULT 'pending',
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections TO authenticated;
GRANT ALL ON public.bank_connections TO service_role;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank conn" ON public.bank_connections FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FASE 3 — VIDA A DOIS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_type text NOT NULL,  -- breakfast|lunch|dinner|snack
  title text NOT NULL,
  notes text,
  favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plans TO authenticated;
GRANT ALL ON public.meal_plans TO service_role;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple mp rw" ON public.meal_plans FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));

CREATE TABLE IF NOT EXISTS public.shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'mercado',  -- mercado|hortifruti|acougue|farmacia|outros
  quantity text,
  checked boolean NOT NULL DEFAULT false,
  meal_plan_id uuid REFERENCES public.meal_plans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_items TO authenticated;
GRANT ALL ON public.shopping_items TO service_role;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple si rw" ON public.shopping_items FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));

CREATE TABLE IF NOT EXISTS public.dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  location text,
  date_at timestamptz,
  planned_amount numeric(12,2),
  notes text,
  status text NOT NULL DEFAULT 'planned',   -- planned|done|canceled
  cover_photo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dates TO authenticated;
GRANT ALL ON public.dates TO service_role;
ALTER TABLE public.dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple dates rw" ON public.dates FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));
CREATE TRIGGER trg_dates_updated BEFORE UPDATE ON public.dates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.memory_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  cover text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_albums TO authenticated;
GRANT ALL ON public.memory_albums TO service_role;
ALTER TABLE public.memory_albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple alb rw" ON public.memory_albums FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()));

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS album_id uuid REFERENCES public.memory_albums(id) ON DELETE SET NULL;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS photo_path text;

-- ============================================================
-- FASE 4 — SAÚDE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  weight numeric(5,2),
  height numeric(5,2),
  target_weight numeric(5,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_metrics TO authenticated;
GRANT ALL ON public.health_metrics TO service_role;
ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple hm rw" ON public.health_metrics FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.water_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  ml int NOT NULL DEFAULT 250,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.water_intake TO authenticated;
GRANT ALL ON public.water_intake TO service_role;
ALTER TABLE public.water_intake ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple wi rw" ON public.water_intake FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL,
  duration_min int NOT NULL DEFAULT 30,
  calories int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workouts TO authenticated;
GRANT ALL ON public.workouts TO service_role;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple wk rw" ON public.workouts FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.health_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text NOT NULL,  -- breakfast|lunch|dinner|snack
  description text NOT NULL,
  calories int,
  photo_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_meals TO authenticated;
GRANT ALL ON public.health_meals TO service_role;
ALTER TABLE public.health_meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couple hmeals rw" ON public.health_meals FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id()))
  WITH CHECK (user_id = auth.uid());
