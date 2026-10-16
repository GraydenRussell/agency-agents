-- Run once in the Supabase SQL editor after `prisma migrate deploy`.
-- The app talks to Postgres only from the server, as the database owner (Prisma).
-- Enabling RLS with no policies denies all access through Supabase's public APIs
-- (anon / authenticated roles), so a leaked anon key can't read anything.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.tablename);
  END LOOP;
END $$;
