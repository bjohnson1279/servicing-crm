ALTER TABLE tenants ADD COLUMN catalog_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE catalog_products (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),code varchar(80) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,code),UNIQUE(tenant_id,id)
);
CREATE TABLE catalog_versions (
 product_id uuid NOT NULL REFERENCES catalog_products(id),revision integer NOT NULL,status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','active','rejected','superseded','withdrawn')),
 version integer NOT NULL DEFAULT 1,data jsonb NOT NULL,submitted_at timestamptz,verified_at timestamptz,verified_by uuid REFERENCES users(id),review_due_at timestamptz,review_checks jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(product_id,revision)
);
CREATE UNIQUE INDEX catalog_active_version ON catalog_versions(product_id) WHERE status='active';
CREATE UNIQUE INDEX catalog_open_version ON catalog_versions(product_id) WHERE status IN ('draft','in_review');
CREATE TABLE catalog_documents (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),product_id uuid NOT NULL,revision integer NOT NULL,document_type varchar(16) NOT NULL CHECK(document_type IN ('label','sds','other')),
 name varchar(160) NOT NULL,source_kind varchar(16) NOT NULL CHECK(source_kind IN ('manufacturer','regulator','other')),source_authority varchar(160) NOT NULL,source_url text,
 source_date date,unknown_date_reason text,retrieved_at timestamptz NOT NULL,data bytea,sha256 varchar(64),uploaded_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(product_id,revision) REFERENCES catalog_versions(product_id,revision)
);
CREATE INDEX catalog_document_version ON catalog_documents(product_id,revision,id);
CREATE TABLE catalog_events (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),product_id uuid NOT NULL REFERENCES catalog_products(id),revision integer NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 action varchar(24) NOT NULL,reason text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_event_history ON catalog_events(product_id,created_at,id);
CREATE TABLE catalog_requests (
 tenant_id uuid NOT NULL REFERENCES tenants(id),actor_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,request_key uuid NOT NULL,
 product_id uuid NOT NULL REFERENCES catalog_products(id),payload_hash varchar(64) NOT NULL,PRIMARY KEY(tenant_id,actor_id,action,request_key)
);
CREATE FUNCTION catalog_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Catalog identity and event history are immutable'; END $$;
CREATE TRIGGER catalog_product_guard BEFORE UPDATE OR DELETE ON catalog_products FOR EACH ROW EXECUTE FUNCTION catalog_history_guard();
CREATE FUNCTION catalog_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Catalog version history must be retained'; END IF;
 IF (NEW.product_id,NEW.revision) IS DISTINCT FROM (OLD.product_id,OLD.revision) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Version identity is permanent'; END IF;
 IF OLD.status<>'draft' AND NEW.data IS DISTINCT FROM OLD.data THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Submitted product details are immutable'; END IF;
 IF OLD.status IN ('active','rejected','superseded','withdrawn') AND (NEW.verified_at,NEW.verified_by,NEW.review_due_at,NEW.review_checks,NEW.submitted_at) IS DISTINCT FROM (OLD.verified_at,OLD.verified_by,OLD.review_due_at,OLD.review_checks,OLD.submitted_at) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Verification evidence is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status='draft' AND NEW.status='in_review' OR OLD.status='in_review' AND NEW.status IN ('active','rejected') OR OLD.status='active' AND NEW.status IN ('superseded','withdrawn')) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Invalid catalog transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_version_guard BEFORE UPDATE OR DELETE ON catalog_versions FOR EACH ROW EXECUTE FUNCTION catalog_version_guard();
CREATE FUNCTION catalog_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE product uuid;rev integer;
BEGIN
 product:=CASE WHEN TG_OP='INSERT' THEN NEW.product_id ELSE OLD.product_id END;rev:=CASE WHEN TG_OP='INSERT' THEN NEW.revision ELSE OLD.revision END;
 IF (SELECT status FROM catalog_versions WHERE product_id=product AND revision=rev) IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Submitted source evidence is immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.product_id,NEW.revision) IS DISTINCT FROM (OLD.product_id,OLD.revision) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Document identity is permanent'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER catalog_document_guard BEFORE INSERT OR UPDATE OR DELETE ON catalog_documents FOR EACH ROW EXECUTE FUNCTION catalog_document_guard();
