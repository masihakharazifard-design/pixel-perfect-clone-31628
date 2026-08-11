-- ============ 1. Rol-helpers ============
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'beheerder'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_plan()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'beheerder'::app_role)
      OR public.has_role(auth.uid(), 'planner'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.is_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_plan() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member() TO authenticated;

-- ============ 2. Kolommen voor archivering ============
ALTER TABLE public.projects  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ============ 3. Auditlog ============
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'user',
  actie text NOT NULL,
  tabel text NOT NULL,
  record_id text,
  oude_waarde jsonb,
  nieuwe_waarde jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit read admin" ON public.audit_log;
CREATE POLICY "audit read admin" ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin());
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.write_audit(_actie text, _tabel text, _record_id text, _oud jsonb, _nieuw jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd';
  END IF;
  INSERT INTO public.audit_log (actor_id, actor_type, actie, tabel, record_id, oude_waarde, nieuwe_waarde)
  VALUES (auth.uid(), 'user', _actie, _tabel, _record_id, _oud, _nieuw);
END; $$;
REVOKE EXECUTE ON FUNCTION public.write_audit(text,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

-- ============ 4. Documenten per werk ============
CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  bestandsnaam text NOT NULL,
  pad text NOT NULL,
  mimetype text,
  grootte bigint,
  uploader_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;
GRANT ALL ON public.project_documents TO service_role;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "docs read" ON public.project_documents;
DROP POLICY IF EXISTS "docs write" ON public.project_documents;
DROP POLICY IF EXISTS "docs delete" ON public.project_documents;
CREATE POLICY "docs read" ON public.project_documents FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "docs write" ON public.project_documents FOR INSERT TO authenticated WITH CHECK (public.can_plan() AND uploader_id = auth.uid());
CREATE POLICY "docs delete" ON public.project_documents FOR DELETE TO authenticated USING (public.can_plan());
CREATE INDEX IF NOT EXISTS project_documents_project_idx ON public.project_documents (project_id);

-- ============ 5. Toegangsregels op de documentenmap ============
DROP POLICY IF EXISTS "project docs read" ON storage.objects;
DROP POLICY IF EXISTS "project docs upload" ON storage.objects;
DROP POLICY IF EXISTS "project docs delete" ON storage.objects;
CREATE POLICY "project docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents' AND public.is_member());
CREATE POLICY "project docs upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-documents' AND public.can_plan());
CREATE POLICY "project docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-documents' AND public.can_plan());

-- ============ 6. Openbare policies vervangen door rolgebaseerde ============
DROP POLICY IF EXISTS "projects_public" ON public.projects;
DROP POLICY IF EXISTS "authenticated access projects" ON public.projects;
DROP POLICY IF EXISTS "employees_public" ON public.employees;
DROP POLICY IF EXISTS "authenticated access employees" ON public.employees;
DROP POLICY IF EXISTS "availability_public" ON public.availability;
DROP POLICY IF EXISTS "authenticated access availability" ON public.availability;
DROP POLICY IF EXISTS "app_settings_public" ON public.app_settings;
DROP POLICY IF EXISTS "authenticated access app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "project_meta_public" ON public.project_meta;
DROP POLICY IF EXISTS "authenticated access project_meta" ON public.project_meta;

REVOKE ALL ON public.projects, public.employees, public.availability, public.app_settings, public.project_meta FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects, public.employees, public.availability, public.app_settings, public.project_meta TO authenticated;

CREATE POLICY "projects read"   ON public.projects   FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "projects insert" ON public.projects   FOR INSERT TO authenticated WITH CHECK (public.can_plan());
CREATE POLICY "projects update" ON public.projects   FOR UPDATE TO authenticated USING (public.can_plan()) WITH CHECK (public.can_plan());
CREATE POLICY "projects delete" ON public.projects   FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "employees read"   ON public.employees FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "employees insert" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "employees update" ON public.employees FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "employees delete" ON public.employees FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "availability read"  ON public.availability FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "availability write" ON public.availability FOR ALL TO authenticated USING (public.can_plan()) WITH CHECK (public.can_plan());

CREATE POLICY "settings read"   ON public.app_settings FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "settings update" ON public.app_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "settings insert" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "meta read"  ON public.project_meta FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "meta write" ON public.project_meta FOR ALL TO authenticated USING (public.can_plan()) WITH CHECK (public.can_plan());

-- ============ 7. Rol toekennen bij eerste aanmelding (server-side) ============
CREATE OR REPLACE FUNCTION public.bootstrap_my_role()
RETURNS app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _existing app_role;
  _new app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;
  SELECT role INTO _existing FROM public.user_roles WHERE user_id = _uid LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'beheerder'::app_role) THEN
    _new := 'beheerder'::app_role;
  ELSIF _email LIKE '%@maasmond.nl' THEN
    _new := 'planner'::app_role;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _new)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN _new;
