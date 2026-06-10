
CREATE POLICY "avatars read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='avatars');
CREATE POLICY "avatars write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "memories read"   ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='memories' AND public.is_couple_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "memories write"  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='memories' AND public.is_couple_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "memories update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='memories' AND public.is_couple_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "memories delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='memories' AND public.is_couple_member(((storage.foldername(name))[1])::uuid));

CREATE POLICY "attach read"   ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='attachments' AND public.is_couple_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "attach write"  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='attachments' AND public.is_couple_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "attach update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='attachments' AND public.is_couple_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "attach delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='attachments' AND public.is_couple_member(((storage.foldername(name))[1])::uuid));
