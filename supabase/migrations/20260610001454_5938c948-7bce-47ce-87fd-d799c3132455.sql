
CREATE TABLE IF NOT EXISTS public.user_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  ref_table text, ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_points TO authenticated;
GRANT ALL ON public.user_points TO service_role;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read couple points" ON public.user_points FOR SELECT TO authenticated
  USING ((couple_id IS NULL AND user_id = auth.uid()) OR public.is_couple_member(couple_id));
CREATE POLICY "self insert points" ON public.user_points FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_user_points_user ON public.user_points(user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_couple ON public.user_points(couple_id);

CREATE OR REPLACE FUNCTION public.award_points(_user_id uuid,_couple_id uuid,_points int,_reason text,_ref_table text,_ref_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO public.user_points(user_id,couple_id,points,reason,ref_table,ref_id) VALUES (_user_id,_couple_id,_points,_reason,_ref_table,_ref_id); END; $$;

CREATE OR REPLACE FUNCTION public.handle_goal_contribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_target numeric; v_new numeric; v_couple uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.goals SET current_amount=COALESCE(current_amount,0)+NEW.amount, updated_at=now()
     WHERE id=NEW.goal_id RETURNING target_amount,current_amount,couple_id INTO v_target,v_new,v_couple;
    IF v_new>=v_target THEN
      UPDATE public.goals SET status='completed',updated_at=now() WHERE id=NEW.goal_id AND status<>'completed';
      PERFORM public.award_points(NEW.user_id,v_couple,20,'goal_completed','goals',NEW.goal_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.goals SET current_amount=GREATEST(0,COALESCE(current_amount,0)-OLD.amount),updated_at=now() WHERE id=OLD.goal_id;
    RETURN OLD;
  END IF; RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_goal_contribution ON public.goal_contributions;
CREATE TRIGGER trg_goal_contribution AFTER INSERT OR DELETE ON public.goal_contributions FOR EACH ROW EXECUTE FUNCTION public.handle_goal_contribution();

CREATE OR REPLACE FUNCTION public.handle_transaction_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.award_points(NEW.user_id,NEW.couple_id,5,
  CASE WHEN NEW.type='income' THEN 'transaction_income' ELSE 'transaction_expense' END,'transactions',NEW.id);
  RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_transaction_points ON public.transactions;
CREATE TRIGGER trg_transaction_points AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.handle_transaction_points();

CREATE OR REPLACE FUNCTION public.handle_task_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (TG_OP='UPDATE' AND NEW.completed=true AND COALESCE(OLD.completed,false)=false) THEN
    PERFORM public.award_points(COALESCE(NEW.completed_by,NEW.user_id),NEW.couple_id,10,'task_completed','house_tasks',NEW.id);
  END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_task_points ON public.house_tasks;
CREATE TRIGGER trg_task_points AFTER UPDATE ON public.house_tasks FOR EACH ROW EXECUTE FUNCTION public.handle_task_points();

CREATE INDEX IF NOT EXISTS idx_tx_couple_date ON public.transactions(couple_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_category ON public.transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_events_couple_date ON public.events(couple_id, event_date);
CREATE INDEX IF NOT EXISTS idx_tasks_couple_due ON public.house_tasks(couple_id, due_date);
CREATE INDEX IF NOT EXISTS idx_goals_couple ON public.goals(couple_id);
CREATE INDEX IF NOT EXISTS idx_memories_couple ON public.memories(couple_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

CREATE OR REPLACE VIEW public.dashboard_finance AS
SELECT couple_id, date_trunc('month', date)::date AS month,
       SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense,
       SUM(CASE WHEN type='income' THEN amount ELSE -amount END) AS balance
FROM public.transactions GROUP BY couple_id, date_trunc('month', date);

CREATE OR REPLACE VIEW public.dashboard_goals AS
SELECT id, couple_id, name, target_amount, current_amount, status, deadline,
       CASE WHEN target_amount>0 THEN ROUND((current_amount/target_amount)*100,2) ELSE 0 END AS progress_pct
FROM public.goals;

CREATE OR REPLACE VIEW public.dashboard_tasks AS
SELECT couple_id,
       COUNT(*) FILTER (WHERE completed=false) AS pending,
       COUNT(*) FILTER (WHERE completed=true)  AS done,
       COUNT(*) FILTER (WHERE completed=false AND due_date < CURRENT_DATE) AS late
FROM public.house_tasks GROUP BY couple_id;

GRANT SELECT ON public.dashboard_finance, public.dashboard_goals, public.dashboard_tasks TO authenticated;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.goals; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.goal_contributions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.house_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.memories; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_points; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
