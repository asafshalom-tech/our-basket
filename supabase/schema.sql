-- Apply ONLY to a new, empty project. No household email or password in source.
BEGIN;
CREATE SCHEMA basket_private;
REVOKE ALL ON SCHEMA basket_private FROM PUBLIC, anon, authenticated;
CREATE TABLE basket_private.members(id uuid PRIMARY KEY REFERENCES auth.users(id), email text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE basket_private.shopping_items(id uuid PRIMARY KEY,name text NOT NULL,quantity numeric NOT NULL CHECK(quantity>0 AND quantity<=1000000),unit text NOT NULL,category text NOT NULL,notes text NOT NULL,status text NOT NULL CHECK(status IN ('active','purchased','removed')),version integer NOT NULL CHECK(version>0),added_by uuid NOT NULL REFERENCES basket_private.members(id),updated_by uuid NOT NULL REFERENCES basket_private.members(id),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,purchased_at timestamptz,purchase_id uuid,missing integer NOT NULL DEFAULT 0 CHECK(missing IN(0,1)));
CREATE TABLE basket_private.purchase_events(id uuid PRIMARY KEY,item_id uuid NOT NULL REFERENCES basket_private.shopping_items(id),name text NOT NULL,quantity numeric NOT NULL,unit text NOT NULL,category text NOT NULL,notes text NOT NULL,actor uuid NOT NULL REFERENCES basket_private.members(id),event_at timestamptz NOT NULL,received_at timestamptz NOT NULL,suspicious integer NOT NULL,cancelled_at timestamptz,cancelled_by uuid REFERENCES basket_private.members(id));
CREATE UNIQUE INDEX only_one_purchase ON basket_private.purchase_events(item_id) WHERE cancelled_at IS NULL;
CREATE INDEX event_date ON basket_private.purchase_events(event_at);
CREATE TABLE basket_private.operation_receipts(id uuid PRIMARY KEY,actor uuid NOT NULL REFERENCES basket_private.members(id),payload jsonb NOT NULL,received_at timestamptz NOT NULL);
CREATE TABLE basket_private.category_overrides(name_key text PRIMARY KEY,category text NOT NULL);
CREATE TABLE basket_private.favorite_products(name_key text PRIMARY KEY,product jsonb NOT NULL);
CREATE TABLE basket_private.household_preferences(key text PRIMARY KEY,value jsonb NOT NULL);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['members','shopping_items','purchase_events','operation_receipts','category_overrides','favorite_products','household_preferences'] LOOP EXECUTE format('ALTER TABLE basket_private.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON TABLE basket_private.%I FROM PUBLIC, anon, authenticated',t); END LOOP; END $$;
CREATE FUNCTION basket_private.categories() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT ARRAY['ירקות ופירות','חלב וביצים','בשר ועוף','דגים','לחם ומאפים','מזון יבש ושימורים','קפואים','משקאות','חטיפים ומתוקים','ניקיון וכביסה','נייר ומוצרים לבית','טיפוח והיגיינה','חיות מחמד','אחר']::text[] $$;
CREATE FUNCTION basket_private.actor() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$ DECLARE u uuid:=auth.uid(); BEGIN IF u IS NULL OR NOT EXISTS(SELECT 1 FROM basket_private.members WHERE id=u) THEN RAISE EXCEPTION 'not a household member' USING ERRCODE='42501'; END IF; RETURN u; END $$;
CREATE FUNCTION basket_private.snapshot(u uuid) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT jsonb_build_object('revision',coalesce((SELECT value#>>'{}' FROM basket_private.household_preferences WHERE key='revision'),''),'items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM basket_private.shopping_items i),'[]'::jsonb),'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.event_at DESC) FROM basket_private.purchase_events e),'[]'::jsonb),'favorites',coalesce((SELECT jsonb_agg(product) FROM basket_private.favorite_products),'[]'::jsonb),'overrides',coalesce((SELECT jsonb_object_agg(name_key,category) FROM basket_private.category_overrides),'{}'::jsonb),'order',coalesce((SELECT value FROM basket_private.household_preferences WHERE key='order'),to_jsonb(basket_private.categories())),'receipts',coalesce((SELECT jsonb_agg(id) FROM basket_private.operation_receipts WHERE actor=u),'[]'::jsonb),'members',coalesce((SELECT jsonb_object_agg(id,email) FROM basket_private.members),'{}'::jsonb)) $$;
CREATE FUNCTION public.basket_session() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE u uuid:=basket_private.actor(); BEGIN RETURN (SELECT jsonb_build_object('id',id,'email',email) FROM basket_private.members WHERE id=u); END $$;
CREATE FUNCTION public.basket_state(since text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$ DECLARE u uuid:=basket_private.actor(); s jsonb; BEGIN s:=basket_private.snapshot(u); IF since IS NOT NULL AND s->>'revision'=since THEN RETURN '{"unchanged":true}'::jsonb; END IF; RETURN s; END $$;
CREATE FUNCTION public.basket_op(op jsonb, expected_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=basket_private.actor(); oid uuid; iid uuid; eid uuid; ver integer; typ text:=op->>'type'; p jsonb:=op->'product'; nm text; qty numeric; un text; cat text; nt text; k text:=op->>'itemId'; at_time timestamptz; now_time timestamptz:=clock_timestamp(); current_item basket_private.shopping_items%ROWTYPE; receipt basket_private.operation_receipts%ROWTYPE; cats text[]:=basket_private.categories(); ord text[];
BEGIN
 IF u IS DISTINCT FROM expected_actor THEN RAISE EXCEPTION 'account changed' USING ERRCODE='42501'; END IF;
 IF op IS NULL OR jsonb_typeof(op)<>'object' OR octet_length(op::text)>12000 OR typ IS NULL OR typ NOT IN ('add','edit','purchase','undo','remove','missing','favorite','override','order') OR coalesce(length(k),0) NOT BETWEEN 1 AND 200 OR jsonb_typeof(op->'version') IS DISTINCT FROM 'number' OR coalesce(op->>'at','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$' THEN RAISE EXCEPTION 'invalid operation' USING ERRCODE='22023'; END IF;
 oid:=(op->>'id')::uuid; ver:=(op->>'version')::integer; at_time:=(op->>'at')::timestamptz;
 IF oid IS NULL OR ver IS NULL OR ver<0 OR at_time IS NULL THEN RAISE EXCEPTION 'invalid operation' USING ERRCODE='22023'; END IF;
 IF typ IN ('add','edit','purchase','undo','remove','missing') THEN iid:=k::uuid; END IF;
 IF typ='undo' THEN eid:=(op->>'eventId')::uuid; IF eid IS NULL THEN RAISE EXCEPTION 'invalid event' USING ERRCODE='22023'; END IF; END IF;
 IF typ IN ('favorite','missing') AND jsonb_typeof(op->'value') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid value' USING ERRCODE='22023'; END IF;
 IF typ IN ('add','edit','favorite','override') THEN
  nm:=p->>'name'; un:=p->>'unit'; cat:=p->>'category'; nt:=p->>'notes';
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'notes') IS DISTINCT FROM 'string' OR length(btrim(nm)) NOT BETWEEN 1 AND 200 OR length(nm)>200 OR length(nt)>500 OR un IS NULL OR un NOT IN ('יחידות','ק״ג','גרם','ליטר','מ״ל','חבילה','קופסה') OR cat IS NULL OR NOT cat=ANY(cats) THEN RAISE EXCEPTION 'invalid product' USING ERRCODE='22023'; END IF;
  qty:=(p->>'quantity')::numeric; IF qty<=0 OR qty>1000000 THEN RAISE EXCEPTION 'invalid quantity' USING ERRCODE='22023'; END IF;
  p:=jsonb_build_object('name',nm,'quantity',qty,'unit',un,'category',cat,'notes',nt);
 END IF;
 IF typ='order' THEN IF jsonb_typeof(op->'order') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid order' USING ERRCODE='22023'; END IF; SELECT array_agg(x) INTO ord FROM jsonb_array_elements_text(op->'order') x; IF cardinality(ord) IS DISTINCT FROM cardinality(cats) OR NOT ord @> cats OR NOT cats @> ord THEN RAISE EXCEPTION 'invalid order' USING ERRCODE='22023'; END IF; END IF;
 -- A single short transaction serializes household mutations. No duplicate purchase or receipt.
 PERFORM pg_advisory_xact_lock(81264813);
 SELECT * INTO receipt FROM basket_private.operation_receipts WHERE id=oid;
 IF FOUND THEN IF receipt.actor IS DISTINCT FROM u OR receipt.payload IS DISTINCT FROM op THEN RETURN jsonb_build_object('error','operation ID already used','conflict',true); END IF; RETURN jsonb_build_object('state',basket_private.snapshot(u)); END IF;
 IF typ IN ('edit','purchase','undo','remove','missing') THEN SELECT * INTO current_item FROM basket_private.shopping_items WHERE id=iid FOR UPDATE; IF NOT FOUND OR current_item.version<>ver OR (typ='undo' AND (current_item.status<>'purchased' OR current_item.purchase_id IS DISTINCT FROM eid)) OR (typ<>'undo' AND current_item.status<>'active') THEN RETURN jsonb_build_object('error','conflict','conflict',true); END IF; END IF;
 IF typ='add' THEN IF EXISTS(SELECT 1 FROM basket_private.shopping_items WHERE id=iid) THEN RETURN jsonb_build_object('error','conflict','conflict',true); END IF; INSERT INTO basket_private.shopping_items(id,name,quantity,unit,category,notes,status,version,added_by,updated_by,created_at,updated_at) VALUES(iid,nm,qty,un,cat,nt,'active',1,u,u,now_time,now_time);
 ELSIF typ='purchase' THEN INSERT INTO basket_private.purchase_events(id,item_id,name,quantity,unit,category,notes,actor,event_at,received_at,suspicious) VALUES(oid,iid,current_item.name,current_item.quantity,current_item.unit,current_item.category,current_item.notes,u,at_time,now_time,CASE WHEN abs(extract(epoch FROM now_time-at_time))>86400 OR at_time>now_time+interval '5 minutes' THEN 1 ELSE 0 END); UPDATE basket_private.shopping_items SET status='purchased',purchase_id=oid,purchased_at=at_time,missing=0,version=version+1,updated_by=u,updated_at=now_time WHERE id=iid;
 ELSIF typ='undo' THEN UPDATE basket_private.purchase_events SET cancelled_at=now_time,cancelled_by=u WHERE id=eid AND item_id=iid AND cancelled_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'missing purchase'; END IF; UPDATE basket_private.shopping_items SET status='active',purchase_id=NULL,purchased_at=NULL,missing=0,version=version+1,updated_by=u,updated_at=now_time WHERE id=iid;
 ELSIF typ='edit' THEN UPDATE basket_private.shopping_items SET name=nm,quantity=qty,unit=un,category=cat,notes=nt,version=version+1,updated_by=u,updated_at=now_time WHERE id=iid;
 ELSIF typ='remove' THEN UPDATE basket_private.shopping_items SET status='removed',version=version+1,updated_by=u,updated_at=now_time WHERE id=iid;
 ELSIF typ='missing' THEN UPDATE basket_private.shopping_items SET missing=CASE WHEN (op->>'value')::boolean THEN 1 ELSE 0 END,version=version+1,updated_by=u,updated_at=now_time WHERE id=iid;
 ELSIF typ='override' THEN INSERT INTO basket_private.category_overrides(name_key,category) VALUES(k,cat) ON CONFLICT(name_key) DO UPDATE SET category=excluded.category;
 ELSIF typ='favorite' THEN IF (op->>'value')::boolean THEN INSERT INTO basket_private.favorite_products(name_key,product) VALUES(k,p) ON CONFLICT(name_key) DO UPDATE SET product=excluded.product; ELSE DELETE FROM basket_private.favorite_products WHERE name_key=k; END IF;
 ELSIF typ='order' THEN INSERT INTO basket_private.household_preferences(key,value) VALUES('order',to_jsonb(ord)) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 END IF;
 INSERT INTO basket_private.operation_receipts VALUES(oid,u,op,now_time);
 INSERT INTO basket_private.household_preferences(key,value) VALUES('revision',to_jsonb(oid::text)) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 RETURN jsonb_build_object('state',basket_private.snapshot(u));
END $$;
REVOKE ALL ON FUNCTION public.basket_session(),public.basket_state(text),public.basket_op(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.basket_session(),public.basket_state(text),public.basket_op(jsonb,uuid) TO authenticated;
-- Health endpoint deliberately returns only a constant, never household data.
CREATE FUNCTION public.basket_health() RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public.basket_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.basket_health() TO anon,authenticated;
COMMIT;