CREATE TRIGGER catalog_event_guard BEFORE UPDATE OR DELETE ON catalog_events FOR EACH ROW EXECUTE FUNCTION catalog_history_guard();
CREATE FUNCTION catalog_validate(data jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR octet_length(data::text)>20000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Product details required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN ('trade_name','manufacturer','category','jurisdiction','identifier_status','identifier_type','identifier_value','identifier_reason','label_required','sds_required','document_exception','inventory_item_id')) THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unsupported product fields'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['trade_name','manufacturer','category','jurisdiction','identifier_status']) k WHERE jsonb_typeof(data->k) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Product identity fields must be text'; END IF;
 IF COALESCE(length(trim(data->>'trade_name')),0) NOT BETWEEN 1 AND 160 OR COALESCE(length(trim(data->>'manufacturer')),0) NOT BETWEEN 1 AND 160 OR COALESCE(length(trim(data->>'jurisdiction')),0) NOT BETWEEN 1 AND 160
  OR NOT COALESCE(data->>'category' IN ('pesticide','non_pesticide'),false) OR NOT COALESCE(data->>'identifier_status' IN ('known','unknown','not_applicable'),false)
  OR jsonb_typeof(data->'label_required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(data->'sds_required') IS DISTINCT FROM 'boolean'
 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Trade name, manufacturer, category, jurisdiction and document requirements are required'; END IF;
 IF data->>'identifier_status'='known' THEN
  IF jsonb_typeof(data->'identifier_type') IS DISTINCT FROM 'string' OR jsonb_typeof(data->'identifier_value') IS DISTINCT FROM 'string' OR COALESCE(length(trim(data->>'identifier_type')),0) NOT BETWEEN 1 AND 80 OR COALESCE(length(trim(data->>'identifier_value')),0) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Known identifiers need a text type and value'; END IF;
 ELSIF COALESCE(length(trim(data->>'identifier_reason')),0) NOT BETWEEN 1 AND 2000 OR COALESCE(data->>'identifier_value','')<>'' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown or not-applicable identifiers need an explanation, not a guessed value'; END IF;
 IF data->>'category'='pesticide' AND (data->'label_required'<>'true'::jsonb OR data->'sds_required'<>'true'::jsonb OR data->>'identifier_status'='not_applicable') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Pesticide catalog review requires label/SDS evidence and cannot mark its identifier not applicable'; END IF;
 IF (data->'label_required'='false'::jsonb OR data->'sds_required'='false'::jsonb) AND COALESCE(length(trim(data->>'document_exception')),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Explain not-applicable documents'; END IF;
END $$;
CREATE FUNCTION catalog_view(p catalog_products,staff boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(p)||jsonb_build_object('versions',COALESCE((SELECT jsonb_agg(
  (CASE WHEN staff THEN to_jsonb(v) ELSE to_jsonb(v)-'verified_by'-'review_checks' END)||jsonb_build_object('documents',COALESCE((SELECT jsonb_agg(to_jsonb(d)-'data'-'uploaded_by' ORDER BY d.created_at,d.id) FROM catalog_documents d WHERE d.product_id=p.id AND d.revision=v.revision),'[]')) ORDER BY v.revision)
  FROM catalog_versions v WHERE v.product_id=p.id AND (staff OR v.status='active' AND v.review_due_at>now())),'[]'),
 'events',CASE WHEN staff THEN COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM catalog_events e WHERE e.product_id=p.id),'[]') ELSE '[]'::jsonb END)
$$;
CREATE FUNCTION catalog_api(action text,tenant uuid,actor uuid,body jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE role_name text;staff boolean;manager boolean;tech uuid;p catalog_products;v catalog_versions;source catalog_versions;replay catalog_requests;
 candidate jsonb;hash text;reason_text text;product_code text;pdf bytea;doc catalog_documents;page_limit int;page_offset int;items jsonb;new_revision int;checks jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Object required'; END IF;
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 staff:=role_name IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR');manager:=role_name IN ('SUPER_ADMIN','MANAGER');
 IF NOT staff AND role_name<>'TECHNICIAN' THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff or assigned technician required'; END IF;
 IF action='settings' THEN
  IF body ? 'enabled' THEN
   IF NOT manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager required'; END IF;
   IF jsonb_typeof(body->'enabled')<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Boolean required'; END IF;
   UPDATE tenants SET catalog_enabled=(body->>'enabled')::boolean WHERE id=tenant;
   INSERT INTO audit_logs(tenant_id,actor_id,actor_role,action,entity_type,entity_id,new_values) VALUES(tenant,actor,role_name,'catalog_settings','tenant',tenant,body);
  END IF;
  RETURN jsonb_build_object('enabled',(SELECT catalog_enabled FROM tenants WHERE id=tenant),'role',role_name);
 END IF;
 IF NOT (SELECT catalog_enabled FROM tenants WHERE id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='Product catalog is not enabled'; END IF;
 IF NOT staff THEN
  SELECT id INTO tech FROM technicians WHERE user_id=actor;
  PERFORM 1 FROM jobs WHERE id=(body->>'job_id')::uuid AND tenant_id=tenant AND technician_id=tech AND status::text IN ('scheduled','in_progress') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Assigned active job required'; END IF;
  IF action NOT IN ('list','get','document_get') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff catalog management required'; END IF;
 END IF;
 IF action IN ('activate','reject','withdraw') AND NOT manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager verification required'; END IF;
 IF action='options' THEN RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'sku',sku)) FROM inventory_items WHERE tenant_id=tenant),'[]'); END IF;
 IF action='list' THEN
  page_limit:=least(50,greatest(1,COALESCE((body->>'limit')::int,25)));page_offset:=least(100000,greatest(0,COALESCE((body->>'offset')::int,0)));
  SELECT COALESCE(jsonb_agg(value ORDER BY code,id),'[]') INTO items FROM (
   SELECT catalog_view(x,staff) value,x.code,x.id FROM catalog_products x WHERE x.tenant_id=tenant
   AND (staff OR EXISTS(SELECT 1 FROM catalog_versions y WHERE y.product_id=x.id AND y.status='active' AND y.review_due_at>now()))
   AND (body->>'status' IS NULL OR EXISTS(SELECT 1 FROM catalog_versions y WHERE y.product_id=x.id AND y.status=body->>'status'))
   ORDER BY x.code,x.id LIMIT page_limit+1 OFFSET page_offset) q;
  RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>page_limit THEN items-page_limit ELSE items END,'has_more',jsonb_array_length(items)>page_limit);
 END IF;
 IF action<>'create' THEN
  SELECT * INTO p FROM catalog_products WHERE id=(body->>'id')::uuid AND tenant_id=tenant FOR UPDATE;
  IF NOT FOUND OR NOT staff AND NOT EXISTS(SELECT 1 FROM catalog_versions WHERE product_id=p.id AND status='active' AND review_due_at>now()) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Product not found'; END IF;
  IF action='get' THEN RETURN catalog_view(p,staff); END IF;
  IF action='document_get' THEN
   SELECT d.* INTO doc FROM catalog_documents d JOIN catalog_versions x ON x.product_id=d.product_id AND x.revision=d.revision WHERE d.id=(body->>'document_id')::uuid AND d.product_id=p.id AND (staff OR x.status='active' AND x.review_due_at>now());
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Document not found'; END IF;
   RETURN to_jsonb(doc)-'data'-'uploaded_by'||jsonb_build_object('data',CASE WHEN doc.data IS NULL THEN NULL ELSE encode(doc.data,'base64') END,'media_type','application/pdf');
  END IF;
 END IF;
 IF action NOT IN ('create','save','document','remove_document','submit','activate','reject','withdraw','next_version') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown catalog action'; END IF;
 IF body->>'request_key' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Retry key required'; END IF;
 hash:=encode(sha256(convert_to(body::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(tenant::text||actor::text||action||(body->>'request_key'),0));
 SELECT * INTO replay FROM catalog_requests WHERE tenant_id=tenant AND actor_id=actor AND catalog_requests.action=catalog_api.action AND request_key=(body->>'request_key')::uuid;
 IF FOUND THEN
  IF replay.payload_hash<>hash THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Retry key used with different data'; END IF;
  SELECT * INTO p FROM catalog_products WHERE id=replay.product_id;RETURN catalog_view(p,true);
 END IF;
 reason_text:=trim(body->>'reason');IF COALESCE(length(reason_text),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Reason required'; END IF;
 IF action='create' THEN
  product_code:=upper(trim(body->>'code'));candidate:=body->'data';PERFORM catalog_validate(candidate);
  IF COALESCE(length(product_code),0) NOT BETWEEN 1 AND 80 OR product_code !~ '^[A-Z0-9][A-Z0-9._-]*$' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Permanent product code required'; END IF;
  IF candidate->>'inventory_item_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory_items WHERE id=(candidate->>'inventory_item_id')::uuid AND tenant_id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Inventory item not found'; END IF;
  INSERT INTO catalog_products(tenant_id,code) VALUES(tenant,product_code) RETURNING * INTO p;
  INSERT INTO catalog_versions(product_id,revision,data) VALUES(p.id,1,candidate) RETURNING * INTO v;
 ELSE
  SELECT * INTO v FROM catalog_versions WHERE product_id=p.id AND revision=(body->>'revision')::int FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Product version not found'; END IF;
  IF (body->>'version')::int IS DISTINCT FROM v.version THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Version changed; reload'; END IF;
  IF action IN ('save','document','remove_document','submit') AND v.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Editable draft required'; END IF;
  IF action='save' THEN
   candidate:=body->'data';PERFORM catalog_validate(candidate);
   IF candidate->>'inventory_item_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory_items WHERE id=(candidate->>'inventory_item_id')::uuid AND tenant_id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Inventory item not found'; END IF;
   UPDATE catalog_versions SET data=candidate WHERE product_id=p.id AND revision=v.revision;
  ELSIF action='document' THEN
   IF (SELECT count(*) FROM catalog_documents WHERE product_id=p.id AND revision=v.revision)>=10 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Maximum ten documents per version'; END IF;
   pdf:=CASE WHEN body->>'data' IS NULL THEN NULL ELSE decode(body->>'data','base64') END;
   IF NOT COALESCE(body->>'document_type' IN ('label','sds','other'),false) OR NOT COALESCE(body->>'source_kind' IN ('manufacturer','regulator','other'),false)
    OR COALESCE(length(trim(body->>'name')),0) NOT BETWEEN 1 AND 160 OR COALESCE(length(trim(body->>'source_authority')),0) NOT BETWEEN 1 AND 160
    OR body->>'source_url' IS NOT NULL AND (length(body->>'source_url')>2048 OR body->>'source_url' !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?(/[^[:space:]<>"\\]*)?$')
    OR pdf IS NULL AND body->>'source_url' IS NULL OR pdf IS NOT NULL AND (octet_length(pdf) NOT BETWEEN 6 AND 2097152 OR substring(pdf FROM 1 FOR 5)<>convert_to('%PDF-','UTF8'))
    OR body->>'retrieved_at' IS NULL OR (body->>'retrieved_at')::timestamptz>now() OR (body->>'source_date')::date>current_date
    OR body->>'source_date' IS NULL AND COALESCE(length(trim(body->>'unknown_date_reason')),0) NOT BETWEEN 1 AND 1000
   THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Valid label/SDS source metadata and HTTPS reference or PDF up to 2 MB required'; END IF;
   INSERT INTO catalog_documents(product_id,revision,document_type,name,source_kind,source_authority,source_url,source_date,unknown_date_reason,retrieved_at,data,sha256,uploaded_by)
    VALUES(p.id,v.revision,body->>'document_type',body->>'name',body->>'source_kind',body->>'source_authority',body->>'source_url',(body->>'source_date')::date,body->>'unknown_date_reason',(body->>'retrieved_at')::timestamptz,pdf,CASE WHEN pdf IS NULL THEN NULL ELSE encode(sha256(pdf),'hex') END,actor);
  ELSIF action='remove_document' THEN
   DELETE FROM catalog_documents WHERE id=(body->>'document_id')::uuid AND product_id=p.id AND revision=v.revision;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Document not found'; END IF;
  ELSIF action='submit' THEN
   PERFORM catalog_validate(v.data);UPDATE catalog_versions SET status='in_review',submitted_at=now() WHERE product_id=p.id AND revision=v.revision;
  ELSIF action='activate' THEN
   IF v.status<>'in_review' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Submitted version required'; END IF;
   IF v.data->>'identifier_status'='unknown' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Resolve the unknown identifier before activation'; END IF;
   checks:=body->'checks';
   IF jsonb_typeof(checks) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM unnest(ARRAY['identity_matches','identifier_matches','jurisdiction_matches','documents_current']) k WHERE checks->k IS DISTINCT FROM 'true'::jsonb)
    OR body->>'review_due_at' IS NULL OR (body->>'review_due_at')::timestamptz<=now()
   THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Confirm all source review checks and choose a future review date'; END IF;
   IF (v.data->'label_required'='true'::jsonb AND NOT EXISTS(SELECT 1 FROM catalog_documents WHERE product_id=p.id AND revision=v.revision AND document_type='label' AND source_kind IN ('manufacturer','regulator')))
    OR (v.data->'sds_required'='true'::jsonb AND NOT EXISTS(SELECT 1 FROM catalog_documents WHERE product_id=p.id AND revision=v.revision AND document_type='sds' AND source_kind IN ('manufacturer','regulator')))
   THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Required authoritative label/SDS evidence is missing'; END IF;
   IF NOT EXISTS(SELECT 1 FROM catalog_documents WHERE product_id=p.id AND revision=v.revision AND source_kind IN ('manufacturer','regulator')) THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='At least one authoritative product source is required, including for other products'; END IF;
   INSERT INTO catalog_events(product_id,revision,actor_id,action,reason,details) SELECT product_id,revision,actor,'superseded',reason_text,jsonb_build_object('successor_revision',v.revision) FROM catalog_versions WHERE product_id=p.id AND status='active';
   UPDATE catalog_versions SET status='superseded',version=version+1,updated_at=now() WHERE product_id=p.id AND status='active';
   UPDATE catalog_versions SET status='active',verified_at=now(),verified_by=actor,review_due_at=(body->>'review_due_at')::timestamptz,review_checks=checks WHERE product_id=p.id AND revision=v.revision;
  ELSIF action='reject' THEN
   IF v.status<>'in_review' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Submitted version required'; END IF;
   UPDATE catalog_versions SET status='rejected' WHERE product_id=p.id AND revision=v.revision;
  ELSIF action='withdraw' THEN
   IF v.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Active version required'; END IF;
   UPDATE catalog_versions SET status='withdrawn' WHERE product_id=p.id AND revision=v.revision;
  ELSE
   IF v.status IN ('draft','in_review') OR EXISTS(SELECT 1 FROM catalog_versions WHERE product_id=p.id AND status IN ('draft','in_review')) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Finish the existing draft/review first'; END IF;
   source:=v;SELECT max(revision)+1 INTO new_revision FROM catalog_versions WHERE product_id=p.id;
   INSERT INTO catalog_versions(product_id,revision,data) VALUES(p.id,new_revision,source.data) RETURNING * INTO v;
   INSERT INTO catalog_documents(product_id,revision,document_type,name,source_kind,source_authority,source_url,source_date,unknown_date_reason,retrieved_at,data,sha256,uploaded_by)
    SELECT product_id,new_revision,document_type,name,source_kind,source_authority,source_url,source_date,unknown_date_reason,retrieved_at,data,sha256,actor FROM catalog_documents WHERE product_id=p.id AND revision=source.revision;
  END IF;
  IF action<>'next_version' THEN UPDATE catalog_versions SET version=version+1,updated_at=now() WHERE product_id=p.id AND revision=v.revision RETURNING * INTO v;END IF;
 END IF;
 INSERT INTO catalog_events(product_id,revision,actor_id,action,reason,details) VALUES(p.id,v.revision,actor,action,reason_text,jsonb_build_object('status',v.status,'version',v.version));
 INSERT INTO catalog_requests(tenant_id,actor_id,action,request_key,product_id,payload_hash) VALUES(tenant,actor,action,(body->>'request_key')::uuid,p.id,hash);
 RETURN catalog_view(p,true);
END $$;
