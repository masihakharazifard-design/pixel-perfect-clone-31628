-- Rechten per rol alleen leesbaar voor gebruikers die een rol hebben (niet voor iedereen die een account aanmaakt).
DROP POLICY IF EXISTS "rol_rechten lezen" ON public.rol_rechten;
CREATE POLICY "rol_rechten lezen" ON public.rol_rechten FOR SELECT TO authenticated USING (public.is_member());