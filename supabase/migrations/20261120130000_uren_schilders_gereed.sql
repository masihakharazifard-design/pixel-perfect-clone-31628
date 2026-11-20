-- Urenregistratie, schildersomgeving en gereedmeldingen met foto.
--
-- Schilders (rol "medewerker") zien alleen hun eigen planning en de werken waarop ze zijn ingepland.
-- Kantoorrollen (beheerder, planner, projectleider, financieel) zien alles, zoals nu.
-- De koppeling tussen inlog en medewerker loopt via het e-mailadres bij Medewerkers.

-- ============ 1. Hulpfuncties ============
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
                 AND role IN ('beheerder','planner','projectleider','financieel'))
$$;

CREATE OR REPLACE FUNCTION public.mijn_medewerker_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id FROM public.employees e, auth.users u
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
    AND coalesce(trim(e.data->>'email'), '') <> ''
    AND lower(trim(e.data->>'email')) = lower(trim(u.email))
  ORDER BY e.id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.mag_werk_zien(_pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff() OR EXISTS (
    SELECT 1 FROM public.availability a
    WHERE a.data->>'projectId' = _pid
      AND a.data->>'status' = 'Ingepland'
      AND a.data->>'employeeId' = public.mijn_medewerker_id()
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mijn_medewerker_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mag_werk_zien(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mijn_medewerker_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mag_werk_zien(text) TO authenticated;

-- ============ 2. Leesrechten: schilders alleen eigen gegevens ============
DROP POLICY IF EXISTS "projects read" ON public.projects;
CREATE POLICY "projects read" ON public.projects FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) OR (public.is_member() AND public.mag_werk_zien(id)));

DROP POLICY IF EXISTS "availability read" ON public.availability;
CREATE POLICY "availability read" ON public.availability FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) OR data->>'employeeId' = (SELECT public.mijn_medewerker_id()));

DROP POLICY IF EXISTS "employees read" ON public.employees;
CREATE POLICY "employees read" ON public.employees FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) OR id = (SELECT public.mijn_medewerker_id()));

-- Medewerkers beheren: alleen kantoorrollen (het e-mailadres bepaalt wie welke planning ziet)
DROP POLICY IF EXISTS "employees insert" ON public.employees;
DROP POLICY IF EXISTS "employees update" ON public.employees;
DROP POLICY IF EXISTS "employees delete" ON public.employees;
CREATE POLICY "employees insert" ON public.employees FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_staff()));
CREATE POLICY "employees update" ON public.employees FOR UPDATE TO authenticated USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()));
CREATE POLICY "employees delete" ON public.employees FOR DELETE TO authenticated USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "meta read" ON public.project_meta;
CREATE POLICY "meta read" ON public.project_meta FOR SELECT TO authenticated USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "taken read" ON public.project_taken;
CREATE POLICY "taken read" ON public.project_taken FOR SELECT TO authenticated USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "docs read" ON public.project_documents;
CREATE POLICY "docs read" ON public.project_documents FOR SELECT TO authenticated USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "project docs read" ON storage.objects;
CREATE POLICY "project docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents' AND (SELECT public.is_staff()));

-- ============ 3. Urenregistratie ============
CREATE TABLE IF NOT EXISTS public.uren (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  project_id text,
  datum date NOT NULL,
  start_tijd text NOT NULL DEFAULT '07:00',
  eind_tijd text NOT NULL DEFAULT '16:00',
  pauze_min integer NOT NULL DEFAULT 30 CHECK (pauze_min >= 0 AND pauze_min <= 600),
  uren numeric(5,2) NOT NULL DEFAULT 0 CHECK (uren >= 0 AND uren <= 24),
  opmerking text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uren TO authenticated;
GRANT ALL ON public.uren TO service_role;
ALTER TABLE public.uren ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uren lezen" ON public.uren;
DROP POLICY IF EXISTS "uren invoeren" ON public.uren;
DROP POLICY IF EXISTS "uren wijzigen" ON public.uren;
DROP POLICY IF EXISTS "uren verwijderen" ON public.uren;
CREATE POLICY "uren lezen" ON public.uren FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) OR employee_id = (SELECT public.mijn_medewerker_id()));
CREATE POLICY "uren invoeren" ON public.uren FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND ((SELECT public.is_staff()) OR employee_id = (SELECT public.mijn_medewerker_id())));
CREATE POLICY "uren wijzigen" ON public.uren FOR UPDATE TO authenticated
  USING (public.can_plan() OR (created_by = auth.uid() AND ((SELECT public.is_staff()) OR employee_id = (SELECT public.mijn_medewerker_id()))))
  WITH CHECK (public.can_plan() OR (created_by = auth.uid() AND ((SELECT public.is_staff()) OR employee_id = (SELECT public.mijn_medewerker_id()))));
