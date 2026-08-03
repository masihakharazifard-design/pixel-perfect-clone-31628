DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects','employees','availability','app_settings','project_meta'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_all', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated can manage '||t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_public', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t||'_public', t);
    END IF;
  END LOOP;
END $$;