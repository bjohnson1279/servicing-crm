ALTER TABLE tenants ADD COLUMN inspections_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE inspections (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 job_id uuid NOT NULL UNIQUE REFERENCES jobs(id), customer_id uuid NOT NULL REFERENCES customers(id), property_id uuid NOT NULL REFERENCES properties(id),
 state varchar(24) NOT NULL DEFAULT 'scheduled' CHECK(state IN ('scheduled','in_progress','submitted','reviewed','cancelled')),
 revision integer NOT NULL DEFAULT 1, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE INDEX inspections_queue ON inspections(tenant_id,state,created_at,id);
CREATE TABLE inspection_revisions (
 inspection_id uuid NOT NULL REFERENCES inspections(id), revision integer NOT NULL,
 findings jsonb NOT NULL DEFAULT '{"summary":"","zones":[]}', author_id uuid REFERENCES users(id),
 submitted_at timestamptz, submitted_by uuid REFERENCES users(id), reviewed_at timestamptz, reviewed_by uuid REFERENCES users(id), review_reason text,
 PRIMARY KEY(inspection_id,revision)
);
CREATE TABLE inspection_attachments (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), inspection_id uuid NOT NULL, revision integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), name varchar(160) NOT NULL, media_type varchar(24) NOT NULL, data bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(inspection_id,revision) REFERENCES inspection_revisions(inspection_id,revision)
);
CREATE TABLE inspection_events (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), inspection_id uuid NOT NULL REFERENCES inspections(id), actor_id uuid NOT NULL REFERENCES users(id),
 action varchar(32) NOT NULL, revision integer NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inspection_requests (
 tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, request_key uuid NOT NULL,
 inspection_id uuid NOT NULL REFERENCES inspections(id), payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,actor_id,action,request_key)
);
CREATE FUNCTION inspection_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.submitted_at IS NOT NULL THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Submitted findings are immutable'; END IF;
  IF (NEW.inspection_id,NEW.revision,NEW.findings,NEW.author_id,NEW.submitted_at,NEW.submitted_by) IS DISTINCT FROM (OLD.inspection_id,OLD.revision,OLD.findings,OLD.author_id,OLD.submitted_at,OLD.submitted_by)
   OR OLD.reviewed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Submitted findings are immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER inspection_revision_guard BEFORE UPDATE OR DELETE ON inspection_revisions FOR EACH ROW EXECUTE FUNCTION inspection_revision_guard();
CREATE FUNCTION inspection_view(i inspections) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(i)||jsonb_build_object(
  'property_address',(SELECT address FROM properties WHERE id=i.property_id),
  'customer_name',(SELECT name FROM customers WHERE id=i.customer_id),
  'job_status',(SELECT status FROM jobs WHERE id=i.job_id),
  'revisions',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.revision) FROM inspection_revisions r WHERE r.inspection_id=i.id),'[]'),
  'attachments',COALESCE((SELECT jsonb_agg(to_jsonb(a)-'data' ORDER BY a.created_at,a.id) FROM inspection_attachments a WHERE a.inspection_id=i.id),'[]'),
  'events',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM inspection_events e WHERE e.inspection_id=i.id),'[]'))