END; $$;
REVOKE EXECUTE ON FUNCTION public.bootstrap_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_my_role() TO authenticated;

-- ============ 8. Instellingen atomair patchen ============
CREATE OR REPLACE FUNCTION public.patch_app_settings(
  _changes jsonb DEFAULT '{}'::jsonb,
  _paths jsonb DEFAULT '[]'::jsonb,
  _expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cur jsonb;
  _cur_updated timestamptz;
  _item jsonb;
  _path text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;
  IF NOT public.can_plan() THEN RAISE EXCEPTION 'Geen rechten om instellingen te wijzigen'; END IF;

  INSERT INTO public.app_settings (id, data) VALUES ('default', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  SELECT data, updated_at INTO _cur, _cur_updated
  FROM public.app_settings WHERE id = 'default' FOR UPDATE;

  IF _expected_updated_at IS NOT NULL AND _cur_updated IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'Instellingen zijn inmiddels door iemand anders gewijzigd' USING ERRCODE = '40001';
  END IF;

  _cur := COALESCE(_cur, '{}'::jsonb) || COALESCE(_changes, '{}'::jsonb);

  FOR _item IN SELECT * FROM jsonb_array_elements(COALESCE(_paths, '[]'::jsonb)) LOOP
    SELECT array_agg(value) INTO _path FROM jsonb_array_elements_text(_item->'path') AS value;
    IF _path IS NULL OR array_length(_path, 1) IS NULL THEN CONTINUE; END IF;
    IF (_item ? 'remove') AND (_item->>'remove')::boolean THEN
      _cur := _cur #- _path;
    ELSE
      _cur := jsonb_set(_cur, _path, COALESCE(_item->'value', 'null'::jsonb), true);
    END IF;
  END LOOP;

  UPDATE public.app_settings SET data = _cur, updated_at = now() WHERE id = 'default';
  PERFORM public.write_audit('instellingen_gewijzigd', 'app_settings', 'default', _changes, _paths);
  RETURN _cur;
END; $$;
REVOKE EXECUTE ON FUNCTION public.patch_app_settings(jsonb,jsonb,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patch_app_settings(jsonb,jsonb,timestamptz) TO authenticated;

-- ============ 9. Planning transactioneel opslaan met conflictcontrole ============
CREATE OR REPLACE FUNCTION public.save_planning_rows(
  _upserts jsonb DEFAULT '[]'::jsonb,
  _delete_ids text[] DEFAULT '{}',
  _actie text DEFAULT 'planning_gewijzigd'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row jsonb;
  _touched text[] := '{}';
  _conflict record;
  _oud jsonb;
  _blocking text[] := ARRAY['Bezet','Vakantie','Ziek','Niet beschikbaar','Vrij'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;
  IF NOT public.can_plan() THEN RAISE EXCEPTION 'Geen rechten om de planning te wijzigen'; END IF;

  SELECT array_agg(x->>'id') INTO _touched FROM jsonb_array_elements(COALESCE(_upserts,'[]'::jsonb)) x;
  _touched := COALESCE(_touched, '{}') || COALESCE(_delete_ids, '{}');

  FOR _row IN SELECT * FROM jsonb_array_elements(COALESCE(_upserts, '[]'::jsonb)) LOOP
    SELECT a.id,
           a.data->>'employeeId' AS emp,
           a.data->>'date' AS datum,
           a.data->>'status' AS status
      INTO _conflict
    FROM public.availability a
    WHERE NOT (a.id = ANY (_touched))
      AND a.data->>'employeeId' = _row->'data'->>'employeeId'
      AND a.data->>'date' = _row->'data'->>'date'
      AND ((a.data->>'status') = ANY (_blocking) OR (_row->'data'->>'status') = ANY (_blocking))
      AND COALESCE(a.data->>'startTime','00:00') < COALESCE(_row->'data'->>'endTime','23:59')
      AND COALESCE(a.data->>'endTime','23:59') > COALESCE(_row->'data'->>'startTime','00:00')
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Conflict op % : medewerker staat al ingepland als %', _conflict.datum, _conflict.status;
    END IF;
  END LOOP;

  IF array_length(COALESCE(_delete_ids,'{}'), 1) IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'data', a.data)) INTO _oud
    FROM public.availability a WHERE a.id = ANY (_delete_ids);
    DELETE FROM public.availability WHERE id = ANY (_delete_ids);
  END IF;

  INSERT INTO public.availability (id, data, updated_at)
  SELECT x->>'id', x->'data', now() FROM jsonb_array_elements(COALESCE(_upserts,'[]'::jsonb)) x
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();

  PERFORM public.write_audit(_actie, 'availability', NULL, _oud, _upserts);

  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'data', a.data))
                   FROM public.availability a
                   WHERE a.id = ANY (COALESCE(_touched,'{}'))), '[]'::jsonb);
