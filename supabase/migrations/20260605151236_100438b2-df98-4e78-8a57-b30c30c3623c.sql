
REVOKE EXECUTE ON FUNCTION public.current_couple_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_couple_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_couple_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_couple_member(UUID) TO authenticated;
