GRANT UPDATE ON public.project_documents TO authenticated;
CREATE POLICY "docs update" ON public.project_documents FOR UPDATE TO authenticated USING (can_plan()) WITH CHECK (can_plan());

GRANT UPDATE, DELETE ON public.user_roles TO authenticated;
CREATE POLICY "admins update roles" ON public.user_roles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'beheerder'::app_role)) WITH CHECK (has_role(auth.uid(), 'beheerder'::app_role));
CREATE POLICY "admins delete roles" ON public.user_roles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'beheerder'::app_role));