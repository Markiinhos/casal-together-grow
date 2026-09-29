-- Create variable_expenses table for financial structure
CREATE TABLE IF NOT EXISTS public.variable_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('private', 'shared')),
  name text NOT NULL CHECK (btrim(name) <> ''),
  estimated_amount numeric(14,2) NOT NULL CHECK (estimated_amount >= 0),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variable_expenses TO authenticated;
GRANT ALL ON public.variable_expenses TO service_role;

-- Row Level Security
ALTER TABLE public.variable_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY variable_expenses_select ON public.variable_expenses
FOR SELECT TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  OR (visibility = 'shared' AND couple_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY variable_expenses_insert ON public.variable_expenses
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND created_by = auth.uid()
  AND (
    (visibility = 'private' AND couple_id IS NULL)
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    OR (visibility = 'shared' AND couple_id IS NULL)
  )
);

CREATE POLICY variable_expenses_update ON public.variable_expenses
FOR UPDATE TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  OR (visibility = 'shared' AND couple_id IS NULL AND user_id = auth.uid())
) WITH CHECK (
  (visibility = 'private' AND user_id = auth.uid() AND couple_id IS NULL)
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  OR (visibility = 'shared' AND couple_id IS NULL AND user_id = auth.uid())
);

CREATE POLICY variable_expenses_delete ON public.variable_expenses
FOR DELETE TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  OR (visibility = 'shared' AND couple_id IS NULL AND user_id = auth.uid())
);

-- Indexes
CREATE INDEX IF NOT EXISTS variable_expenses_couple_active_idx ON public.variable_expenses (couple_id, is_active) WHERE couple_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS variable_expenses_user_active_idx ON public.variable_expenses (user_id, is_active);
CREATE INDEX IF NOT EXISTS variable_expenses_category_idx ON public.variable_expenses (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS variable_expenses_subcategory_idx ON public.variable_expenses (subcategory_id) WHERE subcategory_id IS NOT NULL;

-- Trigger updated_at
CREATE TRIGGER variable_expenses_updated_at
BEFORE UPDATE ON public.variable_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.variable_expenses;
