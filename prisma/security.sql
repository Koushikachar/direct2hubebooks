-- ─────────────────────────────────────────────────────────────────────────
-- Direct2hub — lock the database down against Supabase's auto-generated API
-- ─────────────────────────────────────────────────────────────────────────
-- WHY: Supabase automatically exposes every table in the `public` schema over
-- a REST API (PostgREST at https://<project>.supabase.co/rest/v1/…), reachable
-- with the project's public "anon" key. Tables created by Prisma are in that
-- schema, and unless Row Level Security (RLS) is switched on, that API can
-- read — and write — them. `Submission` holds every buyer's name, email,
-- phone number and DOWNLOAD ACCESS TOKEN; with RLS off, anyone holding the
-- anon key could dump the table and download the paid ebook for free.
--
-- THIS APP NEVER USES THAT API. It talks to Postgres only from the server,
-- through Prisma, as the `postgres` role (which bypasses RLS). So the correct
-- setting is: RLS ON with NO policies (deny everything to anon/authenticated)
-- and no table privileges for those roles. Nothing in the app changes.
--
-- HOW: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- (Safe to run more than once.) Run `npx prisma db push` BEFORE this file the
-- first time so the tables exist, and again re-run this file after adding any
-- new table.
--
-- VERIFY afterwards (should return 0 rows / permission denied):
--   curl "https://<project>.supabase.co/rest/v1/Submission?select=email" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"

ALTER TABLE "Product"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Visit"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review"     ENABLE ROW LEVEL SECURITY;

-- Belt and braces: even if someone later adds a permissive policy by
-- mistake, these roles still have no privileges on the tables.
REVOKE ALL ON TABLE "Product", "Submission", "Visit", "Review" FROM anon, authenticated;

-- Future tables created by Prisma shouldn't be granted to those roles either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Audit query — every table in `public` should show rowsecurity = true:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
