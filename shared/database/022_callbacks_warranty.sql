-- Canonical callback domain. All four adapters call the same transactional commands.
-- Additive migration; intake is disabled until a tenant manager enables it.
BEGIN;
ALTER TABLE tenants ADD COLUMN callbacks_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN callback_hourly_labor_rate numeric(10,2) CHECK(callback_hourly_labor_rate >= 0);
ALTER TABLE tenants ADD COLUMN callback_timezone varchar(80) NOT NULL DEFAULT 'UTC';
CREATE TABLE warranty_policy_versions (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name varchar(120) NOT NULL, version integer NOT NULL CHECK (version > 0),
 reporting_window_days integer NOT NULL CHECK (reporting_window_days BETWEEN 0 AND 3650),
 covered_pests jsonb NOT NULL CHECK (jsonb_typeof(covered_pests) = 'array'),
 exclusions text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id, name, version), UNIQUE(tenant_id, id)
);
ALTER TABLE service_contracts ADD COLUMN warranty_policy_id uuid REFERENCES warranty_policy_versions(id);
ALTER TABLE jobs ADD COLUMN warranty_policy_id uuid REFERENCES warranty_policy_versions(id);
ALTER TABLE jobs ADD COLUMN purpose varchar(20) NOT NULL DEFAULT 'standard' CHECK (purpose IN ('standard','return_visit'));
ALTER TABLE jobs ADD COLUMN source_job_id uuid REFERENCES jobs(id);
ALTER TABLE jobs ADD COLUMN billing_disposition varchar(20) NOT NULL DEFAULT 'standard' CHECK (billing_disposition IN ('standard','no_charge','goodwill','quoted_paid'));
CREATE TABLE service_callbacks (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 customer_id uuid NOT NULL REFERENCES customers(id), property_id uuid NOT NULL REFERENCES properties(id),
 source_job_id uuid REFERENCES jobs(id), contract_id uuid REFERENCES service_contracts(id),
 pest_code varchar(80) NOT NULL, description text NOT NULL CHECK(length(description) BETWEEN 1 AND 10000),
 preferred_availability text NOT NULL DEFAULT '',
 state varchar(30) NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','triage','awaiting_customer','approved','declined','scheduled','in_service','awaiting_review','resolved','cancelled')),
 coverage varchar(20) NOT NULL DEFAULT 'manual_review' CHECK(coverage IN ('pending','covered','not_covered','manual_review')),
 coverage_reason text NOT NULL DEFAULT 'Warranty terms require staff review', policy_snapshot jsonb,
 billing_disposition varchar(20) CHECK(billing_disposition IN ('no_charge','goodwill','quoted_paid')),
 quote_id uuid UNIQUE REFERENCES quotes(id), assigned_csr_id uuid REFERENCES users(id),
 reported_at timestamptz NOT NULL DEFAULT now(), response_due_at timestamptz NOT NULL DEFAULT now() + interval '1 day',
 first_response_at timestamptz, resolved_at timestamptz, resolution_code varchar(80), resolution_summary text,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 intake_key uuid NOT NULL, UNIQUE(tenant_id,intake_key), UNIQUE(tenant_id,id)
);
CREATE INDEX callbacks_queue ON service_callbacks(tenant_id,state,created_at);
CREATE INDEX callbacks_property ON service_callbacks(tenant_id,property_id,source_job_id);
CREATE INDEX callbacks_assignee ON service_callbacks(tenant_id,assigned_csr_id,response_due_at);
CREATE TABLE callback_visits (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL, callback_id uuid NOT NULL,
 job_id uuid NOT NULL UNIQUE REFERENCES jobs(id), sequence integer NOT NULL CHECK(sequence > 0),
 request_key uuid NOT NULL, findings text, resolution_code varchar(80), summary text, follow_up boolean,
 outcome_key uuid, outcome_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 labor_rate_snapshot numeric(10,2), material_cost numeric(10,2) CHECK(material_cost >= 0),
 FOREIGN KEY(tenant_id,callback_id) REFERENCES service_callbacks(tenant_id,id),
 UNIQUE(callback_id,sequence), UNIQUE(callback_id,request_key)
);
CREATE TABLE callback_events (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL, callback_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), action varchar(40) NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 customer_message text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,callback_id) REFERENCES service_callbacks(tenant_id,id)
);
CREATE INDEX callback_events_case ON callback_events(callback_id,created_at);
-- Small protected images are stored here; never exposed through the public /uploads directory.
CREATE TABLE callback_attachments (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL, callback_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), name varchar(160) NOT NULL, media_type varchar(30) NOT NULL,
 data bytea NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 1048576), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,callback_id) REFERENCES service_callbacks(tenant_id,id)
);
CREATE INDEX callback_attachments_case ON callback_attachments(callback_id);

CREATE FUNCTION callback_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0409', MESSAGE='Historical callback records are immutable'; END $$;
CREATE TRIGGER warranty_immutable BEFORE UPDATE OR DELETE ON warranty_policy_versions FOR EACH ROW EXECUTE FUNCTION callback_immutable();
CREATE TRIGGER callback_events_immutable BEFORE UPDATE OR DELETE ON callback_events FOR EACH ROW EXECUTE FUNCTION callback_immutable();

