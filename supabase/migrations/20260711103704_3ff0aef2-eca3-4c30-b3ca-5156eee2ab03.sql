
-- 1) Add dedupe_key to notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uidx
  ON public.notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 2) Trigger for shared transactions (partner notifications)
CREATE OR REPLACE FUNCTION public.notify_partner_on_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_couple uuid; v_actor uuid; v_actor_name text; v_partner uuid;
  v_title text; v_body text; v_dedupe text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_couple := OLD.couple_id; v_actor := auth.uid();
  ELSE
    v_couple := NEW.couple_id; v_actor := COALESCE(auth.uid(), NEW.user_id);
  END IF;

  IF v_couple IS NULL OR COALESCE(NEW.visibility, OLD.visibility) IS DISTINCT FROM 'shared' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_partner FROM public.profiles
   WHERE couple_id = v_couple AND id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
  IF v_partner IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(full_name, 'Seu parceiro') INTO v_actor_name FROM public.profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Seu parceiro');

  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'expense' THEN
      v_title := v_actor_name || ' adicionou uma nova despesa';
    ELSE
      v_title := v_actor_name || ' adicionou uma nova receita';
    END IF;
    v_body := COALESCE(NEW.description, 'Sem descrição') || ' — R$ ' || to_char(NEW.amount, 'FM999G999G990D00');
    v_dedupe := 'tx_ins:' || NEW.id::text || ':' || v_partner::text;
    INSERT INTO public.notifications (user_id, title, body, type, link, dedupe_key)
    VALUES (v_partner, v_title, v_body, 'finance', '/app/financas', v_dedupe)
    ON CONFLICT (dedupe_key) DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.description IS DISTINCT FROM OLD.description OR NEW.date IS DISTINCT FROM OLD.date THEN
      v_title := v_actor_name || ' atualizou uma despesa compartilhada';
      v_body := COALESCE(NEW.description, 'Sem descrição') || ' — R$ ' || to_char(NEW.amount, 'FM999G999G990D00');
      v_dedupe := 'tx_upd:' || NEW.id::text || ':' || v_partner::text || ':' || extract(epoch from now())::bigint::text;
      INSERT INTO public.notifications (user_id, title, body, type, link, dedupe_key)
      VALUES (v_partner, v_title, v_body, 'finance', '/app/financas', v_dedupe)
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_partner_on_transaction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_partner_transaction_ins ON public.transactions;
DROP TRIGGER IF EXISTS trg_notify_partner_transaction_upd ON public.transactions;
CREATE TRIGGER trg_notify_partner_transaction_ins AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_transaction();
CREATE TRIGGER trg_notify_partner_transaction_upd AFTER UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_transaction();

-- 3) Trigger for shared events (agenda)
CREATE OR REPLACE FUNCTION public.notify_partner_on_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_couple uuid; v_actor uuid; v_actor_name text; v_partner uuid;
  v_title text; v_body text; v_dedupe text; v_visibility text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_couple := OLD.couple_id; v_actor := auth.uid(); v_visibility := OLD.visibility;
  ELSE
    v_couple := NEW.couple_id; v_actor := COALESCE(auth.uid(), NEW.user_id); v_visibility := NEW.visibility;
  END IF;

  IF v_couple IS NULL OR v_visibility IS DISTINCT FROM 'shared' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO v_partner FROM public.profiles
   WHERE couple_id = v_couple AND id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
  IF v_partner IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(full_name, 'Seu parceiro') INTO v_actor_name FROM public.profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Seu parceiro');

  IF TG_OP = 'INSERT' THEN
    v_title := v_actor_name || ' adicionou um evento na agenda';
    v_body := NEW.title || ' — ' || to_char(NEW.event_date, 'DD/MM/YYYY');
    v_dedupe := 'ev_ins:' || NEW.id::text || ':' || v_partner::text;
  ELSIF TG_OP = 'DELETE' THEN
    v_title := v_actor_name || ' cancelou um evento';
    v_body := OLD.title;
    v_dedupe := 'ev_del:' || OLD.id::text || ':' || v_partner::text;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.event_date IS DISTINCT FROM OLD.event_date OR NEW.event_time IS DISTINCT FROM OLD.event_time OR NEW.title IS DISTINCT FROM OLD.title THEN
      v_title := v_actor_name || ' atualizou um evento';
      v_body := NEW.title || ' — ' || to_char(NEW.event_date, 'DD/MM/YYYY');
      v_dedupe := 'ev_upd:' || NEW.id::text || ':' || v_partner::text || ':' || extract(epoch from now())::bigint::text;
    ELSE RETURN NEW; END IF;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link, dedupe_key)
  VALUES (v_partner, v_title, v_body, 'event', '/app/agenda', v_dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_partner_on_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_partner_event_ins ON public.events;
DROP TRIGGER IF EXISTS trg_notify_partner_event_upd ON public.events;
DROP TRIGGER IF EXISTS trg_notify_partner_event_del ON public.events;
CREATE TRIGGER trg_notify_partner_event_ins AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_event();
CREATE TRIGGER trg_notify_partner_event_upd AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_event();
CREATE TRIGGER trg_notify_partner_event_del AFTER DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_event();

-- 4) household_needs table
CREATE TABLE IF NOT EXISTS public.household_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid,
  user_id uuid NOT NULL,
  created_by uuid NOT NULL,
  assigned_to uuid,
  title text NOT NULL,
  description text,
  item_type text NOT NULL DEFAULT 'purchase',
  category text,
  estimated_amount numeric(12,2),
  actual_amount numeric(12,2),
  planned_date date,
  planned_month date,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'idea',
  planned_payment_method text,
  planned_installments integer DEFAULT 1,
  visibility text NOT NULL DEFAULT 'shared',
  simulation_id uuid,
  expense_id uuid,
  task_id uuid,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_needs TO authenticated;
