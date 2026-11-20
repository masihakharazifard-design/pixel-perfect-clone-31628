-- Urenregistratie: gewerkte uren per medewerker per dag (vooral voor de schilders).
-- Iedereen met een rol mag uren zien en invoeren; aanpassen of verwijderen mag degene
-- die de regel heeft ingevoerd, of een planner/beheerder.
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

CREATE POLICY "uren lezen" ON public.uren FOR SELECT TO authenticated
  USING (public.is_member());
CREATE POLICY "uren invoeren" ON public.uren FOR INSERT TO authenticated
  WITH CHECK (public.is_member() AND created_by = auth.uid());
CREATE POLICY "uren wijzigen" ON public.uren FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.can_plan())
  WITH CHECK (created_by = auth.uid() OR public.can_plan());
CREATE POLICY "uren verwijderen" ON public.uren FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.can_plan());

CREATE INDEX IF NOT EXISTS uren_datum_idx ON public.uren (datum);
CREATE INDEX IF NOT EXISTS uren_employee_datum_idx ON public.uren (employee_id, datum);
CREATE INDEX IF NOT EXISTS uren_project_idx ON public.uren (project_id);

CREATE TRIGGER update_uren_updated_at BEFORE UPDATE ON public.uren
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
