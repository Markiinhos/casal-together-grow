
-- 1) Add visibility column ('private' | 'shared')
DO $$
DECLARE
  t text;
  shared_tables text[] := ARRAY[
    'transactions','credit_cards','bank_accounts','bank_connections','installments','future_bills',
    'house_tasks','goals','events','memories','wishes','dates',
    'meal_plans','shopping_items','recipes','categories'
  ];
  private_tables text[] := ARRAY[
    'habits','habit_logs','routines','period_goals',
    'health_metrics','water_intake','workouts','health_meals'
  ];
BEGIN
  FOREACH t IN ARRAY shared_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT ''shared''', t);
    EXECUTE format('UPDATE public.%I SET visibility = ''shared'' WHERE visibility IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (visibility IN (''private'',''shared''))', t, t || '_visibility_chk');
  END LOOP;
  FOREACH t IN ARRAY private_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT ''private''', t);
    EXECUTE format('UPDATE public.%I SET visibility = ''private'' WHERE visibility IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (visibility IN (''private'',''shared''))', t, t || '_visibility_chk');
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Replace policies with visibility-aware rules
-- Drop old policies
DROP POLICY IF EXISTS "couple members manage bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "own bank conn" ON public.bank_connections;
DROP POLICY IF EXISTS "couple categories rw" ON public.categories;
DROP POLICY IF EXISTS "couple cc rw" ON public.credit_cards;
DROP POLICY IF EXISTS "couple dates rw" ON public.dates;
DROP POLICY IF EXISTS "couple events rw" ON public.events;
DROP POLICY IF EXISTS "couple fb rw" ON public.future_bills;
DROP POLICY IF EXISTS "couple goals rw" ON public.goals;
DROP POLICY IF EXISTS "habit_logs_couple_or_owner" ON public.habit_logs;
DROP POLICY IF EXISTS "habits_couple_or_owner" ON public.habits;
DROP POLICY IF EXISTS "couple hmeals rw" ON public.health_meals;
DROP POLICY IF EXISTS "couple hm rw" ON public.health_metrics;
DROP POLICY IF EXISTS "couple ht rw" ON public.house_tasks;
DROP POLICY IF EXISTS "couple inst rw" ON public.installments;
DROP POLICY IF EXISTS "couple mp rw" ON public.meal_plans;
DROP POLICY IF EXISTS "couple mem rw" ON public.memories;
DROP POLICY IF EXISTS "period_goals_couple_or_owner" ON public.period_goals;
DROP POLICY IF EXISTS "recipes_couple_or_owner" ON public.recipes;
DROP POLICY IF EXISTS "routines_couple_or_owner" ON public.routines;
DROP POLICY IF EXISTS "couple si rw" ON public.shopping_items;
DROP POLICY IF EXISTS "couple tx rw" ON public.transactions;
DROP POLICY IF EXISTS "water_intake_couple_or_owner" ON public.water_intake;
DROP POLICY IF EXISTS "couple wishes rw" ON public.wishes;
DROP POLICY IF EXISTS "workouts_couple_or_owner" ON public.workouts;

-- Generic re-create
DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'transactions','credit_cards','bank_accounts','bank_connections','installments','future_bills',
    'house_tasks','goals','events','memories','wishes','dates',
    'meal_plans','shopping_items','recipes','categories',
    'habits','habit_logs','period_goals',
    'health_metrics','water_intake','workouts','health_meals',
    'routines'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        (visibility = 'private' AND user_id = auth.uid())
        OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
        OR (visibility = 'shared' AND couple_id IS NULL AND user_id = auth.uid())
      );
    $f$, t || '_select_v2', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
        user_id = auth.uid()
        AND (
          visibility = 'private'
          OR (visibility = 'shared' AND (couple_id IS NULL OR public.is_couple_member(couple_id)))
        )
      );
    $f$, t || '_insert_v2', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (
        (visibility = 'private' AND user_id = auth.uid())
        OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
        OR (visibility = 'shared' AND couple_id IS NULL AND user_id = auth.uid())
      )
      WITH CHECK (
        (visibility = 'private' AND user_id = auth.uid())
        OR (visibility = 'shared' AND (couple_id IS NULL OR public.is_couple_member(couple_id)))
      );
    $f$, t || '_update_v2', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
        user_id = auth.uid()
        OR (visibility = 'shared' AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
      );
    $f$, t || '_delete_v2', t);
  END LOOP;
END $$;
