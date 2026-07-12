
-- 1. Marker to avoid double-counting card invoice payments
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_card_payment boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tx_is_card_payment ON public.transactions (is_card_payment) WHERE is_card_payment = true;

-- 2. monthly_financial_plans
CREATE TABLE IF NOT EXISTS public.monthly_financial_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.couples(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
  reference_month date NOT NULL,
  expected_income numeric(14,2) NOT NULL DEFAULT 0 CHECK (expected_income >= 0),
  suggested_percentage numeric(5,2) NOT NULL DEFAULT 80 CHECK (suggested_percentage >= 0 AND suggested_percentage <= 200),
  spending_limit numeric(14,2) NOT NULL DEFAULT 0 CHECK (spending_limit >= 0),
  planned_reserve numeric(14,2) NOT NULL DEFAULT 0 CHECK (planned_reserve >= 0),
  planned_goals numeric(14,2) NOT NULL DEFAULT 0 CHECK (planned_goals >= 0),
  distribute_all boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  edit_policy text NOT NULL DEFAULT 'both' CHECK (edit_policy IN ('both','creator_only')),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_financial_plans TO authenticated;
GRANT ALL ON public.monthly_financial_plans TO service_role;

-- Ensure the reference_month is normalized to first-of-month
CREATE OR REPLACE FUNCTION public.normalize_plan_month()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.reference_month := date_trunc('month', NEW.reference_month)::date;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plans_normalize ON public.monthly_financial_plans;
CREATE TRIGGER trg_plans_normalize
BEFORE INSERT OR UPDATE ON public.monthly_financial_plans
FOR EACH ROW EXECUTE FUNCTION public.normalize_plan_month();

-- Uniqueness (partial indexes)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_plan_private_month
  ON public.monthly_financial_plans (user_id, reference_month)
  WHERE visibility = 'private' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_plan_shared_month
  ON public.monthly_financial_plans (couple_id, reference_month)
  WHERE visibility = 'shared' AND status = 'active' AND couple_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plans_couple_month ON public.monthly_financial_plans (couple_id, reference_month DESC);
CREATE INDEX IF NOT EXISTS idx_plans_user_month ON public.monthly_financial_plans (user_id, reference_month DESC);

ALTER TABLE public.monthly_financial_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select ON public.monthly_financial_plans
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
  );

CREATE POLICY plans_insert ON public.monthly_financial_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND created_by = auth.uid()
    AND (
      (visibility = 'private' AND couple_id IS NULL)
      OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    )
  );

CREATE POLICY plans_update ON public.monthly_financial_plans
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      visibility = 'shared' AND couple_id IS NOT NULL
      AND public.is_couple_member(couple_id)
      AND edit_policy = 'both'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      visibility = 'shared' AND couple_id IS NOT NULL
      AND public.is_couple_member(couple_id)
      AND edit_policy = 'both'
    )
  );

CREATE POLICY plans_delete ON public.monthly_financial_plans
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR created_by = auth.uid());

