-- ============ Geschiedenis: alle veranderingen vastleggen en tonen ============
-- Planning, afwezigheid, status, instellingen, archiveren en rollen werden al gelogd via de RPC's.
-- Hier komen werken, medewerkers en werkgegevens (notities, facturatietermijnen) bij via triggers,
-- en mogen beheerders én planners de geschiedenis lezen.

-- 1. Trigger: alleen de gewijzigde velden opslaan (oud en nieuw), plus naam/nummer voor context
CREATE OR REPLACE FUNCTION public.audit_wijziging()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _oud jsonb := CASE WHEN TG_OP <> 'INSERT' THEN OLD.data END;
  _nieuw jsonb := CASE WHEN TG_OP <> 'DELETE' THEN NEW.data END;
  _oud_diff jsonb := '{}'::jsonb;
  _nieuw_diff jsonb := '{}'::jsonb;
  _sleutel text;
  _context jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF _oud IS NOT DISTINCT FROM _nieuw THEN RETURN NEW; END IF;
    FOR _sleutel IN SELECT jsonb_object_keys(COALESCE(_oud, '{}'::jsonb) || COALESCE(_nieuw, '{}'::jsonb)) LOOP
      IF (_oud -> _sleutel) IS DISTINCT FROM (_nieuw -> _sleutel) THEN
        _oud_diff := _oud_diff || jsonb_build_object(_sleutel, _oud -> _sleutel);
        _nieuw_diff := _nieuw_diff || jsonb_build_object(_sleutel, _nieuw -> _sleutel);
      END IF;
    END LOOP;
    -- Alleen een statuswijziging: die logt set_project_status al
    IF TG_TABLE_NAME = 'projects' AND (SELECT array_agg(k) FROM jsonb_object_keys(_nieuw_diff) k) = ARRAY['status'] THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Lege werkgegevens worden aangemaakt zodra iemand een werk opent: niet interessant
    IF TG_TABLE_NAME = 'project_meta' AND COALESCE(_nieuw ->> 'notities', '') = ''
       AND COALESCE(_nieuw -> 'termijnen', '{}'::jsonb) = '{}'::jsonb AND COALESCE(_nieuw -> 'docs', '[]'::jsonb) = '[]'::jsonb THEN
      RETURN NEW;
    END IF;
    _nieuw_diff := _nieuw;
  ELSE
    _oud_diff := _oud;
  END IF;

  _context := jsonb_strip_nulls(jsonb_build_object(
    'werknummer', COALESCE(_nieuw, _oud) ->> 'werknummer',
    'projectnaam', COALESCE(_nieuw, _oud) ->> 'projectnaam',
    'naam', COALESCE(_nieuw, _oud) ->> 'naam'
  ));

  INSERT INTO public.audit_log (actor_id, actor_type, actie, tabel, record_id, oude_waarde, nieuwe_waarde)
  VALUES (
    auth.uid(),
    CASE WHEN auth.uid() IS NULL THEN 'systeem' ELSE 'user' END,
    CASE TG_OP WHEN 'INSERT' THEN 'aangemaakt' WHEN 'UPDATE' THEN 'gewijzigd' ELSE 'verwijderd' END,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id)::text,
    CASE WHEN _oud_diff = '{}'::jsonb THEN NULL ELSE _oud_diff END,
    CASE WHEN _nieuw_diff = '{}'::jsonb THEN NULL ELSE _nieuw_diff || jsonb_build_object('_context', _context) END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.audit_wijziging() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_projects ON public.projects;
CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_wijziging();
DROP TRIGGER IF EXISTS audit_employees ON public.employees;
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.audit_wijziging();
DROP TRIGGER IF EXISTS audit_project_meta ON public.project_meta;
CREATE TRIGGER audit_project_meta AFTER INSERT OR UPDATE OR DELETE ON public.project_meta
  FOR EACH ROW EXECUTE FUNCTION public.audit_wijziging();

-- 2. Lezen: beheerders en planners
DROP POLICY IF EXISTS "audit read admin" ON public.audit_log;
DROP POLICY IF EXISTS "audit read planners" ON public.audit_log;
CREATE POLICY "audit read planners" ON public.audit_log FOR SELECT TO authenticated USING (public.can_plan());
CREATE INDEX IF NOT EXISTS audit_log_record_idx ON public.audit_log (record_id, created_at DESC);

-- 3. Geschiedenis ophalen met het e-mailadres van wie het deed (optioneel alleen voor één werk)
CREATE OR REPLACE FUNCTION public.lees_geschiedenis(_limit int DEFAULT 300, _voor timestamptz DEFAULT NULL, _record_id text DEFAULT NULL)
RETURNS TABLE (id uuid, created_at timestamptz, wie text, actie text, tabel text, record_id text, oude_waarde jsonb, nieuwe_waarde jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_plan() THEN RAISE EXCEPTION 'Geen rechten om de geschiedenis te bekijken'; END IF;
  RETURN QUERY
  SELECT a.id, a.created_at, u.email::text, a.actie, a.tabel, a.record_id, a.oude_waarde, a.nieuwe_waarde
  FROM public.audit_log a
  LEFT JOIN auth.users u ON u.id = a.actor_id
  WHERE (_voor IS NULL OR a.created_at < _voor)
    AND (_record_id IS NULL
         OR a.record_id = _record_id
         OR (a.tabel = 'availability' AND (
              a.nieuwe_waarde @> jsonb_build_array(jsonb_build_object('data', jsonb_build_object('projectId', _record_id)))
           OR a.oude_waarde  @> jsonb_build_array(jsonb_build_object('data', jsonb_build_object('projectId', _record_id))))))
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(_limit, 1), 1000);
END; $$;
REVOKE EXECUTE ON FUNCTION public.lees_geschiedenis(int, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lees_geschiedenis(int, timestamptz, text) TO authenticated;
