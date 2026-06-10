
ALTER VIEW public.dashboard_finance SET (security_invoker = true);
ALTER VIEW public.dashboard_goals SET (security_invoker = true);
ALTER VIEW public.dashboard_tasks SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.award_points(uuid,uuid,int,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_goal_contribution() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_transaction_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_task_points() FROM PUBLIC, anon, authenticated;
