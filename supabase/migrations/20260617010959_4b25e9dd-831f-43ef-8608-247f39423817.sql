CREATE OR REPLACE FUNCTION public.join_couple_by_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_couple_id uuid;
  v_created_by uuid;
  v_member_count int;
  v_current_couple uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RAISE EXCEPTION 'Código de convite inválido' USING ERRCODE = '22023';
  END IF;

  SELECT couple_id INTO v_current_couple FROM public.profiles WHERE id = v_user;
  IF v_current_couple IS NOT NULL THEN
    RAISE EXCEPTION 'Você já faz parte de um casal' USING ERRCODE = '23505';
  END IF;

  SELECT id, created_by INTO v_couple_id, v_created_by
  FROM public.couples
  WHERE invite_code = lower(trim(_code))
  LIMIT 1;

  IF v_couple_id IS NULL THEN
    RAISE EXCEPTION 'Convite inválido ou expirado' USING ERRCODE = 'P0002';
  END IF;

  IF v_created_by = v_user THEN
    RAISE EXCEPTION 'Você não pode aceitar seu próprio convite' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_member_count FROM public.profiles WHERE couple_id = v_couple_id;
  IF v_member_count >= 2 THEN
    RAISE EXCEPTION 'Este casal já está completo' USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles SET couple_id = v_couple_id, updated_at = now() WHERE id = v_user;

  RETURN v_couple_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_couple_by_code(text) TO authenticated;