END; $$;
REVOKE EXECUTE ON FUNCTION public.save_planning_rows(jsonb,text[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_planning_rows(jsonb,text[],text) TO authenticated;

-- ============ 10. Projectstatus wijzigen ============
CREATE OR REPLACE FUNCTION public.set_project_status(_project_id text, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _oud jsonb; _nieuw jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;
  IF NOT public.can_plan() THEN RAISE EXCEPTION 'Geen rechten om de status te wijzigen'; END IF;

  SELECT data INTO _oud FROM public.projects WHERE id = _project_id FOR UPDATE;
  IF _oud IS NULL THEN RAISE EXCEPTION 'Werk niet gevonden'; END IF;

  _nieuw := jsonb_set(_oud, '{status}', to_jsonb(_status), true);
  UPDATE public.projects SET data = _nieuw, updated_at = now() WHERE id = _project_id;
  PERFORM public.write_audit('status_gewijzigd', 'projects', _project_id,
                             jsonb_build_object('status', _oud->>'status'),
                             jsonb_build_object('status', _status));
  RETURN _nieuw;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_project_status(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_status(text,text) TO authenticated;

-- ============ 11. Archiveren en herstellen ============
CREATE OR REPLACE FUNCTION public.archive_record(_tabel text, _record_id text, _archiveren boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ts timestamptz := CASE WHEN _archiveren THEN now() ELSE NULL END;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Alleen een beheerder mag archiveren'; END IF;
  IF _tabel = 'projects' THEN
    UPDATE public.projects SET archived_at = _ts WHERE id = _record_id;
  ELSIF _tabel = 'employees' THEN
    UPDATE public.employees SET archived_at = _ts WHERE id = _record_id;
  ELSE
    RAISE EXCEPTION 'Onbekende tabel';
  END IF;
  PERFORM public.write_audit(CASE WHEN _archiveren THEN 'gearchiveerd' ELSE 'hersteld' END, _tabel, _record_id, NULL, NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.archive_record(text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_record(text,text,boolean) TO authenticated;

-- ============ 12. Realtime ============
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.employees REPLICA IDENTITY FULL;
ALTER TABLE public.availability REPLICA IDENTITY FULL;
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;