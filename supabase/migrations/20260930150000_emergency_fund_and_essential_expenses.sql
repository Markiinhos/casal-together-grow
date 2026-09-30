-- Migration: Suporte a despesas essenciais e Meta Especial de Reserva de Emergência

-- 1. Campos de despesa essencial em future_bills
ALTER TABLE public.future_bills
  ADD COLUMN IF NOT EXISTS is_essential BOOLEAN NOT NULL DEFAULT true;

-- 2. Campos de despesa essencial em variable_expenses
ALTER TABLE public.variable_expenses
  ADD COLUMN IF NOT EXISTS is_essential BOOLEAN NOT NULL DEFAULT false;

-- 3. Campos de despesa essencial em subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_essential BOOLEAN NOT NULL DEFAULT false;

-- 4. Campos em goals para meta especial de reserva de emergência
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS target_months NUMERIC(4,1) DEFAULT 6,
  ADD COLUMN IF NOT EXISTS is_emergency_fund BOOLEAN NOT NULL DEFAULT false;

-- 5. Atualizar realtime se aplicável
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;
  END IF;
END $$;

-- 6. Recarregar cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
