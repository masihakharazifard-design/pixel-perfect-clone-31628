-- Weekstaat uren: soort (werk / reisuren / werkplaats) en status (concept → ingediend → goedgekeurd / afgekeurd).
-- Schilders kunnen hun eigen uren alleen wijzigen zolang ze concept of afgekeurd zijn, en mogen ze indienen.
-- Goedkeuren en afkeuren doet kantoor (beheerder, planner, projectleider, financieel).
ALTER TABLE public.uren ADD COLUMN IF NOT EXISTS soort text NOT NULL DEFAULT 'werk';
ALTER TABLE public.uren ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'concept';
ALTER TABLE public.uren ADD COLUMN IF NOT EXISTS beoordeeld_door_naam text;
ALTER TABLE public.uren ADD COLUMN IF NOT EXISTS beoordeeld_op timestamptz;

ALTER TABLE public.uren DROP CONSTRAINT IF EXISTS uren_soort_check;
ALTER TABLE public.uren ADD CONSTRAINT uren_soort_check CHECK (soort IN ('werk','reisuren','werkplaats'));
ALTER TABLE public.uren DROP CONSTRAINT IF EXISTS uren_status_check;
ALTER TABLE public.uren ADD CONSTRAINT uren_status_check CHECK (status IN ('concept','ingediend','goedgekeurd','afgekeurd'));

DROP POLICY IF EXISTS "uren invoeren" ON public.uren;
DROP POLICY IF EXISTS "uren wijzigen" ON public.uren;
DROP POLICY IF EXISTS "uren verwijderen" ON public.uren;

CREATE POLICY "uren invoeren" ON public.uren FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (
    (SELECT public.is_staff())
    OR (employee_id = (SELECT public.mijn_medewerker_id()) AND status IN ('concept','ingediend'))
  ));

CREATE POLICY "uren wijzigen" ON public.uren FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff())
    OR (employee_id = (SELECT public.mijn_medewerker_id()) AND status IN ('concept','afgekeurd')))
  WITH CHECK ((SELECT public.is_staff())
    OR (employee_id = (SELECT public.mijn_medewerker_id()) AND status IN ('concept','ingediend')));

CREATE POLICY "uren verwijderen" ON public.uren FOR DELETE TO authenticated
  USING ((SELECT public.is_staff())
    OR (employee_id = (SELECT public.mijn_medewerker_id()) AND status IN ('concept','afgekeurd')));

CREATE INDEX IF NOT EXISTS uren_status_idx ON public.uren (status);