CREATE FUNCTION callback_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy_tenant uuid;
BEGIN
 IF (NEW.purpose='return_visit' OR TG_OP='UPDATE' AND OLD.purpose='return_visit') AND current_setting('crm.callback_authorized',true) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manage return visits through the callback workflow'; END IF;
 IF TG_OP='INSERT' AND NEW.purpose='standard' AND NEW.warranty_policy_id IS NULL AND NEW.contract_id IS NOT NULL THEN
  SELECT warranty_policy_id INTO NEW.warranty_policy_id FROM service_contracts WHERE id=NEW.contract_id AND tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND customer_id=NEW.customer_id;
 END IF;
 IF NEW.warranty_policy_id IS NOT NULL THEN
  SELECT tenant_id INTO policy_tenant FROM warranty_policy_versions WHERE id=NEW.warranty_policy_id;
  IF policy_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Policy belongs to another tenant'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.purpose='return_visit' AND
  (NEW.tenant_id,NEW.customer_id,NEW.property_id,NEW.contract_id,NEW.source_job_id,NEW.purpose,NEW.billing_disposition) IS DISTINCT FROM
  (OLD.tenant_id,OLD.customer_id,OLD.property_id,OLD.contract_id,OLD.source_job_id,OLD.purpose,OLD.billing_disposition)
 THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Return visit identity and billing are immutable'; END IF;
 IF NEW.purpose='return_visit' AND NEW.technician_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM technicians t JOIN users u ON u.id=t.user_id WHERE t.id=NEW.technician_id AND u.tenant_id=NEW.tenant_id)
 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Return technician belongs to another tenant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER callback_job_guard BEFORE INSERT OR UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION callback_job_guard();
CREATE FUNCTION callback_contract_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.warranty_policy_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM warranty_policy_versions WHERE id=NEW.warranty_policy_id AND tenant_id=NEW.tenant_id)
 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Policy belongs to another tenant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER callback_contract_guard BEFORE INSERT OR UPDATE ON service_contracts FOR EACH ROW EXECUTE FUNCTION callback_contract_guard();
CREATE FUNCTION callback_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM jobs WHERE id=NEW.job_id AND billing_disposition IN ('no_charge','goodwill'))
 THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='No-charge return visits cannot be invoiced'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER callback_invoice_guard BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION callback_invoice_guard();
CREATE FUNCTION callback_commission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM jobs WHERE id=NEW.job_id AND purpose='return_visit')
 THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Return visits do not generate sales commissions'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER callback_commission_guard BEFORE INSERT OR UPDATE ON commissions FOR EACH ROW EXECUTE FUNCTION callback_commission_guard();

CREATE FUNCTION callback_view(c service_callbacks, customer_view boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT (to_jsonb(c) - 'intake_key' - CASE WHEN customer_view THEN 'policy_snapshot' ELSE '__none' END
  - CASE WHEN customer_view THEN 'coverage_reason' ELSE '__none' END)
 || jsonb_build_object(
 'property_address',(SELECT address FROM properties WHERE id=c.property_id),
 'customer_name',(SELECT name FROM customers WHERE id=c.customer_id),
 'events',COALESCE((SELECT jsonb_agg(CASE WHEN customer_view THEN
   jsonb_build_object('id',e.id,'action',e.action,'customer_message',e.customer_message,'created_at',e.created_at)
   ELSE to_jsonb(e) END ORDER BY e.created_at,e.id) FROM callback_events e WHERE e.callback_id=c.id),'[]'),
 'visits',COALESCE((SELECT jsonb_agg(CASE WHEN customer_view THEN jsonb_build_object('id',v.id,'job_id',v.job_id,'sequence',v.sequence,'job_status',j.status,'scheduled_start',j.scheduled_start)
 ELSE to_jsonb(v) || jsonb_build_object('job_status',j.status,'scheduled_start',j.scheduled_start,'technician_id',j.technician_id,'labor_minutes',j.on_site_time_minutes,
 'labor_cost',v.labor_rate_snapshot*j.on_site_time_minutes/60.0,'total_cost',v.labor_rate_snapshot*j.on_site_time_minutes/60.0+v.material_cost,
 'cost_complete',v.labor_rate_snapshot IS NOT NULL AND j.on_site_time_minutes IS NOT NULL AND v.material_cost IS NOT NULL) END
 ORDER BY v.sequence) FROM callback_visits v JOIN jobs j ON j.id=v.job_id WHERE v.callback_id=c.id),'[]'),
 'attachments',COALESCE((SELECT jsonb_agg(to_jsonb(a)-'data') FROM callback_attachments a WHERE a.callback_id=c.id),'[]'),
 'quote',CASE WHEN c.quote_id IS NULL THEN NULL ELSE (SELECT jsonb_build_object('id',q.id,'total_amount',q.total_amount,'status',q.status) FROM quotes q WHERE q.id=c.quote_id) END,
 'source_visit',CASE WHEN customer_view THEN NULL ELSE (SELECT jsonb_build_object('id',j.id,'completed_at',COALESCE(j.actual_departure,j.updated_at),'applications',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM chemical_application_logs l WHERE l.job_id=j.id),'[]')) FROM jobs j WHERE j.id=c.source_job_id) END)
