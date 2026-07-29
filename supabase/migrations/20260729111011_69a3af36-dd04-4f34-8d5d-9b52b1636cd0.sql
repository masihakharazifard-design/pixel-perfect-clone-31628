CREATE TABLE public.projects (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.employees (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.availability (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.app_settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.employees TO service_role;
GRANT ALL ON public.availability TO service_role;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public access projects" ON public.projects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public access employees" ON public.employees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public access availability" ON public.availability FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public access app_settings" ON public.app_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);