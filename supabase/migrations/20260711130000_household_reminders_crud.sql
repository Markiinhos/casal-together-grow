-- Migration: household reminders and history

CREATE TABLE IF NOT EXISTS public.household_need_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_need_id uuid NOT NULL REFERENCES public.household_needs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  couple_id uuid,
  reminder_type text NOT NULL,
  remind_at timestamptz NOT NULL,
  timezone text,
  status text NOT NULL DEFAULT 'pending',
  notification_id uuid,
  dedupe_key text UNIQUE,
  sent_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.household_need_reminders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_need_reminders TO authenticated;
GRANT ALL ON public.household_need_reminders TO service_role;

CREATE POLICY "household_reminders_select" ON public.household_need_reminders FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "household_reminders_insert" ON public.household_need_reminders FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.profiles p1, public.profiles p2
  WHERE p1.id = auth.uid() AND p1.couple_id = p2.couple_id AND p2.id = public.household_need_reminders.user_id
));

CREATE POLICY "household_reminders_update" ON public.household_need_reminders FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.profiles p1, public.profiles p2
  WHERE p1.id = auth.uid() AND p1.couple_id = p2.couple_id AND p2.id = public.household_need_reminders.user_id
));

CREATE POLICY "household_reminders_delete" ON public.household_need_reminders FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_hh_reminders_pending ON public.household_need_reminders(status, remind_at) WHERE status = 'pending';

-- Trigger to recalculate reminders automatically if date changes, but let's also allow frontend to manage them.
-- Actually the prompt explicitly says: "Recalcular lembretes ao editar a data... Cancelar os horários antigos. Criar ou atualizar os novos horários... Não alterar enviados... Informar visualmente...". This might be easier to manage on the client side mutating the API, rather than a magic trigger, because the client needs to explicitly set `timezone` and we don't know the user timezone inside the trigger reliably without relying on `timezone` column and date intervals. Let's do it in the API/frontend query.
-- I'll just create a function to process reminders.

CREATE OR REPLACE FUNCTION public.process_household_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rec record;
  v_notification_id uuid;
  v_dedupe text;
  v_title text;
  v_body text;
  v_need_title text;
BEGIN
  FOR v_rec IN 
    SELECT r.id, r.user_id, r.household_need_id, n.title, r.remind_at, r.timezone, r.reminder_type
    FROM public.household_need_reminders r
    JOIN public.household_needs n ON n.id = r.household_need_id
    WHERE r.status = 'pending' AND r.remind_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Mark processing
      UPDATE public.household_need_reminders SET status = 'processing' WHERE id = v_rec.id;
      
      v_need_title := v_rec.title;
      v_dedupe := 'household_reminder:' || v_rec.household_need_id::text || ':' || v_rec.user_id::text || ':' || extract(epoch from v_rec.remind_at)::text;
      
      v_title := 'Lembrete da casa';
      IF v_rec.reminder_type = 'same_day' THEN
        v_body := 'Sua compra/item "' || v_need_title || '" está planejada para hoje.';
      ELSIF v_rec.reminder_type = 'one_day_before' THEN
        v_body := 'Sua compra/item "' || v_need_title || '" está planejada para amanhã.';
      ELSIF v_rec.reminder_type = 'one_week_before' THEN
        v_body := 'Sua compra/item "' || v_need_title || '" está planejada para a próxima semana.';
      ELSE
        v_body := 'O item da casa "' || v_need_title || '" requer sua atenção.';
      END IF;

      -- Create notification
      INSERT INTO public.notifications (user_id, title, body, type, link, dedupe_key)
      VALUES (v_rec.user_id, v_title, v_body, 'household_reminder', '/app/casa/compras/' || v_rec.household_need_id::text, v_dedupe)
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id INTO v_notification_id;
      
      IF v_notification_id IS NULL THEN
        SELECT id INTO v_notification_id FROM public.notifications WHERE dedupe_key = v_dedupe LIMIT 1;
      END IF;

      -- Mark sent
      UPDATE public.household_need_reminders 
      SET status = 'sent', sent_at = now(), notification_id = v_notification_id 
      WHERE id = v_rec.id;
      
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.household_need_reminders 
      SET status = 'failed', last_error = SQLERRM 
      WHERE id = v_rec.id;
    END;
  END LOOP;
END;
$$;

-- Setup pg_cron if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('process_hh_reminders_5min', '*/5 * * * *', 'SELECT public.process_household_reminders()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- ignore if not supported
END;
$$;

-- Keep household_needs_history
CREATE TABLE IF NOT EXISTS public.household_need_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_need_id uuid NOT NULL REFERENCES public.household_needs(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.household_need_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.household_need_history TO authenticated;
GRANT ALL ON public.household_need_history TO service_role;

CREATE POLICY "household_history_select" ON public.household_need_history FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.household_needs n 
  WHERE n.id = household_need_id AND (
    n.user_id = auth.uid() OR n.couple_id = (SELECT couple_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  )
));

CREATE OR REPLACE FUNCTION public.trg_household_need_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := NULL;
  v_action text;
BEGIN
  -- Attempt to get user from auth.uid(), fallback if missing.
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN END;
  IF v_user_id IS NULL AND TG_OP = 'INSERT' THEN v_user_id := NEW.created_by; END IF;
  
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    INSERT INTO public.household_need_history(household_need_id, user_id, action, new_values)
    VALUES(NEW.id, v_user_id, v_action, row_to_json(NEW)::jsonb);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    IF NEW.status <> OLD.status THEN v_action := 'status_changed'; END IF;
    IF NEW.expense_id IS NOT NULL AND OLD.expense_id IS NULL THEN v_action := 'expense_linked'; END IF;
    IF NEW.task_id IS NOT NULL AND OLD.task_id IS NULL THEN v_action := 'task_linked'; END IF;
    
    INSERT INTO public.household_need_history(household_need_id, user_id, action, old_values, new_values)
    VALUES(NEW.id, v_user_id, v_action, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
  END IF;
  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_hh_history_ins ON public.household_needs;
DROP TRIGGER IF EXISTS trg_hh_history_upd ON public.household_needs;
CREATE TRIGGER trg_hh_history_ins AFTER INSERT ON public.household_needs FOR EACH ROW EXECUTE FUNCTION public.trg_household_need_history();
CREATE TRIGGER trg_hh_history_upd AFTER UPDATE ON public.household_needs FOR EACH ROW EXECUTE FUNCTION public.trg_household_need_history();

-- Add dedupe_key column for history/tasks maybe? The user prompt said to use dedupe on household_needs notifications, we did some dedupe.
