-- Nieuwe gebruikers met een @maasmond.nl-adres toelaten (via e-mailcode én via Microsoft).
-- De "Before User Created"-controle las het e-mailadres alleen uit claims/user_metadata, maar Supabase
-- geeft het aan deze controle door als event.user.email. Daardoor kwam er een leeg adres binnen en werd
-- iedere nieuwe gebruiker geweigerd. Nu wordt eerst event.user.email gelezen (en de oude plekken als reserve).
CREATE OR REPLACE FUNCTION public.before_user_created_maasmond(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE _email text := lower(trim(coalesce(
  event->'user'->>'email',
  event->'user'->'user_metadata'->>'email',
  event->'claims'->>'email',
  event->'user_metadata'->>'email',
  event->>'email',
  ''
)));
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
