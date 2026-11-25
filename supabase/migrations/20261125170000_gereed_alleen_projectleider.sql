-- Dagfoto's en gereedmeldingen zijn alleen te zien voor:
--  * de medewerker die ze gemaakt heeft,
--  * de projectleider van dat werk,
--  * de beheerder.
-- Andere kantoorgebruikers zien ze niet meer.

-- Is de ingelogde gebruiker de projectleider van dit werk?
-- Het veld "projectleider" van een werk is een medewerker-id, een e-mailadres, een afkorting (RV, CB, …)
-- of een naam. Een afkorting wordt vertaald via Instellingen → Projectleiders (of de vaste standaardlijst).
CREATE OR REPLACE FUNCTION public.is_projectleider_van(_pid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ik AS (
    SELECT e.id, lower(trim(coalesce(e.data->>'naam', ''))) AS naam, lower(trim(coalesce(e.data->>'email', ''))) AS email
    FROM public.employees e WHERE e.id = public.mijn_medewerker_id()
  ), pl AS (
    SELECT trim(coalesce(p.data->>'projectleider', '')) AS raw FROM public.projects p WHERE p.id = _pid
  ), namen AS (
    SELECT upper(trim(k)) AS code, trim(v) AS naam
    FROM public.app_settings s, jsonb_each_text(coalesce(s.data->'projectleiderNamen', '{}'::jsonb)) AS x(k, v)
    WHERE s.id = 'default'
    UNION ALL
    SELECT * FROM (VALUES ('RV', 'Ronald Voermans'), ('CB', 'Cris Bruin'), ('DDH', 'Dennis de Haan'),
                          ('RSC', 'Rick Schwickard'), ('RDE', 'Rick Deltenre')) AS d(code, naam)
  )
  SELECT EXISTS (
    SELECT 1 FROM ik, pl
    WHERE pl.raw <> ''
      AND (pl.raw = ik.id
        OR (ik.email <> '' AND lower(pl.raw) = ik.email)
        OR (ik.naam <> '' AND lower(pl.raw) = ik.naam)
        OR (ik.naam <> '' AND lower(coalesce((SELECT n.naam FROM namen n WHERE n.code = upper(pl.raw) LIMIT 1), '')) = ik.naam))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_projectleider_van(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_projectleider_van(text) TO authenticated;

-- Meldingen lezen
DROP POLICY IF EXISTS "gereed lezen" ON public.werk_gereed;
CREATE POLICY "gereed lezen" ON public.werk_gereed FOR SELECT TO authenticated
  USING (public.is_admin()
    OR employee_id = (SELECT public.mijn_medewerker_id())
    OR public.is_projectleider_van(project_id));

-- Foto's lezen: eigen map, beheerder, of de projectleider van het werk waar de foto bij hoort
CREATE OR REPLACE FUNCTION public.mag_gereed_foto_zien(_pad text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
    OR split_part(_pad, '/', 1) = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.werk_gereed g WHERE g.foto_pad = _pad AND public.is_projectleider_van(g.project_id))
$$;
REVOKE EXECUTE ON FUNCTION public.mag_gereed_foto_zien(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mag_gereed_foto_zien(text) TO authenticated;

DROP POLICY IF EXISTS "gereed foto lezen" ON storage.objects;
CREATE POLICY "gereed foto lezen" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gereed-fotos' AND public.mag_gereed_foto_zien(name));
