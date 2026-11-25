-- Feedback van gebruikers, per pagina. Iedereen met een rol kan feedback geven en ziet zijn eigen
-- feedback; kantoor (beheerder, planner, projectleider, financieel) ziet alles en zet de status.
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tekst text NOT NULL CHECK (length(trim(tekst)) > 0 AND length(tekst) <= 2000),
  pagina text NOT NULL DEFAULT '',
  auteur_id uuid DEFAULT auth.uid(),
  auteur_naam text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'nieuw' CHECK (status IN ('nieuw','in behandeling','opgelost')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback lezen" ON public.feedback;
DROP POLICY IF EXISTS "feedback geven" ON public.feedback;
DROP POLICY IF EXISTS "feedback status" ON public.feedback;
DROP POLICY IF EXISTS "feedback verwijderen" ON public.feedback;
CREATE POLICY "feedback lezen" ON public.feedback FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()) OR auteur_id = auth.uid());
CREATE POLICY "feedback geven" ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (public.is_member() AND auteur_id = auth.uid() AND status = 'nieuw');
CREATE POLICY "feedback status" ON public.feedback FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff())) WITH CHECK ((SELECT public.is_staff()));
CREATE POLICY "feedback verwijderen" ON public.feedback FOR DELETE TO authenticated
  USING (public.is_admin() OR (auteur_id = auth.uid() AND status = 'nieuw'));

CREATE INDEX IF NOT EXISTS feedback_created_idx ON public.feedback (created_at DESC);
DROP TRIGGER IF EXISTS update_feedback_updated_at ON public.feedback;
CREATE TRIGGER update_feedback_updated_at BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
