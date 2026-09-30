-- Migration: Cadastro de Bens e Outros Ativos para Composição do Patrimônio Líquido

CREATE TABLE IF NOT EXISTS public.patrimony_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT patrimony_assets_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  couple_id uuid CONSTRAINT patrimony_assets_couple_id_fkey REFERENCES public.couples(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('private', 'shared')),
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('vehicle', 'real_estate', 'electronics', 'jewelry', 'other')),
  estimated_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (estimated_value >= 0),
  acquisition_date date,
  acquisition_value numeric(14,2),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_patrimony_assets_visibility CHECK (
    (visibility = 'private' AND couple_id IS NULL) OR
    (visibility = 'shared' AND couple_id IS NOT NULL)
  )
);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patrimony_assets TO authenticated;
GRANT ALL ON public.patrimony_assets TO service_role;

-- Row Level Security
ALTER TABLE public.patrimony_assets ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "patrimony_assets_select" ON public.patrimony_assets;
CREATE POLICY "patrimony_assets_select" ON public.patrimony_assets
FOR SELECT TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

DROP POLICY IF EXISTS "patrimony_assets_insert" ON public.patrimony_assets;
CREATE POLICY "patrimony_assets_insert" ON public.patrimony_assets
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND (
    (visibility = 'private' AND couple_id IS NULL)
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  )
);

DROP POLICY IF EXISTS "patrimony_assets_update" ON public.patrimony_assets;
CREATE POLICY "patrimony_assets_update" ON public.patrimony_assets
FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
) WITH CHECK (
  (visibility = 'private' AND user_id = auth.uid() AND couple_id IS NULL)
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

DROP POLICY IF EXISTS "patrimony_assets_delete" ON public.patrimony_assets;
CREATE POLICY "patrimony_assets_delete" ON public.patrimony_assets
FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patrimony_assets_user ON public.patrimony_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_patrimony_assets_couple ON public.patrimony_assets(couple_id);
CREATE INDEX IF NOT EXISTS idx_patrimony_assets_active ON public.patrimony_assets(is_active);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_patrimony_assets_updated_at ON public.patrimony_assets;
CREATE TRIGGER trg_patrimony_assets_updated_at
BEFORE UPDATE ON public.patrimony_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'patrimony_assets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patrimony_assets;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
