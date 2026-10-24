-- 009_employee_photos.sql — profile photos for employees (public avatars bucket).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "public reads avatars"
    ON storage.objects FOR SELECT TO anon, authenticated, service_role
    USING (bucket_id = 'avatars');
  CREATE POLICY "service writes avatars"
    ON storage.objects FOR INSERT TO service_role
    WITH CHECK (bucket_id = 'avatars');
  CREATE POLICY "service updates avatars"
    ON storage.objects FOR UPDATE TO service_role
    USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
