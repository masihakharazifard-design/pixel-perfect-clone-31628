-- 1. Before User Created hook: alleen @maasmond.nl
CREATE OR REPLACE FUNCTION public.before_user_created_maasmond(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE _email text := lower(coalesce(event->'claims'->>'email', event->'user_metadata'->>'email', event->>'email', ''));
BEGIN
  IF _email NOT LIKE '%@maasmond.nl' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Gebruik je Maasmond e-mailadres om in te loggen.'
      )
    );
  END IF;
  RETURN '{}'::jsonb;
END; $$;

REVOKE EXECUTE ON FUNCTION public.before_user_created_maasmond(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.before_user_created_maasmond(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- 2. Standaardrol planner; nooit meer automatisch beheerder
CREATE OR REPLACE FUNCTION public.bootstrap_my_role()
RETURNS app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _existing app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;
  SELECT role INTO _existing FROM public.user_roles WHERE user_id = _uid LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;

  IF _email LIKE '%@maasmond.nl' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'planner'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN 'planner'::app_role;
  END IF;

  RETURN NULL;
END; $$;