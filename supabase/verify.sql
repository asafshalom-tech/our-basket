-- Run only after the two real members exist. Everything rolls back.
BEGIN;
DO $$
DECLARE a uuid; b uuid; item uuid:=gen_random_uuid(); addid uuid:=gen_random_uuid(); buyid uuid:=gen_random_uuid(); undoid uuid:=gen_random_uuid(); buy2 uuid:=gen_random_uuid(); p jsonb; o jsonb; stamp text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
 SELECT id INTO a FROM basket_private.members ORDER BY id LIMIT 1;
 SELECT id INTO b FROM basket_private.members WHERE id<>a LIMIT 1;
 IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'two members required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 p:=jsonb_build_object('name','בדיקה זמנית','quantity',2,'unit','יחידות','category','אחר','notes','');
 o:=jsonb_build_object('id',addid,'itemId',item,'type','add','version',0,'at',stamp,'product',p);
 IF NOT (public.basket_op(o,a)?'state') THEN RAISE EXCEPTION 'add failed'; END IF;
 o:=jsonb_build_object('id',buyid,'itemId',item,'type','purchase','version',1,'at',stamp);
 IF NOT (public.basket_op(o,a)?'state') OR NOT (public.basket_op(o,a)?'state') THEN RAISE EXCEPTION 'purchase retry failed'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF NOT coalesce((public.basket_op(jsonb_set(o,'{id}',to_jsonb(gen_random_uuid())),b)->>'conflict')::boolean,false) THEN RAISE EXCEPTION 'stale purchase not rejected'; END IF;
 o:=jsonb_build_object('id',undoid,'itemId',item,'type','undo','version',2,'at',stamp,'eventId',buyid);
 IF NOT (public.basket_op(o,b)?'state') THEN RAISE EXCEPTION 'undo failed'; END IF;
 IF NOT (public.basket_op(jsonb_build_object('id',buy2,'itemId',item,'type','purchase','version',3,'at',stamp),b)?'state') THEN RAISE EXCEPTION 'repurchase failed'; END IF;
 IF NOT coalesce((public.basket_op(jsonb_set(o,'{id}',to_jsonb(gen_random_uuid())),b)->>'conflict')::boolean,false) THEN RAISE EXCEPTION 'old undo not rejected'; END IF;
 IF (SELECT count(*) FROM basket_private.purchase_events WHERE item_id=item AND cancelled_at IS NULL)<>1 THEN RAISE EXCEPTION 'duplicate active events'; END IF;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 BEGIN PERFORM public.basket_state(); RAISE EXCEPTION 'unauthorized access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'SQL verification passed; rolling back';
END $$;
ROLLBACK;
