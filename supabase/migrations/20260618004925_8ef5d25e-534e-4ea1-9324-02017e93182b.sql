
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  instructions text,
  prep_minutes int,
  servings int DEFAULT 2,
  tags text[] DEFAULT ARRAY[]::text[],
  favorite boolean DEFAULT false,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipes_couple_or_owner" ON public.recipes FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)));
CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servings int DEFAULT 2;

ALTER PUBLICATION supabase_realtime ADD TABLE public.recipes;