$$;

-- Actor identities are verified by the HTTP adapters; roles and ownership are read from DB.
-- Domain errors map to 400/401/403/404/409/503 consistently across all adapters.
CREATE FUNCTION callback_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 actor_role text; is_staff boolean; is_manager boolean; customer_actor uuid;
 c service_callbacks; j jobs; policy warranty_policy_versions; visit callback_visits;
 prop properties; contract service_contracts; result jsonb; target uuid; policy_id uuid;
 reason text; message text; decision text; key uuid; event_id uuid; image bytea; source_time timestamptz;
BEGIN
 SELECT role::text INTO actor_role FROM users WHERE id=actor AND tenant_id=tenant;
 IF actor_role IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Authenticated user not found'; END IF;
 PERFORM set_config('crm.callback_authorized','true',true);
 is_staff := actor_role IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP');
 is_manager := actor_role IN ('SUPER_ADMIN','MANAGER');
 SELECT id INTO customer_actor FROM customers WHERE user_id=actor;
 IF NOT is_staff AND actor_role NOT IN ('CUSTOMER','TECHNICIAN') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Callback access denied'; END IF;

 IF action='settings' THEN
  IF body ? 'enabled' THEN
   IF NOT is_manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager approval required'; END IF;
   UPDATE tenants SET callbacks_enabled=(body->>'enabled')::boolean WHERE id=tenant;
  END IF;
  IF body ? 'hourly_labor_rate' THEN
   IF NOT is_manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager approval required'; END IF;
   UPDATE tenants SET callback_hourly_labor_rate=(body->>'hourly_labor_rate')::numeric WHERE id=tenant;
  END IF;
  IF body ? 'timezone' THEN
   IF NOT is_manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager approval required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=body->>'timezone') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown time zone'; END IF;
   UPDATE tenants SET callback_timezone=body->>'timezone' WHERE id=tenant;
  END IF;
  IF body ? 'enabled' OR body ? 'hourly_labor_rate' OR body ? 'timezone' THEN
   INSERT INTO audit_logs(tenant_id,actor_id,actor_role,action,entity_type,entity_id,new_values) VALUES(tenant,actor,actor_role,'callback_settings','tenant',tenant,body);
  END IF;
  RETURN jsonb_build_object('enabled',(SELECT callbacks_enabled FROM tenants WHERE id=tenant),'role',actor_role,
   'timezone',(SELECT callback_timezone FROM tenants WHERE id=tenant),
   'hourly_labor_rate',CASE WHEN is_staff THEN (SELECT callback_hourly_labor_rate FROM tenants WHERE id=tenant) ELSE NULL END);
 END IF;
 IF action='policies' THEN
  IF NOT is_staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff access required'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.version) FROM warranty_policy_versions p WHERE p.tenant_id=tenant),'[]');
 END IF;
 IF action='create_policy' THEN
  IF NOT is_manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager approval required'; END IF;
  IF COALESCE(length(trim(body->>'name')),0) NOT BETWEEN 1 AND 120 OR jsonb_typeof(body->'covered_pests') IS DISTINCT FROM 'array'
    OR jsonb_array_length(body->'covered_pests')=0 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Policy name and covered pests required'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(body->'covered_pests') item WHERE jsonb_typeof(item)<>'string' OR length(trim(item#>>'{}')) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Covered pests must be nonempty names'; END IF;
  INSERT INTO warranty_policy_versions(tenant_id,name,version,reporting_window_days,covered_pests,exclusions)
  VALUES(tenant,trim(body->>'name'),(body->>'version')::int,(body->>'reporting_window_days')::int,(SELECT jsonb_agg(lower(trim(item#>>'{}'))) FROM jsonb_array_elements(body->'covered_pests') item),COALESCE(body->>'exclusions','')) RETURNING * INTO policy;
  INSERT INTO audit_logs(tenant_id,actor_id,actor_role,action,entity_type,entity_id,new_values) VALUES(tenant,actor,actor_role,'create_warranty_policy','warranty_policy',policy.id,to_jsonb(policy));
  RETURN to_jsonb(policy);
 END IF;
 IF action='assign_policy' THEN
  IF NOT is_manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager approval required'; END IF;
  policy_id := (body->>'policy_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM warranty_policy_versions WHERE id=policy_id AND tenant_id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Policy not found'; END IF;
  IF body->>'kind'='contract' THEN
   UPDATE service_contracts SET warranty_policy_id=policy_id WHERE id=(body->>'target_id')::uuid AND tenant_id=tenant;
  ELSIF body->>'kind'='job' THEN
   UPDATE jobs SET warranty_policy_id=policy_id WHERE id=(body->>'target_id')::uuid AND tenant_id=tenant AND purpose='standard';
  ELSE RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Choose contract or job'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Assignment target not found'; END IF;
  INSERT INTO audit_logs(tenant_id,actor_id,actor_role,action,entity_type,entity_id,new_values) VALUES(tenant,actor,actor_role,'assign_warranty_policy',body->>'kind',(body->>'target_id')::uuid,body);
  RETURN jsonb_build_object('assigned',true);
 END IF;
 IF action='options' THEN
  IF actor_role='TECHNICIAN' THEN RETURN jsonb_build_object('properties','[]','jobs','[]'); END IF;
  RETURN jsonb_build_object(
   'properties',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'address',p.address,'customer_id',p.customer_id,'customer_name',cu.name)) FROM properties p JOIN customers cu ON cu.id=p.customer_id JOIN users u ON u.id=cu.user_id WHERE u.tenant_id=tenant AND (is_staff OR cu.id=customer_actor)),'[]'),
   'jobs',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'property_id',x.property_id,'completed_at',COALESCE(x.actual_departure,x.updated_at))) FROM jobs x WHERE x.tenant_id=tenant AND x.purpose='standard' AND x.status IN ('completed','invoiced') AND (is_staff OR x.customer_id=customer_actor)),'[]'),
   'technicians',CASE WHEN is_staff THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',u.email)) FROM technicians t JOIN users u ON u.id=t.user_id WHERE u.tenant_id=tenant),'[]') ELSE '[]'::jsonb END,
   'quotes',CASE WHEN is_staff THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'property_id',q.property_id,'total_amount',q.total_amount)) FROM quotes q JOIN customers cu ON cu.id=q.customer_id JOIN users u ON u.id=cu.user_id WHERE u.tenant_id=tenant AND q.status='sent'),'[]') ELSE '[]'::jsonb END);
 END IF;
 IF action='report' THEN
  IF NOT is_staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff access required'; END IF;
  source_time := COALESCE((body->>'from')::timestamptz,now()-interval '90 days');
  RETURN jsonb_build_object('from',source_time,'to',now(),'observation_window','Through report generation time; recent cohorts have less follow-up',
   'eligible_source_jobs',(SELECT count(*) FROM jobs x WHERE x.tenant_id=tenant AND x.purpose='standard' AND x.status IN ('completed','invoiced') AND x.actual_departure>=source_time),
   'source_jobs_with_callback',(SELECT count(DISTINCT cb.source_job_id) FROM service_callbacks cb JOIN jobs x ON x.id=cb.source_job_id WHERE cb.tenant_id=tenant AND x.purpose='standard' AND x.status IN ('completed','invoiced') AND x.actual_departure>=source_time),
   'missing_completion_dates',(SELECT count(*) FROM jobs x WHERE x.tenant_id=tenant AND x.purpose='standard' AND x.status IN ('completed','invoiced') AND x.actual_departure IS NULL),
   'total_cases',(SELECT count(*) FROM service_callbacks WHERE tenant_id=tenant AND reported_at>=source_time),
   'unlinked_cases',(SELECT count(*) FROM service_callbacks WHERE tenant_id=tenant AND reported_at>=source_time AND source_job_id IS NULL),
   'average_first_response_hours',(SELECT avg(extract(epoch FROM first_response_at-reported_at)/3600) FROM service_callbacks WHERE tenant_id=tenant AND reported_at>=source_time),
   'average_resolution_hours',(SELECT avg(extract(epoch FROM resolved_at-reported_at)/3600) FROM service_callbacks WHERE tenant_id=tenant AND reported_at>=source_time AND state='resolved'),
   'additional_visits',(SELECT count(*) FROM callback_visits v JOIN service_callbacks cb ON cb.id=v.callback_id WHERE cb.tenant_id=tenant AND cb.reported_at>=source_time AND v.sequence>1),
   'by_resolution',COALESCE((SELECT jsonb_object_agg(code,total) FROM (SELECT COALESCE(resolution_code,'unresolved') code,count(*) total FROM service_callbacks WHERE tenant_id=tenant AND reported_at>=source_time GROUP BY resolution_code) counts),'{}'),
   'by_billing',COALESCE((SELECT jsonb_object_agg(code,total) FROM (SELECT COALESCE(billing_disposition,'pending') code,count(*) total FROM service_callbacks WHERE tenant_id=tenant AND reported_at>=source_time GROUP BY billing_disposition) counts),'{}'));
 END IF;
 IF action='list' THEN
  RETURN jsonb_build_object('items',COALESCE((SELECT jsonb_agg(callback_view(s,actor_role='CUSTOMER') ORDER BY s.created_at DESC) FROM
   (SELECT cb.* FROM service_callbacks cb WHERE cb.tenant_id=tenant
   AND (NOT(body ? 'state') OR cb.state=body->>'state')
   AND (NOT(body ? 'customer_id') OR cb.customer_id=(body->>'customer_id')::uuid)
   AND (NOT(body ? 'job_id') OR EXISTS(SELECT 1 FROM callback_visits v WHERE v.callback_id=cb.id AND v.job_id=(body->>'job_id')::uuid))
   AND (is_staff OR cb.customer_id=customer_actor AND actor_role='CUSTOMER' OR actor_role='TECHNICIAN' AND EXISTS(
    SELECT 1 FROM callback_visits v JOIN jobs x ON x.id=v.job_id JOIN technicians t ON t.id=x.technician_id WHERE v.callback_id=cb.id AND t.user_id=actor))
   ORDER BY cb.created_at DESC LIMIT LEAST(GREATEST(COALESCE((body->>'limit')::int,50),1),100) OFFSET GREATEST(COALESCE((body->>'offset')::int,0),0)) s),'[]'));
 END IF;

 IF action='create' THEN
  IF actor_role='TECHNICIAN' THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff or customer intake required'; END IF;
  IF NOT (SELECT callbacks_enabled FROM tenants WHERE id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='Callback intake is not enabled'; END IF;
  key := (body->>'request_key')::uuid;
  IF key IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Request key required'; END IF;
  -- Serialize retries before insert, including simultaneous requests.
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant::text || key::text,0));
  SELECT * INTO c FROM service_callbacks WHERE tenant_id=tenant AND intake_key=key;
  IF FOUND THEN
   IF NOT is_staff AND c.customer_id IS DISTINCT FROM customer_actor THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Case not found'; END IF;
   RETURN callback_view(c,actor_role='CUSTOMER');
  END IF;
  SELECT p.* INTO prop FROM properties p JOIN customers cu ON cu.id=p.customer_id JOIN users u ON u.id=cu.user_id
   WHERE p.id=(body->>'property_id')::uuid AND u.tenant_id=tenant AND (is_staff OR cu.id=customer_actor);
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Property not found'; END IF;
  IF COALESCE(length(trim(body->>'description')),0) NOT BETWEEN 1 AND 10000 OR COALESCE(length(trim(body->>'pest_code')),0) NOT BETWEEN 1 AND 80
  THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Pest and description required'; END IF;
  IF body->>'source_job_id' IS NOT NULL THEN
   SELECT * INTO j FROM jobs WHERE id=(body->>'source_job_id')::uuid AND tenant_id=tenant AND customer_id=prop.customer_id AND property_id=prop.id AND purpose='standard' AND status IN ('completed','invoiced');
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Completed source visit not found'; END IF;
  END IF;
  INSERT INTO service_callbacks(tenant_id,customer_id,property_id,source_job_id,contract_id,pest_code,description,preferred_availability,intake_key)
  VALUES(tenant,prop.customer_id,prop.id,j.id,j.contract_id,lower(trim(body->>'pest_code')),trim(body->>'description'),COALESCE(body->>'preferred_availability',''),key) RETURNING * INTO c;
  message := 'We received your report. Our team will review coverage and contact you before scheduling.';
 ELSE
  SELECT * INTO c FROM service_callbacks WHERE id=(body->>'id')::uuid AND tenant_id=tenant FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE((is_staff OR actor_role='CUSTOMER' AND c.customer_id=customer_actor OR actor_role='TECHNICIAN' AND EXISTS(
   SELECT 1 FROM callback_visits v JOIN jobs x ON x.id=v.job_id JOIN technicians t ON t.id=x.technician_id WHERE v.callback_id=c.id AND t.user_id=actor)),false)
  THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Case not found'; END IF;
  IF action='get' THEN RETURN callback_view(c,actor_role='CUSTOMER'); END IF;
  IF action='attachment_get' THEN
   SELECT jsonb_build_object('name',name,'media_type',media_type,'data',encode(data,'base64')) INTO result FROM callback_attachments WHERE id=(body->>'attachment_id')::uuid AND callback_id=c.id;
   IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Attachment not found'; END IF;
   RETURN result;
  END IF;
  IF action='attachment' THEN
   IF c.state IN ('resolved','cancelled','declined') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Case is closed'; END IF;
   IF (SELECT count(*) FROM callback_attachments WHERE callback_id=c.id)>=10 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Maximum ten photos per case'; END IF;
   image := decode(body->>'data','base64');
   IF COALESCE(octet_length(image),0) NOT BETWEEN 1 AND 1048576 OR COALESCE(length(body->>'name'),0) NOT BETWEEN 1 AND 160
    OR NOT ((body->>'media_type'='image/jpeg' AND substring(image FROM 1 FOR 3)=decode('ffd8ff','hex'))
     OR (body->>'media_type'='image/png' AND substring(image FROM 1 FOR 8)=decode('89504e470d0a1a0a','hex')))
   THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Upload a JPEG or PNG up to 1 MB'; END IF;
   INSERT INTO callback_attachments(tenant_id,callback_id,actor_id,name,media_type,data) VALUES(tenant,c.id,actor,body->>'name',body->>'media_type',image);
   INSERT INTO callback_events(tenant_id,callback_id,actor_id,action) VALUES(tenant,c.id,actor,'attachment');
   RETURN callback_view(c,actor_role='CUSTOMER');
  END IF;
  -- Idempotent visits/outcomes must replay before optimistic version checks.
  IF action='visit' THEN
   SELECT * INTO visit FROM callback_visits WHERE callback_id=c.id AND request_key=(body->>'request_key')::uuid;
   IF FOUND AND is_staff THEN RETURN callback_view(c,false); END IF;
  ELSIF action='outcome' THEN
   SELECT * INTO visit FROM callback_visits WHERE callback_id=c.id AND job_id=(body->>'job_id')::uuid;
   IF NOT is_staff AND NOT EXISTS(SELECT 1 FROM jobs x JOIN technicians t ON t.id=x.technician_id WHERE x.id=visit.job_id AND t.user_id=actor) THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Assigned technician required'; END IF;
   IF visit.outcome_key IS NOT NULL AND visit.outcome_key=(body->>'request_key')::uuid THEN RETURN callback_view(c,false); END IF;
  END IF;
  IF (body->>'version')::int IS DISTINCT FROM c.version THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Case changed; refresh before retrying'; END IF;
  IF action NOT IN ('outcome','reply','accept_quote','visit_update') AND NOT is_staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff access required'; END IF;

  IF action='quote' THEN
   IF c.state NOT IN ('submitted','triage','awaiting_customer') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Quote requires an open review'; END IF;
   IF COALESCE((body->>'total_amount')::numeric,0)<=0 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Positive quote amount required'; END IF;
   INSERT INTO quotes(customer_id,property_id,total_amount,status) VALUES(c.customer_id,c.property_id,(body->>'total_amount')::numeric,'sent') RETURNING id INTO c.quote_id;
   message := 'A return-service quote of $' || (body->>'total_amount') || ' is ready. Our team will confirm the service decision before you accept it.';
  ELSIF action='assess' THEN
   IF c.state NOT IN ('submitted','triage','awaiting_customer') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Case cannot be assessed in this state'; END IF;
   IF body->>'source_job_id' IS NOT NULL THEN
    SELECT * INTO j FROM jobs WHERE id=(body->>'source_job_id')::uuid AND tenant_id=tenant AND customer_id=c.customer_id AND property_id=c.property_id AND purpose='standard' AND status IN ('completed','invoiced');
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Source visit not found'; END IF;
    c.source_job_id := j.id; c.contract_id := j.contract_id;
   ELSE SELECT * INTO j FROM jobs WHERE id=c.source_job_id; END IF;
   SELECT * INTO contract FROM service_contracts WHERE id=c.contract_id AND tenant_id=tenant AND property_id=c.property_id AND customer_id=c.customer_id;
   SELECT * INTO policy FROM warranty_policy_versions WHERE id=COALESCE(j.warranty_policy_id,contract.warranty_policy_id) AND tenant_id=tenant;
   c.policy_snapshot := to_jsonb(policy); c.coverage := 'manual_review'; c.coverage_reason := 'No applicable warranty terms or completed source visit';
   source_time := j.actual_departure;
   IF policy.id IS NOT NULL AND source_time IS NOT NULL THEN
    IF c.reported_at < source_time OR c.reported_at > source_time + make_interval(days=>policy.reporting_window_days) THEN
     c.coverage := 'not_covered'; c.coverage_reason := 'Outside the reporting window';
    ELSIF NOT policy.covered_pests ? c.pest_code THEN
     c.coverage := 'not_covered'; c.coverage_reason := 'Pest is outside the covered scope';
    ELSIF j.contract_id IS NOT NULL AND (contract.id IS NULL OR contract.status<>'active' OR (c.reported_at AT TIME ZONE (SELECT callback_timezone FROM tenants WHERE id=tenant))::date<contract.start_date OR contract.end_date IS NOT NULL AND (c.reported_at AT TIME ZONE (SELECT callback_timezone FROM tenants WHERE id=tenant))::date>contract.end_date) THEN
     c.coverage := 'not_covered'; c.coverage_reason := 'Contract inactive or outside contract dates at report time';
    ELSIF length(trim(policy.exclusions))>0 THEN
     c.coverage := 'manual_review'; c.coverage_reason := 'Staff must review policy exclusions';
    ELSE c.coverage := 'covered'; c.coverage_reason := 'Within reporting window and covered pest scope; staff approval required'; END IF;
   END IF;
   c.state := 'triage'; c.assigned_csr_id := actor; c.first_response_at := COALESCE(c.first_response_at,now());
  ELSIF action='decision' THEN
   IF c.state NOT IN ('submitted','triage','awaiting_customer') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Case cannot be decided in this state'; END IF;
   decision := body->>'decision'; reason := trim(COALESCE(body->>'reason','')); message := trim(COALESCE(body->>'customer_message',''));
   IF reason='' OR message='' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Internal reason and customer explanation required'; END IF;
   IF decision='approve' THEN
    c.billing_disposition := body->>'billing_disposition';
    IF c.billing_disposition IS NULL OR c.billing_disposition NOT IN ('no_charge','goodwill','quoted_paid') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Billing disposition required'; END IF;
    IF (c.billing_disposition='goodwill' OR c.billing_disposition='no_charge' AND c.coverage<>'covered') AND NOT is_manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager override required'; END IF;
    IF c.billing_disposition='quoted_paid' THEN
     c.quote_id := (body->>'quote_id')::uuid;
     IF NOT EXISTS(SELECT 1 FROM quotes WHERE id=c.quote_id AND customer_id=c.customer_id AND property_id=c.property_id AND status='sent' AND total_amount>0)
     THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='A sent quote for this property is required'; END IF;
    END IF;
    c.state := 'approved';
   ELSIF decision='decline' THEN c.state := 'declined';
   ELSIF decision='request_information' THEN c.state := 'awaiting_customer';
   ELSE RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown decision'; END IF;
   c.assigned_csr_id := actor; c.first_response_at := COALESCE(c.first_response_at,now());
  ELSIF action='reply' THEN
   IF actor_role<>'CUSTOMER' OR c.state<>'awaiting_customer' OR COALESCE(length(trim(body->>'message')),0) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Customer reply is not available'; END IF;
   message := trim(body->>'message'); c.state := 'triage';
  ELSIF action='accept_quote' THEN
   -- Customer acceptance cannot use the legacy acceptQuote path which creates an unrelated job.
   IF actor_role<>'CUSTOMER' OR c.state<>'approved' OR c.billing_disposition<>'quoted_paid' THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Customer quote acceptance is not available'; END IF;
   UPDATE quotes SET status='accepted',updated_at=now() WHERE id=c.quote_id AND customer_id=customer_actor AND property_id=c.property_id AND status='sent';
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Quote is no longer available'; END IF;
   message := 'You accepted the quote. Our team will schedule your return visit.';
  ELSIF action='visit' THEN
   IF c.state NOT IN ('approved','awaiting_review') OR c.billing_disposition IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Approve service before dispatch'; END IF;
   IF EXISTS(SELECT 1 FROM callback_visits v JOIN jobs x ON x.id=v.job_id WHERE v.callback_id=c.id AND x.status NOT IN ('completed','invoiced','cancelled')) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='An active return visit already exists'; END IF;
   IF c.billing_disposition='quoted_paid' AND NOT EXISTS(SELECT 1 FROM quotes WHERE id=c.quote_id AND status='accepted') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Customer must accept the quote before scheduling'; END IF;
   key := (body->>'request_key')::uuid;
   IF key IS NULL OR body->>'scheduled_start' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Request key and scheduled start required'; END IF;
   target := (body->>'technician_id')::uuid;
   IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM technicians t JOIN users u ON u.id=t.user_id WHERE t.id=target AND u.tenant_id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Technician not found'; END IF;
   INSERT INTO jobs(tenant_id,customer_id,property_id,technician_id,status,scheduled_start,source_job_id,purpose,billing_disposition)
   VALUES(tenant,c.customer_id,c.property_id,target,'scheduled',(body->>'scheduled_start')::timestamptz,c.source_job_id,'return_visit',c.billing_disposition) RETURNING * INTO j;
   INSERT INTO callback_visits(tenant_id,callback_id,job_id,sequence,request_key,labor_rate_snapshot)
   VALUES(tenant,c.id,j.id,COALESCE((SELECT max(sequence)+1 FROM callback_visits WHERE callback_id=c.id),1),key,(SELECT callback_hourly_labor_rate FROM tenants WHERE id=tenant));
   c.state := 'scheduled'; message := 'Your return visit has been scheduled. Check your service calendar for details.';
  ELSIF action='visit_update' THEN
   SELECT * INTO j FROM jobs WHERE id=(body->>'job_id')::uuid AND id IN (SELECT job_id FROM callback_visits WHERE callback_id=c.id) FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Return visit not found'; END IF;
   IF j.status NOT IN ('draft','scheduled','in_progress') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Return visit is no longer active'; END IF;
   IF body->>'operation'='start' THEN
    IF NOT is_staff AND NOT EXISTS(SELECT 1 FROM technicians WHERE id=j.technician_id AND user_id=actor) THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Assigned technician required'; END IF;
    UPDATE jobs SET status='in_progress',actual_arrival=COALESCE(actual_arrival,now()),updated_at=now() WHERE id=j.id;
    c.state := 'in_service';
   ELSIF body->>'operation'='schedule' THEN
    IF NOT is_staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff access required'; END IF;
    IF j.status='in_progress' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Visit is already in progress'; END IF;
    UPDATE jobs SET technician_id=(body->>'technician_id')::uuid,scheduled_start=COALESCE((body->>'scheduled_start')::timestamptz,scheduled_start),status='scheduled',updated_at=now() WHERE id=j.id;
    message := 'Your return visit schedule has been updated.';
   ELSIF body->>'operation'='cancel' THEN
    IF NOT is_staff OR COALESCE(length(trim(body->>'reason')),0)=0 THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff cancellation reason required'; END IF;
    IF j.status='in_progress' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Visit is already in progress'; END IF;
    UPDATE jobs SET status='cancelled',updated_at=now() WHERE id=j.id;
    c.state := 'approved'; message := 'Your return visit was cancelled. Our team will arrange the next steps.';
   ELSE RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown visit operation'; END IF;
  ELSIF action='outcome' THEN
   IF visit.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Return visit not found'; END IF;
   SELECT * INTO j FROM jobs WHERE id=visit.job_id FOR UPDATE;
   IF NOT is_staff AND NOT EXISTS(SELECT 1 FROM technicians WHERE id=j.technician_id AND user_id=actor) THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Assigned technician required'; END IF;
   IF c.state NOT IN ('scheduled','in_service') OR j.status='cancelled' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Visit cannot receive an outcome'; END IF;
   IF COALESCE(length(trim(body->>'findings')),0)=0 OR COALESCE(length(trim(body->>'summary')),0)=0 OR body->>'resolution_code' NOT IN ('treated','no_activity','access_failed','follow_up_required') OR body->>'resolution_code' IS NULL OR body->>'request_key' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Findings, outcome, summary and request key required'; END IF;
   UPDATE callback_visits SET findings=body->>'findings',summary=body->>'summary',resolution_code=body->>'resolution_code',follow_up=COALESCE((body->>'follow_up')::boolean,false),outcome_key=(body->>'request_key')::uuid,outcome_at=now() WHERE id=visit.id;
   UPDATE jobs SET status='completed',actual_departure=COALESCE(actual_departure,now()),on_site_time_minutes=CASE WHEN actual_arrival IS NOT NULL THEN GREATEST(0,floor(extract(epoch FROM now()-actual_arrival)/60)::int) ELSE on_site_time_minutes END,updated_at=now() WHERE id=j.id;
   c.state := 'awaiting_review'; message := 'Your return visit has been reviewed by the technician. Our team will confirm the next steps.';
  ELSIF action='resolve' THEN
   IF c.state<>'awaiting_review' OR NOT EXISTS(SELECT 1 FROM callback_visits WHERE callback_id=c.id AND outcome_at IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='A technician outcome is required before resolution'; END IF;
   IF COALESCE(length(trim(body->>'summary')),0)=0 OR COALESCE(length(trim(body->>'resolution_code')),0)=0 OR COALESCE(length(trim(body->>'customer_message')),0)=0 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Resolution and customer explanation required'; END IF;
   c.state := 'resolved'; c.resolved_at := now(); c.resolution_summary := body->>'summary'; c.resolution_code := body->>'resolution_code'; message := body->>'customer_message';
  ELSIF action='visit_cost' THEN
   IF NOT is_manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager approval required'; END IF;
   UPDATE callback_visits SET material_cost=(body->>'material_cost')::numeric WHERE callback_id=c.id AND job_id=(body->>'job_id')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Return visit not found'; END IF;
  ELSIF action='reopen' THEN
   IF c.state<>'resolved' OR COALESCE(length(trim(body->>'reason')),0)=0 THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Resolved case and reopening reason required'; END IF;
   c.state := 'triage'; c.resolved_at := NULL; c.resolution_code := NULL; c.resolution_summary := NULL; c.billing_disposition := NULL; c.quote_id := NULL; message := 'Your case has been reopened for review.';
  ELSIF action='cancel' THEN
   IF c.state IN ('resolved','declined','cancelled') OR COALESCE(length(trim(body->>'reason')),0)=0 THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Open case and cancellation reason required'; END IF;
   UPDATE jobs SET status='cancelled',updated_at=now() WHERE id IN (SELECT job_id FROM callback_visits WHERE callback_id=c.id) AND status IN ('draft','scheduled');
   IF EXISTS(SELECT 1 FROM callback_visits v JOIN jobs x ON x.id=v.job_id WHERE v.callback_id=c.id AND x.status='in_progress') THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Complete in-progress visits before cancellation'; END IF;
   c.state := 'cancelled'; message := COALESCE(body->>'customer_message','Your callback request has been cancelled.');
  ELSE RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown callback command'; END IF;
  UPDATE service_callbacks SET source_job_id=c.source_job_id,contract_id=c.contract_id,state=c.state,coverage=c.coverage,coverage_reason=c.coverage_reason,policy_snapshot=c.policy_snapshot,billing_disposition=c.billing_disposition,quote_id=c.quote_id,assigned_csr_id=c.assigned_csr_id,first_response_at=c.first_response_at,resolved_at=c.resolved_at,resolution_code=c.resolution_code,resolution_summary=c.resolution_summary,version=c.version+1,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 END IF;
 INSERT INTO callback_events(tenant_id,callback_id,actor_id,action,details,customer_message)
 VALUES(tenant,c.id,actor,action,body-'data',message) RETURNING id INTO event_id;
 -- Reuse email preference/queue infrastructure. Timeline remains authoritative if no opted-in address exists.
 IF message IS NOT NULL THEN
  INSERT INTO notification_queue(tenant_id,customer_id,channel,contact_target,message_content,status,scheduled_for)
  SELECT tenant,c.customer_id,'EMAIL',e.email_address,message,'pending',now() FROM customer_emails e
  LEFT JOIN notification_preferences p ON p.customer_id=e.customer_id
  WHERE e.customer_id=c.customer_id AND e.is_primary AND COALESCE(p.email_enabled,true) AND p.opt_out_timestamp IS NULL
  ORDER BY e.id LIMIT 1;
 END IF;
 RETURN callback_view(c,actor_role='CUSTOMER');
END $$;
COMMIT;
