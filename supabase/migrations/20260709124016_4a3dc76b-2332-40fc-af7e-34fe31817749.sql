
-- 1) Lock down SECURITY DEFINER functions from direct client execution
REVOKE EXECUTE ON FUNCTION public.handle_goal_contribution() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_task_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_transaction_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_habit_log_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_period_goal_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_partner_on_task() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_installments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_points(uuid, uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Keep helpers needed by RLS and client RPCs callable
GRANT EXECUTE ON FUNCTION public.is_couple_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_couple_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_couple_by_code(text) TO authenticated;

-- 2) bank_connections: owner-only write/delete + hide token columns from clients
DROP POLICY IF EXISTS bank_connections_update_v2 ON public.bank_connections;
DROP POLICY IF EXISTS bank_connections_delete_v2 ON public.bank_connections;

CREATE POLICY bank_connections_update_owner ON public.bank_connections
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY bank_connections_delete_owner ON public.bank_connections
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE SELECT (access_token, refresh_token) ON public.bank_connections FROM anon, authenticated;
REVOKE UPDATE (access_token, refresh_token) ON public.bank_connections FROM anon, authenticated;
REVOKE INSERT (access_token, refresh_token) ON public.bank_connections FROM anon, authenticated;

-- 3) bank_accounts: owner-only update/delete of shared account records
DROP POLICY IF EXISTS bank_accounts_update_v2 ON public.bank_accounts;
DROP POLICY IF EXISTS bank_accounts_delete_v2 ON public.bank_accounts;

CREATE POLICY bank_accounts_update_owner ON public.bank_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY bank_accounts_delete_owner ON public.bank_accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4) bank_transactions: add visibility, enforce private, owner-only writes
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared';

DROP POLICY IF EXISTS "couple members manage bank_transactions" ON public.bank_transactions;

CREATE POLICY bank_transactions_select ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    ((visibility = 'private') AND user_id = auth.uid())
    OR ((visibility = 'shared') AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    OR ((visibility = 'shared') AND couple_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY bank_transactions_insert ON public.bank_transactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY bank_transactions_update_owner ON public.bank_transactions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY bank_transactions_delete_owner ON public.bank_transactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 5) synced_cards: add visibility, enforce private, owner-only writes
ALTER TABLE public.synced_cards
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared';

DROP POLICY IF EXISTS "couple members manage synced_cards" ON public.synced_cards;

CREATE POLICY synced_cards_select ON public.synced_cards
  FOR SELECT TO authenticated
  USING (
    ((visibility = 'private') AND user_id = auth.uid())
    OR ((visibility = 'shared') AND couple_id IS NOT NULL AND public.is_couple_member(couple_id))
    OR ((visibility = 'shared') AND couple_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY synced_cards_insert ON public.synced_cards
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY synced_cards_update_owner ON public.synced_cards
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY synced_cards_delete_owner ON public.synced_cards
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
