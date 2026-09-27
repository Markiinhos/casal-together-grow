CREATE TABLE public.income_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  responsible_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('private', 'shared')),
  name text NOT NULL CHECK (btrim(name) <> ''),
  income_type text NOT NULL CHECK (income_type IN ('salary', 'scholarship', 'freelance', 'benefit', 'commission', 'extra', 'other')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'weekly', 'biweekly', 'annual', 'variable')),
  receipt_day integer CHECK (receipt_day BETWEEN 1 AND 31),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_sources TO authenticated;
GRANT ALL ON public.income_sources TO service_role;

ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY income_sources_select ON public.income_sources
FOR SELECT TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  OR (visibility = 'shared' AND couple_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY income_sources_insert ON public.income_sources
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND created_by = auth.uid()
  AND responsible_user_id IN (
    SELECT p.id FROM public.profiles p
    WHERE p.id = auth.uid()
       OR (couple_id IS NOT NULL AND p.couple_id = income_sources.couple_id AND public.is_couple_member(income_sources.couple_id))
  )
  AND (
    (visibility = 'private' AND couple_id IS NULL AND responsible_user_id = auth.uid())
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  )
);

CREATE POLICY income_sources_update ON public.income_sources
FOR UPDATE TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
) WITH CHECK (
  (visibility = 'private' AND user_id = auth.uid() AND couple_id IS NULL AND responsible_user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

CREATE POLICY income_sources_delete ON public.income_sources
FOR DELETE TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

CREATE INDEX income_sources_couple_active_idx ON public.income_sources (couple_id, is_active) WHERE couple_id IS NOT NULL;
CREATE INDEX income_sources_user_active_idx ON public.income_sources (user_id, is_active);

CREATE TRIGGER income_sources_updated_at
BEFORE UPDATE ON public.income_sources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.future_bills
  ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN responsible text NOT NULL DEFAULT 'both' CHECK (responsible IN ('me', 'partner', 'both')),
  ADD COLUMN responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN payment_method text NOT NULL DEFAULT 'other' CHECK (payment_method IN ('pix', 'debit', 'bank_account', 'credit_card', 'boleto', 'cash', 'other')),
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE INDEX future_bills_couple_active_idx ON public.future_bills (couple_id, is_active) WHERE couple_id IS NOT NULL;
CREATE INDEX future_bills_category_idx ON public.future_bills (category_id) WHERE category_id IS NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.income_sources;