CREATE POLICY "uren verwijderen" ON public.uren FOR DELETE TO authenticated
  USING (public.can_plan() OR created_by = auth.uid());

CREATE INDEX IF NOT EXISTS uren_datum_idx ON public.uren (datum);
CREATE INDEX IF NOT EXISTS uren_employee_datum_idx ON public.uren (employee_id, datum);
DROP TRIGGER IF EXISTS update_uren_updated_at ON public.uren;
CREATE TRIGGER update_uren_updated_at BEFORE UPDATE ON public.uren
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 4. Gereed melden (per dag, met foto) ============
CREATE TABLE IF NOT EXISTS public.werk_gereed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  project_id text NOT NULL,
  datum date NOT NULL,
  foto_pad text NOT NULL CHECK (foto_pad <> ''),
  opmerking text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, project_id, datum)
);
GRANT SELECT, INSERT, DELETE ON public.werk_gereed TO authenticated;
GRANT ALL ON public.werk_gereed TO service_role;
ALTER TABLE public.werk_gereed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gereed lezen" ON public.werk_gereed;
DROP POLICY IF EXISTS "gereed melden" ON public.werk_gereed;
DROP POLICY IF EXISTS "gereed intrekken" ON public.werk_gereed;
CREATE POLICY "gereed lezen" ON public.werk_gereed FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) OR employee_id = (SELECT public.mijn_medewerker_id()));
CREATE POLICY "gereed melden" ON public.werk_gereed FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND split_part(foto_pad, '/', 1) = auth.uid()::text
    AND ((SELECT public.is_staff()) OR (employee_id = (SELECT public.mijn_medewerker_id()) AND public.mag_werk_zien(project_id))));
CREATE POLICY "gereed intrekken" ON public.werk_gereed FOR DELETE TO authenticated
  USING (public.can_plan() OR created_by = auth.uid());
CREATE INDEX IF NOT EXISTS werk_gereed_datum_idx ON public.werk_gereed (datum);

-- Foto's: privé opslag, per gebruiker een eigen map
INSERT INTO storage.buckets (id, name, public) VALUES ('gereed-fotos', 'gereed-fotos', false)
  ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "gereed foto upload" ON storage.objects;
DROP POLICY IF EXISTS "gereed foto lezen" ON storage.objects;
CREATE POLICY "gereed foto upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gereed-fotos' AND public.is_member() AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "gereed foto lezen" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gereed-fotos' AND ((SELECT public.is_staff()) OR (storage.foldername(name))[1] = auth.uid()::text));

-- ============ 5. Rol bij eerste aanmelding ============
-- Staat het (geverifieerde) e-mailadres bij een medewerker die geen projectleider is, dan wordt de rol
-- "medewerker" (eigen planning); anders "planner" zoals voorheen. Bestaande rollen veranderen niet.
CREATE OR REPLACE FUNCTION public.rol_voor_email(_email text)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.employees e
    WHERE lower(trim(e.data->>'email')) = lower(trim(_email))
      AND coalesce(e.data->>'functie', '') <> 'Projectleider'
  ) THEN 'medewerker'::public.app_role ELSE 'planner'::public.app_role END
$$;
REVOKE EXECUTE ON FUNCTION public.rol_voor_email(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_my_role()
RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _email text; _confirmed timestamptz; _existing public.app_role; _rol public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;
  SELECT role INTO _existing FROM public.user_roles WHERE user_id = _uid LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  SELECT lower(trim(email)), email_confirmed_at INTO _email, _confirmed FROM auth.users WHERE id = _uid;
  IF _confirmed IS NOT NULL AND (_email LIKE '%@maasmond.nl' OR _email = 'tyas@msoftware.nl') THEN
    _rol := public.rol_voor_email(_email);
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _rol) ON CONFLICT (user_id, role) DO NOTHING;
    RETURN _rol;
  END IF;
  RETURN NULL;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.bootstrap_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_my_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_maasmond_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (lower(trim(NEW.email)) LIKE '%@maasmond.nl' OR lower(trim(NEW.email)) = 'tyas@msoftware.nl')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, public.rol_voor_email(NEW.email)) ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;