-- 3. monthly_budget_allocations
CREATE TABLE IF NOT EXISTS public.monthly_budget_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.monthly_financial_plans(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  planned_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_alloc_plan_category
  ON public.monthly_budget_allocations (plan_id, category_id);

CREATE INDEX IF NOT EXISTS idx_alloc_plan ON public.monthly_budget_allocations (plan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_budget_allocations TO authenticated;
GRANT ALL ON public.monthly_budget_allocations TO service_role;

ALTER TABLE public.monthly_budget_allocations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_plan(_plan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.monthly_financial_plans p
    WHERE p.id = _plan_id
      AND (
        p.user_id = auth.uid()
        OR (p.visibility = 'shared' AND p.couple_id IS NOT NULL AND public.is_couple_member(p.couple_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_plan(_plan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.monthly_financial_plans p
    WHERE p.id = _plan_id
      AND (
        p.user_id = auth.uid()
        OR (
          p.visibility = 'shared' AND p.couple_id IS NOT NULL
          AND public.is_couple_member(p.couple_id)
          AND p.edit_policy = 'both'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_edit_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_plan(uuid) TO authenticated, service_role;

CREATE POLICY alloc_select ON public.monthly_budget_allocations
  FOR SELECT TO authenticated USING (public.can_access_plan(plan_id));

CREATE POLICY alloc_insert ON public.monthly_budget_allocations
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_plan(plan_id));

CREATE POLICY alloc_update ON public.monthly_budget_allocations
  FOR UPDATE TO authenticated
  USING (public.can_edit_plan(plan_id))
  WITH CHECK (public.can_edit_plan(plan_id));

CREATE POLICY alloc_delete ON public.monthly_budget_allocations
  FOR DELETE TO authenticated USING (public.can_edit_plan(plan_id));

DROP TRIGGER IF EXISTS trg_alloc_updated ON public.monthly_budget_allocations;
CREATE TRIGGER trg_alloc_updated
BEFORE UPDATE ON public.monthly_budget_allocations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. monthly_plan_history
CREATE TABLE IF NOT EXISTS public.monthly_plan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.monthly_financial_plans(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_history_plan ON public.monthly_plan_history (plan_id, created_at DESC);

GRANT SELECT, INSERT ON public.monthly_plan_history TO authenticated;
GRANT ALL ON public.monthly_plan_history TO service_role;

ALTER TABLE public.monthly_plan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY history_select ON public.monthly_plan_history
  FOR SELECT TO authenticated USING (public.can_access_plan(plan_id));

CREATE POLICY history_insert ON public.monthly_plan_history
  FOR INSERT TO authenticated WITH CHECK (public.can_access_plan(plan_id) AND changed_by = auth.uid());

-- 5. History trigger on plans
CREATE OR REPLACE FUNCTION public.log_plan_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.monthly_plan_history(plan_id, changed_by, action, new_values)
    VALUES (NEW.id, COALESCE(auth.uid(), NEW.created_by), 'created', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.monthly_plan_history(plan_id, changed_by, action, old_values, new_values)
    VALUES (NEW.id, COALESCE(auth.uid(), NEW.created_by), 'updated', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.monthly_plan_history(plan_id, changed_by, action, old_values)
    VALUES (OLD.id, COALESCE(auth.uid(), OLD.created_by), 'deleted', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_history ON public.monthly_financial_plans;
CREATE TRIGGER trg_plan_history
AFTER INSERT OR UPDATE OR DELETE ON public.monthly_financial_plans
FOR EACH ROW EXECUTE FUNCTION public.log_plan_history();

-- 6. Notification trigger on plans
CREATE OR REPLACE FUNCTION public.notify_partner_on_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid; v_actor_name text; v_partner uuid;
  v_title text; v_body text; v_dedupe text; v_month text;
BEGIN
  IF NEW.visibility <> 'shared' OR NEW.couple_id IS NULL THEN RETURN NEW; END IF;
  v_actor := COALESCE(auth.uid(), NEW.created_by);
  SELECT id INTO v_partner FROM public.profiles
   WHERE couple_id = NEW.couple_id AND id <> v_actor LIMIT 1;
  IF v_partner IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, 'Seu parceiro') INTO v_actor_name FROM public.profiles WHERE id = v_actor;
  v_actor_name := COALESCE(v_actor_name, 'Seu parceiro');
  v_month := to_char(NEW.reference_month, 'MM/YYYY');

  IF TG_OP = 'INSERT' THEN
    v_title := v_actor_name || ' criou um planejamento mensal';
    v_body := 'Referência ' || v_month || ' — Limite R$ ' || to_char(NEW.spending_limit, 'FM999G999G990D00');
    v_dedupe := 'plan_ins:' || NEW.id::text || ':' || v_partner::text;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.spending_limit IS DISTINCT FROM OLD.spending_limit OR NEW.expected_income IS DISTINCT FROM OLD.expected_income THEN
      v_title := v_actor_name || ' atualizou o planejamento';
      v_body := 'Referência ' || v_month;
      v_dedupe := 'plan_upd:' || NEW.id::text || ':' || v_partner::text || ':' || extract(epoch from now())::bigint::text;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.notifications(user_id, title, body, type, link, dedupe_key)
  VALUES (v_partner, v_title, v_body, 'plan', '/app/financas/planejamento/' || NEW.id::text, v_dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_plan ON public.monthly_financial_plans;
CREATE TRIGGER trg_notify_plan
AFTER INSERT OR UPDATE ON public.monthly_financial_plans
FOR EACH ROW EXECUTE FUNCTION public.notify_partner_on_plan();

-- 7. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_financial_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_budget_allocations;
