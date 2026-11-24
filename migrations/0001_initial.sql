PRAGMA foreign_keys=ON;
CREATE TABLE members(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
CREATE TABLE shopping_items(id TEXT PRIMARY KEY,name TEXT NOT NULL,quantity REAL NOT NULL CHECK(quantity>0),unit TEXT NOT NULL,category TEXT NOT NULL,notes TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('active','purchased','removed')), version INTEGER NOT NULL CHECK(version>0),added_by TEXT NOT NULL REFERENCES members(id),updated_by TEXT NOT NULL REFERENCES members(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,purchased_at TEXT,purchase_id TEXT,missing INTEGER NOT NULL DEFAULT 0);
CREATE TABLE purchase_events(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES shopping_items(id),name TEXT NOT NULL,quantity REAL NOT NULL,unit TEXT NOT NULL,category TEXT NOT NULL,notes TEXT NOT NULL,actor TEXT NOT NULL REFERENCES members(id),event_at TEXT NOT NULL,received_at TEXT NOT NULL,suspicious INTEGER NOT NULL,cancelled_at TEXT,cancelled_by TEXT REFERENCES members(id));
CREATE UNIQUE INDEX only_one_purchase ON purchase_events(item_id) WHERE cancelled_at IS NULL;
CREATE INDEX event_date ON purchase_events(event_at);
CREATE TABLE operation_receipts(id TEXT PRIMARY KEY,actor TEXT NOT NULL REFERENCES members(id),payload TEXT NOT NULL,received_at TEXT NOT NULL);
CREATE TABLE category_overrides(name_key TEXT PRIMARY KEY,category TEXT NOT NULL);
CREATE TABLE favorite_products(name_key TEXT PRIMARY KEY,product TEXT NOT NULL);
CREATE TABLE household_preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
-- Receipt insertion and all resulting mutations form one atomic SQLite statement.
CREATE TRIGGER execute_operation AFTER INSERT ON operation_receipts BEGIN
  SELECT CASE WHEN json_extract(NEW.payload,'$.type') IN ('edit','purchase','undo','remove','missing') AND NOT EXISTS (SELECT 1 FROM shopping_items WHERE id=json_extract(NEW.payload,'$.itemId') AND version=json_extract(NEW.payload,'$.version') AND ((status='active' AND json_extract(NEW.payload,'$.type')!='undo') OR (status='purchased' AND json_extract(NEW.payload,'$.type')='undo' AND purchase_id=json_extract(NEW.payload,'$.eventId')))) THEN RAISE(ABORT,'VERSION_CONFLICT') END;
  SELECT CASE WHEN json_extract(NEW.payload,'$.type')='add' AND EXISTS(SELECT 1 FROM shopping_items WHERE id=json_extract(NEW.payload,'$.itemId')) THEN RAISE(ABORT,'VERSION_CONFLICT') END;
  INSERT INTO shopping_items(id,name,quantity,unit,category,notes,status,version,added_by,updated_by,created_at,updated_at)
    SELECT json_extract(NEW.payload,'$.itemId'),json_extract(NEW.payload,'$.product.name'),json_extract(NEW.payload,'$.product.quantity'),json_extract(NEW.payload,'$.product.unit'),json_extract(NEW.payload,'$.product.category'),json_extract(NEW.payload,'$.product.notes'),'active',1,NEW.actor,NEW.actor,NEW.received_at,NEW.received_at WHERE json_extract(NEW.payload,'$.type')='add';
  INSERT INTO purchase_events(id,item_id,name,quantity,unit,category,notes,actor,event_at,received_at,suspicious)
    SELECT NEW.id,id,name,quantity,unit,category,notes,NEW.actor,json_extract(NEW.payload,'$.at'),NEW.received_at,CASE WHEN abs(unixepoch(NEW.received_at)-unixepoch(json_extract(NEW.payload,'$.at')))>86400 OR unixepoch(json_extract(NEW.payload,'$.at'))-unixepoch(NEW.received_at)>300 THEN 1 ELSE 0 END FROM shopping_items WHERE id=json_extract(NEW.payload,'$.itemId') AND json_extract(NEW.payload,'$.type')='purchase';
  UPDATE purchase_events SET cancelled_at=NEW.received_at,cancelled_by=NEW.actor WHERE id=json_extract(NEW.payload,'$.eventId') AND item_id=json_extract(NEW.payload,'$.itemId') AND json_extract(NEW.payload,'$.type')='undo' AND cancelled_at IS NULL;
  UPDATE shopping_items SET
    name=CASE WHEN json_extract(NEW.payload,'$.type')='edit' THEN json_extract(NEW.payload,'$.product.name') ELSE name END,
    quantity=CASE WHEN json_extract(NEW.payload,'$.type')='edit' THEN json_extract(NEW.payload,'$.product.quantity') ELSE quantity END,
    unit=CASE WHEN json_extract(NEW.payload,'$.type')='edit' THEN json_extract(NEW.payload,'$.product.unit') ELSE unit END,
    category=CASE WHEN json_extract(NEW.payload,'$.type')='edit' THEN json_extract(NEW.payload,'$.product.category') ELSE category END,
    notes=CASE WHEN json_extract(NEW.payload,'$.type')='edit' THEN json_extract(NEW.payload,'$.product.notes') ELSE notes END,
    status=CASE json_extract(NEW.payload,'$.type') WHEN 'purchase' THEN 'purchased' WHEN 'undo' THEN 'active' WHEN 'remove' THEN 'removed' ELSE status END,
    missing=CASE WHEN json_extract(NEW.payload,'$.type')='missing' THEN json_extract(NEW.payload,'$.value') WHEN json_extract(NEW.payload,'$.type') IN ('purchase','undo') THEN 0 ELSE missing END,
    purchased_at=CASE json_extract(NEW.payload,'$.type') WHEN 'purchase' THEN json_extract(NEW.payload,'$.at') WHEN 'undo' THEN NULL ELSE purchased_at END,
    purchase_id=CASE json_extract(NEW.payload,'$.type') WHEN 'purchase' THEN NEW.id WHEN 'undo' THEN NULL ELSE purchase_id END,
    version=version+1,updated_by=NEW.actor,updated_at=NEW.received_at
    WHERE id=json_extract(NEW.payload,'$.itemId') AND json_extract(NEW.payload,'$.type') IN ('edit','purchase','undo','remove','missing');
  INSERT INTO category_overrides(name_key,category) SELECT json_extract(NEW.payload,'$.itemId'),json_extract(NEW.payload,'$.product.category') WHERE json_extract(NEW.payload,'$.type')='override' ON CONFLICT(name_key) DO UPDATE SET category=excluded.category;
  INSERT INTO favorite_products(name_key,product) SELECT json_extract(NEW.payload,'$.itemId'),json_extract(NEW.payload,'$.product') WHERE json_extract(NEW.payload,'$.type')='favorite' AND json_extract(NEW.payload,'$.value')=1 ON CONFLICT(name_key) DO UPDATE SET product=excluded.product;
  DELETE FROM favorite_products WHERE name_key=json_extract(NEW.payload,'$.itemId') AND json_extract(NEW.payload,'$.type')='favorite' AND json_extract(NEW.payload,'$.value')=0;
  INSERT INTO household_preferences(key,value) VALUES('revision',NEW.id) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
  INSERT INTO household_preferences(key,value) SELECT 'order',json_extract(NEW.payload,'$.order') WHERE json_extract(NEW.payload,'$.type')='order' ON CONFLICT(key) DO UPDATE SET value=excluded.value;
END;
