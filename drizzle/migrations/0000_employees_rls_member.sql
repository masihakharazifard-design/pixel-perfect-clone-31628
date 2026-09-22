DROP POLICY IF EXISTS "employees insert" ON public.employees;
DROP POLICY IF EXISTS "employees update" ON public.employees;
DROP POLICY IF EXISTS "employees delete" ON public.employees;

CREATE POLICY "employees insert" ON public.employees
  FOR INSERT TO authenticated WITH CHECK (public.is_member());

CREATE POLICY "employees update" ON public.employees
  FOR UPDATE TO authenticated USING (public.is_member()) WITH CHECK (public.is_member());

CREATE POLICY "employees delete" ON public.employees
  FOR DELETE TO authenticated USING (public.is_member());