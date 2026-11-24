-- Already applied to the Our-Basket cloud database. Apply once after schema.sql only on a fresh installation.
BEGIN;
ALTER FUNCTION public.basket_session() SET SCHEMA basket_private;
ALTER FUNCTION public.basket_state(text) SET SCHEMA basket_private;
ALTER FUNCTION public.basket_op(jsonb,uuid) SET SCHEMA basket_private;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA basket_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA basket_private TO authenticated;
GRANT EXECUTE ON FUNCTION basket_private.basket_session(),basket_private.basket_state(text),basket_private.basket_op(jsonb,uuid) TO authenticated;
CREATE FUNCTION public.basket_session() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT basket_private.basket_session() $$;
CREATE FUNCTION public.basket_state(since text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT basket_private.basket_state(since) $$;
CREATE FUNCTION public.basket_op(op jsonb,expected_actor uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT basket_private.basket_op(op,expected_actor) $$;
REVOKE ALL ON FUNCTION public.basket_session(),public.basket_state(text),public.basket_op(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.basket_session(),public.basket_state(text),public.basket_op(jsonb,uuid) TO authenticated;
COMMIT;