GRANT ALL ON public.household_needs TO service_role;
ALTER TABLE public.household_needs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household_needs_select" ON public.household_needs FOR SELECT TO authenticated
USING (
  (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  OR (visibility = 'private' AND user_id = auth.uid())
  OR (couple_id IS NULL AND user_id = auth.uid())
);
CREATE POLICY "household_needs_insert" ON public.household_needs FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND user_id = auth.uid() AND (
    couple_id IS NULL OR public.is_couple_member(couple_id)
  )
);
CREATE POLICY "household_needs_update" ON public.household_needs FOR UPDATE TO authenticated
USING (
  (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  OR user_id = auth.uid()
);
CREATE POLICY "household_needs_delete" ON public.household_needs FOR DELETE TO authenticated
USING (
  user_id = auth.uid() OR (visibility='shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
);

CREATE INDEX IF NOT EXISTS idx_household_needs_couple ON public.household_needs(couple_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_household_needs_user ON public.household_needs(user_id, created_at DESC);

CREATE TRIGGER trg_household_needs_updated_at BEFORE UPDATE ON public.household_needs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) household_need_attachments
CREATE TABLE IF NOT EXISTS public.household_need_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_need_id uuid NOT NULL REFERENCES public.household_needs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text,
  file_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.household_need_attachments TO authenticated;
GRANT ALL ON public.household_need_attachments TO service_role;
ALTER TABLE public.household_need_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hna_select" ON public.household_need_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.household_needs h WHERE h.id = household_need_id
  AND ((h.visibility='shared' AND public.is_couple_member(h.couple_id)) OR h.user_id = auth.uid())));
CREATE POLICY "hna_insert" ON public.household_need_attachments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.household_needs h WHERE h.id = household_need_id
  AND ((h.visibility='shared' AND public.is_couple_member(h.couple_id)) OR h.user_id = auth.uid())));
CREATE POLICY "hna_delete" ON public.household_need_attachments FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- 6) Notification trigger for household_needs
CREATE OR REPLACE FUNCTION public.notify_partner_on_household()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid; v_actor_name text; v_partner uuid;
  v_title text; v_body text; v_dedupe text;
BEGIN
  IF NEW.couple_id IS NULL OR NEW.visibility <> 'shared' THEN RETURN NEW; END IF;
  v_actor := COALESCE(auth.uid(), NEW.created_by);
  SELECT id INTO v_partner FROM public.profiles
   WHERE couple_id = NEW.couple_id AND id <> v_actor LIMIT 1;
  IF v_partner IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, 'Seu parceiro') INTO v_actor_name FROM public.profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Seu parceiro');

  IF TG_OP = 'INSERT' THEN
    v_title := v_actor_name || ' registrou uma necessidade da casa';
    v_body := NEW.title || CASE WHEN NEW.estimated_amount IS NOT NULL THEN ' — R$ ' || to_char(NEW.estimated_amount, 'FM999G999G990D00') ELSE '' END;
    v_dedupe := 'hh_ins:' || NEW.id::text || ':' || v_partner::text;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'purchased' AND COALESCE(OLD.status,'') <> 'purchased' THEN
      v_title := v_actor_name || ' marcou uma compra como realizada';
      v_body := NEW.title || CASE WHEN NEW.actual_amount IS NOT NULL THEN ' — R$ ' || to_char(NEW.actual_amount, 'FM999G999G990D00') ELSE '' END;
      v_dedupe := 'hh_bought:' || NEW.id::text || ':' || v_partner::text;
    ELSIF NEW.expense_id IS NOT NULL AND OLD.expense_id IS NULL THEN
      v_title := v_actor_name || ' converteu uma compra em despesa';
      v_body := NEW.title;
      v_dedupe := 'hh_expense:' || NEW.id::text || ':' || v_partner::text;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link, dedupe_key)
  VALUES (v_partner, v_title, v_body, 'household', '/app/casa/compras/' || NEW.id::text, v_dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_partner_on_household() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notify_household_ins AFTER INSERT ON public.household_needs
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_household();
CREATE TRIGGER trg_notify_household_upd AFTER UPDATE ON public.household_needs
  FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_household();

-- 7) Realtime for new tables
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.household_needs; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 8) Storage RLS for household-attachments bucket (bucket created via tool)
CREATE POLICY "household_attach_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'household-attachments' AND (
  auth.uid()::text = (storage.foldername(name))[1]
  OR EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.id = auth.uid() AND p2.id::text = (storage.foldername(name))[1]
      AND p1.couple_id IS NOT NULL AND p1.couple_id = p2.couple_id
  )
));
CREATE POLICY "household_attach_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'household-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "household_attach_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'household-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
