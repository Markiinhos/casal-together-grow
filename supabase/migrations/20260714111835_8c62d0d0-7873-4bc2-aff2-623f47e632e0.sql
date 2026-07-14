
-- 1) Fix mutable search_path on remaining functions
ALTER FUNCTION public.process_subscription_charges() SET search_path = public;
ALTER FUNCTION public.trg_recalculate_invoice_on_inst() SET search_path = public;
ALTER FUNCTION public.trg_recalculate_invoice_on_tx() SET search_path = public;

-- 2) Restrict subscription_history INSERT
DROP POLICY IF EXISTS "sub_history_insert" ON public.subscription_history;
CREATE POLICY "sub_history_insert" ON public.subscription_history
  FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = subscription_history.subscription_id
        AND (
          s.user_id = auth.uid()
          OR (s.couple_id IS NOT NULL AND public.is_couple_member(s.couple_id))
        )
    )
  );

-- 3) Restrict avatars bucket read to owner + couple partner
DROP POLICY IF EXISTS "avatars read" ON storage.objects;
CREATE POLICY "avatars read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p1, public.profiles p2
        WHERE p1.id = auth.uid()
          AND (p2.id)::text = (storage.foldername(name))[1]
          AND p1.couple_id IS NOT NULL
          AND p1.couple_id = p2.couple_id
      )
    )
  );

-- 4) Revoke EXECUTE on all public SECURITY DEFINER functions from PUBLIC and anon.
--    Then grant EXECUTE to authenticated ONLY on functions the app actually calls
--    via supabase.rpc() or that RLS policies reference for authenticated users.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- RPCs called from the client
GRANT EXECUTE ON FUNCTION public.mark_card_invoice_paid(uuid, numeric, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_charges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_couple_by_code(text) TO authenticated;

-- Helpers referenced by RLS policies (must be executable by authenticated so policies evaluate)
GRANT EXECUTE ON FUNCTION public.is_couple_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_couple_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_plan(uuid) TO authenticated;
