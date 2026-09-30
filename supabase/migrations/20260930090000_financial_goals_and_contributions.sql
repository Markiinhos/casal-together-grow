-- Migration: Evolução do módulo Metas para Metas Financeiras com Prazo, Ritmo e Contribuições

-- 1. Adicionar novos campos à tabela goals existente
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Reserva',
  ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'financial',
  ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- 2. Adicionar novos campos à tabela goal_contributions existente
ALTER TABLE public.goal_contributions
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- 3. Índice idempotente para fontes externas automáticas
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_contrib_idempotent 
  ON public.goal_contributions(goal_id, source_type, source_id) 
  WHERE source_id IS NOT NULL;

-- 4. Função e trigger para manter current_amount sempre sincronizado com a soma das contribuições
CREATE OR REPLACE FUNCTION public.handle_goal_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_id UUID;
  v_new_sum NUMERIC(14,2);
  v_target NUMERIC(14,2);
  v_current_status TEXT;
  v_couple_id UUID;
  v_user_id UUID;
BEGIN
  v_goal_id := COALESCE(NEW.goal_id, OLD.goal_id);
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  -- Calcula a soma real e precisa de todas as contribuições desta meta
  SELECT COALESCE(SUM(amount), 0) INTO v_new_sum
  FROM public.goal_contributions
  WHERE goal_id = v_goal_id;

  SELECT target_amount, status, couple_id INTO v_target, v_current_status, v_couple_id
  FROM public.goals
  WHERE id = v_goal_id;

  IF v_target IS NOT NULL THEN
    -- Atualiza o valor acumulado da meta
    IF v_new_sum >= v_target AND v_target > 0 THEN
      UPDATE public.goals
      SET current_amount = v_new_sum,
          status = 'completed',
          completed_at = COALESCE(completed_at, now()),
          updated_at = now()
      WHERE id = v_goal_id;

      -- Se acabou de bater a meta, premia com pontos
      IF v_current_status <> 'completed' THEN
        PERFORM public.award_points(v_user_id, v_couple_id, 20, 'goal_completed', 'goals', v_goal_id);
      END IF;
    ELSE
      UPDATE public.goals
      SET current_amount = v_new_sum,
          status = CASE WHEN v_current_status = 'completed' THEN 'active' ELSE v_current_status END,
          completed_at = CASE WHEN v_current_status = 'completed' THEN NULL ELSE completed_at END,
          updated_at = now()
      WHERE id = v_goal_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Atualizar o trigger para disparar em INSERT, UPDATE e DELETE
DROP TRIGGER IF EXISTS trg_goal_contribution ON public.goal_contributions;
CREATE TRIGGER trg_goal_contribution
  AFTER INSERT OR UPDATE OR DELETE ON public.goal_contributions
  FOR EACH ROW EXECUTE FUNCTION public.handle_goal_contribution();

-- 5. Atualizar políticas RLS para goal_contributions (permitir UPDATE para edição)
DROP POLICY IF EXISTS "couple goal contrib rw" ON public.goal_contributions;
CREATE POLICY "couple goal contrib rw" ON public.goal_contributions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.goals g 
    WHERE g.id = goal_id 
      AND (g.user_id = auth.uid() OR (g.couple_id IS NOT NULL AND g.couple_id = public.current_couple_id()))
  ))
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.goals g 
      WHERE g.id = goal_id 
        AND (g.user_id = auth.uid() OR (g.couple_id IS NOT NULL AND g.couple_id = public.current_couple_id()))
    )
  );

-- 6. Garantir realtime em goals e goal_contributions
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.goals; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.goal_contributions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
