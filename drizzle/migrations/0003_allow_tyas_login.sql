CREATE OR REPLACE FUNCTION public.before_user_created_maasmond(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
DECLARE _email text := lower(trim(coalesce(event->'user'->>'email', event->'user'->'user_metadata'->>'email', event->'claims'->>'email', event->'user_metadata'->>'email', event->>'email', '')));
BEGIN
  IF _email NOT LIKE '%@maasmond.nl' AND _email <> 'tyas@msoftware.nl' THEN
    RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Gebruik je Maasmond e-mailadres om in te loggen.'));
  END IF;
  RETURN '{}'::jsonb;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.before_user_created_maasmond(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.before_user_created_maasmond(jsonb) TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.bootstrap_my_role()
RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _email text; _confirmed timestamptz; _existing public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;
  SELECT role INTO _existing FROM public.user_roles WHERE user_id = _uid LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  SELECT lower(trim(email)), email_confirmed_at INTO _email, _confirmed FROM auth.users WHERE id = _uid;
  IF _confirmed IS NOT NULL AND (_email LIKE '%@maasmond.nl' OR _email = 'tyas@msoftware.nl') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'planner'::public.app_role) ON CONFLICT (user_id, role) DO NOTHING;
    RETURN 'planner'::public.app_role;
  END IF;
  RETURN NULL;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.bootstrap_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_my_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_maasmond_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (lower(trim(NEW.email)) LIKE '%@maasmond.nl' OR lower(trim(NEW.email)) = 'tyas@msoftware.nl')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'planner'::public.app_role) ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;