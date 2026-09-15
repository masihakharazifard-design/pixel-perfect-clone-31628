CREATE TABLE public.project_taken (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  volgnummer integer NOT NULL DEFAULT 1,
  groep text NOT NULL DEFAULT '',
  taaknaam text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT '',
  start date,
  duur integer NOT NULL DEFAULT 1,
  percentage integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX project_taken_project_id_idx ON public.project_taken (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_taken TO authenticated;
GRANT ALL ON public.project_taken TO service_role;

ALTER TABLE public.project_taken ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taken read" ON public.project_taken FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "taken write" ON public.project_taken FOR ALL TO authenticated USING (public.can_plan()) WITH CHECK (public.can_plan());

CREATE TRIGGER update_project_taken_updated_at BEFORE UPDATE ON public.project_taken
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();