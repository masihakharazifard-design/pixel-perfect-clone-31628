CREATE TABLE public.personal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  datum date NOT NULL,
  tekst text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_notes TO authenticated;
GRANT ALL ON public.personal_notes TO service_role;

ALTER TABLE public.personal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notes select" ON public.personal_notes FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own notes insert" ON public.personal_notes FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own notes update" ON public.personal_notes FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own notes delete" ON public.personal_notes FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE INDEX personal_notes_owner_datum_idx ON public.personal_notes (owner_id, datum);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_personal_notes_updated_at BEFORE UPDATE ON public.personal_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();