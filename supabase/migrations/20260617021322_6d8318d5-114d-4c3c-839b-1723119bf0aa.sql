
-- 1) couples.photo_url
ALTER TABLE public.couples ADD COLUMN IF NOT EXISTS photo_url text;

-- 2) Storage policies for couple-photos bucket (path prefix = couple_id)
DROP POLICY IF EXISTS "couple photos read" ON storage.objects;
DROP POLICY IF EXISTS "couple photos write" ON storage.objects;
DROP POLICY IF EXISTS "couple photos update" ON storage.objects;
DROP POLICY IF EXISTS "couple photos delete" ON storage.objects;

CREATE POLICY "couple photos read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'couple-photos'
  AND public.is_couple_member((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "couple photos write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'couple-photos'
  AND public.is_couple_member((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "couple photos update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'couple-photos'
  AND public.is_couple_member((string_to_array(name, '/'))[1]::uuid)
);

CREATE POLICY "couple photos delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'couple-photos'
  AND public.is_couple_member((string_to_array(name, '/'))[1]::uuid)
);

-- 3) Fix categories RLS: allow couple members to edit shared categories
DROP POLICY IF EXISTS "couple categories rw" ON public.categories;
CREATE POLICY "couple categories rw" ON public.categories FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id())
)
WITH CHECK (
  user_id = auth.uid()
  OR (couple_id IS NOT NULL AND couple_id = public.current_couple_id())
);

-- 4) Enhance join_couple_by_code to migrate user's solo history to the couple
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

  -- Link the user to the couple
  UPDATE public.profiles SET couple_id = v_couple_id, updated_at = now() WHERE id = v_user;

  -- Migrate solo records (where couple_id IS NULL) so the user's history is preserved
  UPDATE public.transactions   SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL;
  UPDATE public.house_tasks    SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL;
  UPDATE public.goals          SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL;
  UPDATE public.events         SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL;
  UPDATE public.memories       SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL;
  UPDATE public.wishes         SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL;
  UPDATE public.categories     SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL;
  UPDATE public.user_points    SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL;

  RETURN v_couple_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_couple_by_code(text) TO authenticated;
