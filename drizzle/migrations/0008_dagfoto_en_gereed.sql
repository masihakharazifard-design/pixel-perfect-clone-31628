-- Dagfoto en gereedmelding los van elkaar:
--  * soort 'dag'    = foto aan het eind van elke werkdag (foto verplicht)
--  * soort 'gereed' = het hele werk is klaar (foto niet nodig); de projectleider krijgt een e-mail
-- Bestaande meldingen worden dagfoto's.

ALTER TABLE public.werk_gereed ADD COLUMN IF NOT EXISTS soort text NOT NULL DEFAULT 'dag';
ALTER TABLE public.werk_gereed DROP CONSTRAINT IF EXISTS werk_gereed_soort_check;
ALTER TABLE public.werk_gereed ADD CONSTRAINT werk_gereed_soort_check CHECK (soort IN ('dag', 'gereed'));

-- Foto alleen verplicht bij een dagfoto
ALTER TABLE public.werk_gereed ALTER COLUMN foto_pad DROP NOT NULL;
ALTER TABLE public.werk_gereed DROP CONSTRAINT IF EXISTS werk_gereed_foto_pad_check;
ALTER TABLE public.werk_gereed DROP CONSTRAINT IF EXISTS werk_gereed_foto_nodig;
ALTER TABLE public.werk_gereed ADD CONSTRAINT werk_gereed_foto_nodig CHECK (soort = 'gereed' OR coalesce(foto_pad, '') <> '');

-- Eén dagfoto per medewerker, werk en dag; één gereedmelding per medewerker en werk
ALTER TABLE public.werk_gereed DROP CONSTRAINT IF EXISTS werk_gereed_employee_id_project_id_datum_key;
DROP INDEX IF EXISTS public.werk_gereed_dag_uniek;
DROP INDEX IF EXISTS public.werk_gereed_gereed_uniek;
CREATE UNIQUE INDEX werk_gereed_dag_uniek ON public.werk_gereed (employee_id, project_id, datum) WHERE soort = 'dag';
CREATE UNIQUE INDEX werk_gereed_gereed_uniek ON public.werk_gereed (employee_id, project_id) WHERE soort = 'gereed';

-- Melden: de foto (als die er is) moet in de eigen map staan
DROP POLICY IF EXISTS "gereed melden" ON public.werk_gereed;
CREATE POLICY "gereed melden" ON public.werk_gereed FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND (foto_pad IS NULL OR split_part(foto_pad, '/', 1) = auth.uid()::text)
    AND ((SELECT public.is_staff()) OR (employee_id = (SELECT public.mijn_medewerker_id()) AND public.mag_werk_zien(project_id))));