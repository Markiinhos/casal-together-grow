-- Create variable_expenses table for financial structure
CREATE TABLE IF NOT EXISTS public.variable_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT variable_expenses_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  couple_id uuid CONSTRAINT variable_expenses_couple_id_fkey REFERENCES public.couples(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
  name text NOT NULL CHECK (btrim(name) <> ''),
  estimated_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (estimated_amount >= 0),
  category_id uuid CONSTRAINT variable_expenses_category_id_fkey REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id uuid CONSTRAINT variable_expenses_subcategory_id_fkey REFERENCES public.categories(id) ON DELETE SET NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((visibility = 'private' AND couple_id IS NULL) OR (visibility = 'shared' AND couple_id IS NOT NULL))
);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variable_expenses TO authenticated;
GRANT ALL ON public.variable_expenses TO service_role;

-- Row Level Security
ALTER TABLE public.variable_expenses ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS variable_expenses_select ON public.variable_expenses;
DROP POLICY IF EXISTS "variable_expenses_select" ON public.variable_expenses;
CREATE POLICY "variable_expenses_select" ON public.variable_expenses
FOR SELECT TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

DROP POLICY IF EXISTS variable_expenses_insert ON public.variable_expenses;
DROP POLICY IF EXISTS "variable_expenses_insert" ON public.variable_expenses;
CREATE POLICY "variable_expenses_insert" ON public.variable_expenses
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND (
    (visibility = 'private' AND couple_id IS NULL)
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  )
);

DROP POLICY IF EXISTS variable_expenses_update ON public.variable_expenses;
DROP POLICY IF EXISTS "variable_expenses_update" ON public.variable_expenses;
CREATE POLICY "variable_expenses_update" ON public.variable_expenses
FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
) WITH CHECK (
  (visibility = 'private' AND user_id = auth.uid() AND couple_id IS NULL)
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

DROP POLICY IF EXISTS variable_expenses_delete ON public.variable_expenses;
DROP POLICY IF EXISTS "variable_expenses_delete" ON public.variable_expenses;
CREATE POLICY "variable_expenses_delete" ON public.variable_expenses
FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_variable_expenses_user ON public.variable_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_variable_expenses_couple ON public.variable_expenses(couple_id);
CREATE INDEX IF NOT EXISTS idx_variable_expenses_visibility ON public.variable_expenses(visibility);
CREATE INDEX IF NOT EXISTS idx_variable_expenses_active ON public.variable_expenses(is_active);
CREATE INDEX IF NOT EXISTS idx_variable_expenses_category ON public.variable_expenses(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variable_expenses_subcategory ON public.variable_expenses(subcategory_id) WHERE subcategory_id IS NOT NULL;

-- Trigger updated_at
DROP TRIGGER IF EXISTS variable_expenses_updated_at ON public.variable_expenses;
CREATE TRIGGER variable_expenses_updated_at
BEFORE UPDATE ON public.variable_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'variable_expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.variable_expenses;
  END IF;
END $$;

-- Invalidate PostgREST schema cache
NOTIFY pgrst, 'reload schema';
