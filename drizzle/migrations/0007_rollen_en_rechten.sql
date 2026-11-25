-- Nieuwe rollen en een aanpasbare rechtentabel per rol.
-- De beheerder mag altijd alles; voor de andere rollen bepaalt de tabel rol_rechten wat ze mogen.
-- De database controleert dit zelf (is_staff en can_plan lezen de tabel), dus de app kan geen rechten toekennen.

-- ============ 1. Nieuwe rollen ============
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vestigingsmanager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hoofddirectie';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'werkvoorbereider';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stoffeerder';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'onderaannemer';

-- ============ 2. Rechten per rol ============
-- rechten: {"kantoor": bool, "plannen": bool, "urenAccorderen": bool, "facturatie": bool}
CREATE TABLE IF NOT EXISTS public.rol_rechten (
  rol text PRIMARY KEY,
  rechten jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rol_rechten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rol_rechten lezen" ON public.rol_rechten;
CREATE POLICY "rol_rechten lezen" ON public.rol_rechten FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rol_rechten beheren" ON public.rol_rechten;
CREATE POLICY "rol_rechten beheren" ON public.rol_rechten FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin() AND rol <> 'beheerder');

INSERT INTO public.rol_rechten (rol, rechten) VALUES
  ('planner',           '{"kantoor": true,  "plannen": true,  "urenAccorderen": true,  "facturatie": true}'),
  ('projectleider',     '{"kantoor": true,  "plannen": true,  "urenAccorderen": true,  "facturatie": true}'),
  ('financieel',        '{"kantoor": true,  "plannen": false, "urenAccorderen": true,  "facturatie": true}'),
  ('vestigingsmanager', '{"kantoor": true,  "plannen": true,  "urenAccorderen": true,  "facturatie": true}'),
  ('hoofddirectie',     '{"kantoor": true,  "plannen": false, "urenAccorderen": false, "facturatie": true}'),
  ('werkvoorbereider',  '{"kantoor": true,  "plannen": false, "urenAccorderen": false, "facturatie": false}'),
  ('medewerker',        '{"kantoor": false, "plannen": false, "urenAccorderen": false, "facturatie": false}'),
  ('stoffeerder',       '{"kantoor": false, "plannen": false, "urenAccorderen": false, "facturatie": false}'),
  ('onderaannemer',     '{"kantoor": false, "plannen": false, "urenAccorderen": false, "facturatie": false}')
ON CONFLICT (rol) DO NOTHING;

-- ============ 3. Recht controleren ============
CREATE OR REPLACE FUNCTION public.heeft_recht(_recht text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.user_roles r
    JOIN public.rol_rechten rr ON rr.rol = r.role::text
    WHERE r.user_id = auth.uid() AND coalesce((rr.rechten->>_recht)::boolean, false)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.heeft_recht(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heeft_recht(text) TO authenticated;

-- Kantoorscherm (alles zien) en plannen volgen voortaan de rechtentabel
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.heeft_recht('kantoor')
$$;

CREATE OR REPLACE FUNCTION public.can_plan()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.heeft_recht('plannen')
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rol_rechten TO authenticated;
GRANT ALL ON public.rol_rechten TO service_role;

-- ============ 4. Uren goedkeuren of afkeuren alleen met het recht "urenAccorderen" ============
CREATE OR REPLACE FUNCTION public.controleer_uren_accorderen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.status IN ('goedgekeurd', 'afgekeurd')
     AND (CASE WHEN TG_OP = 'INSERT'
              -- opslaan via upsert van een regel die al zo stond, is geen nieuwe goedkeuring
              THEN NOT EXISTS (SELECT 1 FROM public.uren u WHERE u.id = NEW.id AND u.status = NEW.status)
              ELSE NEW.status IS DISTINCT FROM OLD.status END)
     AND NOT public.heeft_recht('urenAccorderen') THEN
    RAISE EXCEPTION 'Je mag geen uren goedkeuren of afkeuren.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS uren_accorderen_controle ON public.uren;
CREATE TRIGGER uren_accorderen_controle BEFORE INSERT OR UPDATE ON public.uren
  FOR EACH ROW EXECUTE FUNCTION public.controleer_uren_accorderen();