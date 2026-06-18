
-- =========================
-- HABITS
-- =========================
CREATE TABLE public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  period text CHECK (period IN ('morning','afternoon','evening','anytime')) DEFAULT 'anytime',
  target_per_week int DEFAULT 7,
  scope text CHECK (scope IN ('individual','couple')) DEFAULT 'individual',
  color text,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT ALL ON public.habits TO service_role;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habits_couple_or_owner" ON public.habits FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)));
CREATE TRIGGER trg_habits_updated BEFORE UPDATE ON public.habits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, user_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_logs TO authenticated;
GRANT ALL ON public.habit_logs TO service_role;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habit_logs_couple_or_owner" ON public.habit_logs FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)));

-- award points when a habit is logged
CREATE OR REPLACE FUNCTION public.handle_habit_log_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_points(NEW.user_id, NEW.couple_id, 3, 'habit_logged', 'habit_logs', NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_habit_log_points AFTER INSERT ON public.habit_logs
FOR EACH ROW EXECUTE FUNCTION public.handle_habit_log_points();

-- =========================
-- ROUTINES
-- =========================
CREATE TABLE public.routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  period text CHECK (period IN ('morning','afternoon','evening')) NOT NULL DEFAULT 'morning',
  weekdays int[] DEFAULT ARRAY[0,1,2,3,4,5,6],
  scope text CHECK (scope IN ('individual','couple')) DEFAULT 'individual',
  position int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routines TO authenticated;
GRANT ALL ON public.routines TO service_role;
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routines_couple_or_owner" ON public.routines FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)));
CREATE TRIGGER trg_routines_updated BEFORE UPDATE ON public.routines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.routine_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  label text NOT NULL,
  position int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routine_items TO authenticated;
GRANT ALL ON public.routine_items TO service_role;
ALTER TABLE public.routine_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routine_items_via_routine" ON public.routine_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routines r WHERE r.id = routine_id AND (r.user_id = auth.uid() OR (r.couple_id IS NOT NULL AND public.is_couple_member(r.couple_id)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.routines r WHERE r.id = routine_id AND (r.user_id = auth.uid() OR (r.couple_id IS NOT NULL AND public.is_couple_member(r.couple_id)))));

CREATE TABLE public.routine_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_item_id uuid NOT NULL REFERENCES public.routine_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (routine_item_id, user_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routine_completions TO authenticated;
GRANT ALL ON public.routine_completions TO service_role;
ALTER TABLE public.routine_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routine_completions_couple_or_owner" ON public.routine_completions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)));

-- =========================
-- WEEKLY / MONTHLY GOALS
-- =========================
CREATE TABLE public.period_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  period_type text CHECK (period_type IN ('week','month')) NOT NULL,
  period_start date NOT NULL,
  scope text CHECK (scope IN ('individual','couple')) DEFAULT 'individual',
  priority text CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
  status text CHECK (status IN ('pending','in_progress','done')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_goals TO authenticated;
GRANT ALL ON public.period_goals TO service_role;
ALTER TABLE public.period_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "period_goals_couple_or_owner" ON public.period_goals FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)))
  WITH CHECK (user_id = auth.uid() OR (couple_id IS NOT NULL AND public.is_couple_member(couple_id)));
CREATE TRIGGER trg_period_goals_updated BEFORE UPDATE ON public.period_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_period_goal_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status='done' AND COALESCE(OLD.status,'') <> 'done' THEN
    PERFORM public.award_points(NEW.user_id, NEW.couple_id,
      CASE WHEN NEW.period_type='month' THEN 25 ELSE 15 END,
      'period_goal_done','period_goals', NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_period_goal_points AFTER UPDATE ON public.period_goals
FOR EACH ROW EXECUTE FUNCTION public.handle_period_goal_points();

-- =========================
-- REALTIME
-- =========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.habits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.habit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.routines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.routine_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.routine_completions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.period_goals;
