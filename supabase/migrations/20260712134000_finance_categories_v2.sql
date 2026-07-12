-- Phase 2 Categories & Subcategories Migration

-- 1. Add missing columns to categories
ALTER TABLE public.categories 
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Update existing data correctly
UPDATE public.categories SET visibility = 'shared' WHERE couple_id IS NOT NULL;
UPDATE public.categories SET visibility = 'private' WHERE couple_id IS NULL;

-- 2. Drop old policy and create new ones that respect visibility and is_default
DROP POLICY IF EXISTS "couple categories rw" ON public.categories;

CREATE POLICY "categories_select" ON public.categories FOR SELECT TO authenticated USING (
  is_default = true OR
  user_id = auth.uid() OR 
  (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

CREATE POLICY "categories_insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND 
  (
    (visibility = 'private' AND couple_id IS NULL) OR
    (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  )
);

CREATE POLICY "categories_update" ON public.categories FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR 
  (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

CREATE POLICY "categories_delete" ON public.categories FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR 
  (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

-- 3. Create subcategories table
CREATE TABLE IF NOT EXISTS public.subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  color text,
  is_archived boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcategories TO authenticated;
GRANT ALL ON public.subcategories TO service_role;

-- RLS for subcategories
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subcategories_select" ON public.subcategories FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.categories c WHERE c.id = category_id AND (
      c.is_default = true OR
      c.user_id = auth.uid() OR (c.visibility = 'shared' AND c.couple_id = public.current_couple_id())
    )
  )
);

CREATE POLICY "subcategories_insert" ON public.subcategories FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid()
);

CREATE POLICY "subcategories_update" ON public.subcategories FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.categories c WHERE c.id = category_id AND (
      c.user_id = auth.uid() OR (c.visibility = 'shared' AND c.couple_id = public.current_couple_id())
    )
  )
);

CREATE POLICY "subcategories_delete" ON public.subcategories FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.categories c WHERE c.id = category_id AND (
      c.user_id = auth.uid() OR (c.visibility = 'shared' AND c.couple_id = public.current_couple_id())
    )
  )
);

-- Set updated_at trigger for subcategories
CREATE TRIGGER trg_subcategories_updated 
BEFORE UPDATE ON public.subcategories 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
