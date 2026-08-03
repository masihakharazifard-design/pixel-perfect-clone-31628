-- Project meta (documenten, facturatietermijnen, notities)
CREATE TABLE IF NOT EXISTS public.project_meta (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_meta TO authenticated;
GRANT ALL ON public.project_meta TO service_role;
ALTER TABLE public.project_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated access project_meta" ON public.project_meta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Rollen
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('beheerder','planner','projectleider','financieel','medewerker');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'beheerder'));
CREATE POLICY "self assign default role" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND role = 'medewerker');
CREATE POLICY "admins assign roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'beheerder'));

-- Toegang beperken tot ingelogde gebruikers
DROP POLICY IF EXISTS "public access projects" ON public.projects;
DROP POLICY IF EXISTS "public access employees" ON public.employees;
DROP POLICY IF EXISTS "public access availability" ON public.availability;
DROP POLICY IF EXISTS "public access app_settings" ON public.app_settings;

CREATE POLICY "authenticated access projects" ON public.projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access employees" ON public.employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access availability" ON public.availability
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated access app_settings" ON public.app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.employees FROM anon;
REVOKE ALL ON public.availability FROM anon;
REVOKE ALL ON public.app_settings FROM anon;