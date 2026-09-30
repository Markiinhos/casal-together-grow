-- Migration: Módulo de Fechamento do Mês (Fotografia Financeira e Histórico de Snapshots)

CREATE TABLE IF NOT EXISTS public.monthly_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT monthly_closings_user_id_fkey REFERENCES public.profiles(id) ON DELETE CASCADE,
  couple_id uuid CONSTRAINT monthly_closings_couple_id_fkey REFERENCES public.couples(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'shared' CHECK (visibility IN ('private', 'shared')),
  reference_month date NOT NULL,
  status text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'reopened')),
  total_income numeric(14,2) NOT NULL DEFAULT 0,
  total_expenses numeric(14,2) NOT NULL DEFAULT 0,
  monthly_balance numeric(14,2) NOT NULL DEFAULT 0,
  savings_rate numeric(6,2) NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopened_at timestamptz,
  reopened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopen_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_monthly_closings_visibility CHECK (
    (visibility = 'private' AND couple_id IS NULL) OR
    (visibility = 'shared' AND couple_id IS NOT NULL)
  ),
  CONSTRAINT uq_monthly_closings_scope UNIQUE (user_id, reference_month, visibility)
);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_closings TO authenticated;
GRANT ALL ON public.monthly_closings TO service_role;

-- Row Level Security
ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "monthly_closings_select" ON public.monthly_closings;
CREATE POLICY "monthly_closings_select" ON public.monthly_closings
FOR SELECT TO authenticated USING (
  (visibility = 'private' AND user_id = auth.uid())
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

DROP POLICY IF EXISTS "monthly_closings_insert" ON public.monthly_closings;
CREATE POLICY "monthly_closings_insert" ON public.monthly_closings
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND (
    (visibility = 'private' AND couple_id IS NULL)
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  )
);

DROP POLICY IF EXISTS "monthly_closings_update" ON public.monthly_closings;
CREATE POLICY "monthly_closings_update" ON public.monthly_closings
FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
) WITH CHECK (
  (visibility = 'private' AND user_id = auth.uid() AND couple_id IS NULL)
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

DROP POLICY IF EXISTS "monthly_closings_delete" ON public.monthly_closings;
CREATE POLICY "monthly_closings_delete" ON public.monthly_closings
FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_monthly_closings_user ON public.monthly_closings(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_couple ON public.monthly_closings(couple_id);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_ref_month ON public.monthly_closings(reference_month);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_status ON public.monthly_closings(status);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_monthly_closings_updated_at ON public.monthly_closings;
CREATE TRIGGER trg_monthly_closings_updated_at
BEFORE UPDATE ON public.monthly_closings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'monthly_closings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_closings;
  END IF;
END $$;

-- Invalidate PostgREST schema cache
NOTIFY pgrst, 'reload schema';
