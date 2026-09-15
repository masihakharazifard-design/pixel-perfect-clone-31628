CREATE OR REPLACE FUNCTION public.bootstrap_my_role()
RETURNS app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _confirmed timestamptz;
  _existing app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Niet ingelogd'; END IF;

  SELECT role INTO _existing FROM public.user_roles WHERE user_id = _uid LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT lower(email), email_confirmed_at INTO _email, _confirmed
  FROM auth.users WHERE id = _uid;

  IF _confirmed IS NOT NULL AND _email LIKE '%@maasmond.nl' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'planner'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN 'planner'::app_role;
  END IF;

  RETURN NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.grant_maasmond_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) LIKE '%@maasmond.nl'
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'planner'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.grant_maasmond_role() FROM anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_maasmond ON auth.users;
CREATE TRIGGER on_auth_user_created_maasmond
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_maasmond_role();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_maasmond ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_maasmond
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_maasmond_role();