$$;
CREATE FUNCTION inspection_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE role_name text; staff boolean; manager boolean; tech uuid; i inspections; j jobs; r inspection_revisions;
 replay inspection_requests; photo bytea; findings jsonb; zone jsonb; page_limit integer; page_offset integer; items jsonb;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Object required'; END IF;
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 staff:=role_name IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR'); manager:=role_name IN ('SUPER_ADMIN','MANAGER');
 SELECT id INTO tech FROM technicians WHERE user_id=actor;
 IF NOT staff AND role_name<>'TECHNICIAN' THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff or assigned technician required'; END IF;
 IF action='settings' THEN
  IF body ? 'enabled' THEN
   IF NOT manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager required'; END IF;
   IF jsonb_typeof(body->'enabled')<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Boolean required'; END IF;
   UPDATE tenants SET inspections_enabled=(body->>'enabled')::boolean WHERE id=tenant;
   INSERT INTO audit_logs(tenant_id,actor_id,actor_role,action,entity_type,entity_id,new_values) VALUES(tenant,actor,role_name,'inspection_settings','tenant',tenant,body);
  END IF;
  RETURN jsonb_build_object('enabled',(SELECT inspections_enabled FROM tenants WHERE id=tenant),'role',role_name);
 END IF;
 IF NOT (SELECT inspections_enabled FROM tenants WHERE id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='Inspections are not enabled for this organization'; END IF;
 IF action='options' THEN
  IF NOT staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff intake required'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(job_api('list',tenant,actor)) WHERE value->>'status' IN ('scheduled','in_progress') AND value->>'purpose'='standard' AND NOT EXISTS(SELECT 1 FROM inspections WHERE job_id=(value->>'id')::uuid)),'[]');
 END IF;
 IF action='list' THEN
  page_limit:=least(50,greatest(1,COALESCE((body->>'limit')::integer,25))); page_offset:=least(100000,greatest(0,COALESCE((body->>'offset')::integer,0)));
  SELECT COALESCE(jsonb_agg(value ORDER BY created_at,id),'[]') INTO items FROM (
   SELECT inspection_view(x) AS value,x.created_at,x.id FROM inspections x JOIN jobs y ON y.id=x.job_id
   WHERE x.tenant_id=tenant AND y.tenant_id=tenant AND (staff OR y.technician_id=tech)
   AND (body->>'job_id' IS NULL OR x.job_id=(body->>'job_id')::uuid) AND (body->>'state' IS NULL OR x.state=body->>'state')
   ORDER BY x.created_at,x.id LIMIT page_limit+1 OFFSET page_offset) q;
  RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>page_limit THEN items-page_limit ELSE items END,'has_more',jsonb_array_length(items)>page_limit,'offset',page_offset);
 END IF;
 IF action='create' THEN
  IF NOT staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff intake required'; END IF;
  SELECT * INTO j FROM jobs WHERE id=(body->>'job_id')::uuid AND tenant_id=tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Job not found'; END IF;
  SELECT * INTO replay FROM inspection_requests WHERE tenant_id=tenant AND actor_id=actor AND inspection_requests.action=inspection_api.action AND request_key=(body->>'request_key')::uuid;
  IF FOUND THEN
   IF replay.payload<>body THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Retry key was used for different data'; END IF;
   SELECT * INTO i FROM inspections WHERE id=replay.inspection_id; RETURN inspection_view(i);
  END IF;
  IF j.purpose<>'standard' OR j.status::text NOT IN ('scheduled','in_progress') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Select a scheduled standard job'; END IF;
  IF EXISTS(SELECT 1 FROM inspections WHERE job_id=j.id) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Job already has an inspection'; END IF;
  IF body->>'request_key' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Retry key required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM properties p JOIN customers c ON c.id=p.customer_id JOIN users u ON u.id=c.user_id WHERE p.id=j.property_id AND c.id=j.customer_id AND u.tenant_id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Property not found'; END IF;
  INSERT INTO inspections(tenant_id,job_id,customer_id,property_id) VALUES(tenant,j.id,j.customer_id,j.property_id) RETURNING * INTO i;
  INSERT INTO inspection_revisions(inspection_id,revision) VALUES(i.id,1);
 ELSE
  -- Lock the job before the inspection to match generic job mutation lock order.
  SELECT y.* INTO j FROM jobs y JOIN inspections x ON x.job_id=y.id WHERE x.id=(body->>'id')::uuid AND x.tenant_id=tenant AND y.tenant_id=tenant AND y.property_id=x.property_id AND y.customer_id=x.customer_id FOR UPDATE OF y;
  IF NOT FOUND OR NOT COALESCE((staff OR j.technician_id=tech),false) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Inspection not found'; END IF;
  SELECT * INTO i FROM inspections WHERE id=(body->>'id')::uuid FOR UPDATE;
  IF action='get' THEN RETURN inspection_view(i); END IF;
  IF action='attachment_get' THEN
   SELECT jsonb_build_object('name',name,'media_type',media_type,'data',encode(data,'base64')) INTO items FROM inspection_attachments WHERE id=(body->>'attachment_id')::uuid AND inspection_id=i.id;
   IF items IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Photo not found'; END IF; RETURN items;
  END IF;
  IF action IN ('review','cancel') AND NOT staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff review required'; END IF;
  IF action NOT IN ('start','save','submit','review','cancel','attachment') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown inspection action'; END IF;
  IF body->>'request_key' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Retry key required'; END IF;
  SELECT * INTO replay FROM inspection_requests WHERE tenant_id=tenant AND actor_id=actor AND inspection_requests.action=inspection_api.action AND request_key=(body->>'request_key')::uuid;
  IF FOUND THEN
   IF replay.inspection_id<>i.id OR replay.payload<>body THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Retry key was used for different data'; END IF;
   RETURN inspection_view(i);
  END IF;
  IF (body->>'version')::integer IS DISTINCT FROM i.version THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Inspection changed; reload before saving'; END IF;
  SELECT * INTO r FROM inspection_revisions WHERE inspection_id=i.id AND revision=i.revision;
  IF action='start' THEN
   IF i.state<>'scheduled' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Inspection cannot be started'; END IF;
   IF j.status::text='scheduled' THEN PERFORM job_api('clock_in',tenant,actor,jsonb_build_object('id',j.id));
   ELSIF j.status::text<>'in_progress' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Job is not available for inspection'; END IF;
   i.state:='in_progress';
  ELSIF action IN ('save','attachment','submit') THEN
   IF i.state<>'in_progress' OR r.submitted_at IS NOT NULL OR j.status::text<>'in_progress' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='An active draft is required'; END IF;
   IF action='save' THEN
    findings:=body->'findings';
    IF jsonb_typeof(findings) IS DISTINCT FROM 'object' OR octet_length(findings::text)>100000 OR jsonb_typeof(findings->'zones') IS DISTINCT FROM 'array' OR jsonb_array_length(findings->'zones')>50 OR jsonb_typeof(findings->'summary') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Summary and up to 50 zones required'; END IF;
    FOR zone IN SELECT value FROM jsonb_array_elements(findings->'zones') LOOP
     IF jsonb_typeof(zone) IS DISTINCT FROM 'object' OR jsonb_typeof(zone->'name') IS DISTINCT FROM 'string' OR length(zone->>'name')>120
      OR jsonb_typeof(zone->'notes') IS DISTINCT FROM 'string' OR length(zone->>'notes')>4000 OR jsonb_typeof(zone->'inaccessible') IS DISTINCT FROM 'boolean'
      OR NOT COALESCE(zone->>'evidence' IN ('observed','reported','none','unknown'),false) OR NOT COALESCE(zone->>'severity' IN ('low','moderate','high','unknown'),false)
      OR jsonb_typeof(zone->'pests') IS DISTINCT FROM 'array' OR jsonb_array_length(zone->'pests')>20
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(zone->'pests') p WHERE jsonb_typeof(p)<>'string' OR length(p#>>'{}') NOT BETWEEN 1 AND 80)
      THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid zone fields'; END IF;
    END LOOP;
    UPDATE inspection_revisions SET findings=body->'findings',author_id=actor WHERE inspection_id=i.id AND revision=i.revision;
   ELSIF action='attachment' THEN
    IF (SELECT count(*) FROM inspection_attachments WHERE inspection_id=i.id AND revision=i.revision)>=10 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Maximum ten photos per revision'; END IF;
    photo:=decode(body->>'data','base64');
    IF COALESCE(octet_length(photo),0) NOT BETWEEN 1 AND 1048576 OR COALESCE(length(body->>'name'),0) NOT BETWEEN 1 AND 160 OR NOT COALESCE((body->>'media_type'='image/jpeg' AND substring(photo FROM 1 FOR 3)=decode('ffd8ff','hex') OR body->>'media_type'='image/png' AND substring(photo FROM 1 FOR 8)=decode('89504e470d0a1a0a','hex')),false) THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Upload a JPEG or PNG up to 1 MB'; END IF;
    INSERT INTO inspection_attachments(inspection_id,revision,actor_id,name,media_type,data) VALUES(i.id,i.revision,actor,body->>'name',body->>'media_type',photo);
   ELSE
    findings:=r.findings;
    IF length(trim(findings->>'summary')) NOT BETWEEN 1 AND 10000 OR jsonb_array_length(findings->'zones') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Summary and at least one zone required'; END IF;
    FOR zone IN SELECT value FROM jsonb_array_elements(findings->'zones') LOOP
     IF jsonb_typeof(zone) IS DISTINCT FROM 'object' OR COALESCE(length(trim(zone->>'name')),0) NOT BETWEEN 1 AND 120
      OR NOT COALESCE(zone->>'evidence' IN ('observed','reported','none','unknown'),false) OR NOT COALESCE(zone->>'severity' IN ('low','moderate','high','unknown'),false)
      OR jsonb_typeof(zone->'inaccessible') IS DISTINCT FROM 'boolean' OR COALESCE(length(trim(zone->>'notes')),0) NOT BETWEEN 1 AND 4000
      OR jsonb_typeof(zone->'pests') IS DISTINCT FROM 'array' OR jsonb_array_length(zone->'pests')>20
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(zone->'pests') p WHERE jsonb_typeof(p)<>'string' OR length(p#>>'{}') NOT BETWEEN 1 AND 80)
      THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Each zone needs a name, evidence, severity, access status, pest list and notes'; END IF;
    END LOOP;
    UPDATE inspection_revisions SET submitted_at=now(),submitted_by=actor WHERE inspection_id=i.id AND revision=i.revision;
    i.state:='submitted';
   END IF;
  ELSIF action='review' THEN
   IF i.state<>'submitted' OR COALESCE(length(trim(body->>'reason')),0) NOT BETWEEN 1 AND 4000 OR NOT COALESCE(body->>'decision' IN ('reviewed','revision_requested'),false) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Submitted findings and a review reason are required'; END IF;
   UPDATE inspection_revisions SET reviewed_at=now(),reviewed_by=actor,review_reason=body->>'reason' WHERE inspection_id=i.id AND revision=i.revision;
   IF body->>'decision'='reviewed' THEN i.state:='reviewed';
   ELSE
    IF j.status::text IN ('completed','invoiced','cancelled') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Closed job requires a new inspection visit'; END IF;
    i.revision:=i.revision+1; i.state:='in_progress';
    INSERT INTO inspection_revisions(inspection_id,revision,findings) VALUES(i.id,i.revision,r.findings);
   END IF;
  ELSIF action='cancel' THEN
   IF i.state IN ('reviewed','cancelled') OR COALESCE(length(trim(body->>'reason')),0) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Cancellation requires an open inspection and reason'; END IF;
   i.state:='cancelled';
  END IF;
  UPDATE inspections SET state=i.state,revision=i.revision,version=i.version+1,updated_at=now() WHERE id=i.id RETURNING * INTO i;
 END IF;
 INSERT INTO inspection_requests(tenant_id,actor_id,action,request_key,inspection_id,payload) VALUES(tenant,actor,action,(body->>'request_key')::uuid,i.id,body);
 INSERT INTO inspection_events(inspection_id,actor_id,action,revision,reason) VALUES(i.id,actor,action,i.revision,body->>'reason');
 RETURN inspection_view(i);
END $$;
CREATE FUNCTION inspection_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status::text IN ('completed','invoiced') AND NEW.status IS DISTINCT FROM OLD.status AND EXISTS(SELECT 1 FROM inspections WHERE job_id=NEW.id AND state NOT IN ('submitted','reviewed','cancelled')) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Submit inspection findings before completing this job'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inspection_completion_guard BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION inspection_completion_guard();
