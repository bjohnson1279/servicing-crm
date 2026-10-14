BEGIN;
ALTER TABLE tenants ADD COLUMN profitability_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN profitability_currency text CHECK(profitability_currency ~ '^[A-Z]{3}$');
ALTER TABLE tenants ADD COLUMN profitability_timezone text;
CREATE TABLE job_cost_policies (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),effective_from date NOT NULL,
 revision integer NOT NULL DEFAULT 1,hourly_rate numeric(12,2) NOT NULL CHECK(hourly_rate>=0),currency text NOT NULL,reason text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,effective_from,revision)
);
CREATE TABLE job_cost_entries (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),job_id uuid NOT NULL REFERENCES jobs(id),contract_id uuid REFERENCES service_contracts(id),
 category text NOT NULL CHECK(category IN ('labor','travel','materials','subcontractor','other')),revision integer NOT NULL CHECK(revision>0),
 supersedes_id uuid UNIQUE REFERENCES job_cost_entries(id),status text NOT NULL CHECK(status IN ('actual','zero','estimated','unknown')),
 amount numeric(14,2),currency text NOT NULL,service_date date NOT NULL,source text NOT NULL CHECK(source IN ('manual','recorded_time')),
 source_reference text NOT NULL,source_snapshot jsonb NOT NULL,policy_id uuid REFERENCES job_cost_policies(id),reason text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(job_id,category,revision),
 CHECK((status='unknown')=(amount IS NULL)),
 CHECK((status='unknown' AND amount IS NULL) OR (status='zero' AND amount=0) OR (status IN ('actual','estimated') AND amount>=0))
);
CREATE INDEX job_cost_report ON job_cost_entries(tenant_id,job_id,category,revision DESC);
CREATE INDEX job_cost_contract ON job_cost_entries(tenant_id,contract_id,service_date);
CREATE TABLE job_cost_requests (
 tenant_id uuid NOT NULL REFERENCES tenants(id),actor_id uuid NOT NULL REFERENCES users(id),request_key uuid NOT NULL,
 action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,actor_id,request_key)
);
CREATE TABLE job_cost_settings_events (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),actor_id uuid NOT NULL REFERENCES users(id),
 settings jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION job_cost_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Cost evidence is immutable; record a replacement revision'; END $$;
CREATE TRIGGER job_cost_policy_guard BEFORE UPDATE OR DELETE ON job_cost_policies FOR EACH ROW EXECUTE FUNCTION job_cost_immutable();
CREATE TRIGGER job_cost_entry_guard BEFORE UPDATE OR DELETE ON job_cost_entries FOR EACH ROW EXECUTE FUNCTION job_cost_immutable();
CREATE TRIGGER job_cost_request_guard BEFORE UPDATE OR DELETE ON job_cost_requests FOR EACH ROW EXECUTE FUNCTION job_cost_immutable();
CREATE TRIGGER job_cost_settings_guard BEFORE UPDATE OR DELETE ON job_cost_settings_events FOR EACH ROW EXECUTE FUNCTION job_cost_immutable();

CREATE FUNCTION job_cost_source(j jobs,category text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE category
 WHEN 'labor' THEN jsonb_build_object('minutes',j.on_site_time_minutes,'technician_id',j.technician_id)
 WHEN 'travel' THEN jsonb_build_object('minutes',j.drive_time_minutes,'technician_id',j.technician_id)
 WHEN 'materials' THEN jsonb_build_object('applications',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'quantity',l.quantity_used::text,'unit',l.unit,'item_id',l.inventory_item_id) ORDER BY l.id) FROM chemical_application_logs l WHERE l.job_id=j.id),'[]'),
 'callback_material', (SELECT v.material_cost::text FROM callback_visits v JOIN service_callbacks c ON c.id=v.callback_id AND c.tenant_id=j.tenant_id AND c.customer_id=j.customer_id AND c.property_id=j.property_id WHERE v.job_id=j.id AND v.tenant_id=j.tenant_id))
 ELSE '{}'::jsonb END
$$;

CREATE FUNCTION job_cost_view(j jobs,detail boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE AS $$
 WITH latest AS (SELECT DISTINCT ON(category) * FROM job_cost_entries WHERE job_id=j.id AND tenant_id=j.tenant_id ORDER BY category,revision DESC),
 categories AS (SELECT name,e.id,e.revision,e.status,e.amount,e.currency,e.service_date,e.source,e.reason,e.source_reference,e.policy_id,e.contract_id,
 e.source_snapshot IS DISTINCT FROM job_cost_source(j,name) AND e.id IS NOT NULL AS stale
 FROM unnest(ARRAY['labor','travel','materials','subcontractor','other']) name LEFT JOIN latest e ON e.category=name)
 SELECT jsonb_build_object('id',j.id,'contract_id',j.contract_id,'job_status',j.status,'scheduled_start',j.scheduled_start,
 'customer_name',(SELECT cu.name FROM customers cu JOIN users u ON u.id=cu.user_id AND u.tenant_id=j.tenant_id WHERE cu.id=j.customer_id),
 'property_address',(SELECT p.address FROM properties p WHERE p.id=j.property_id AND p.customer_id=j.customer_id),
 'currency',(SELECT profitability_currency FROM tenants WHERE id=j.tenant_id),'revenue_state','not_reconciled','contribution',NULL,'margin',NULL,
 'cost_complete',(SELECT bool_and(id IS NOT NULL AND status IN ('actual','zero') AND NOT stale) FROM categories),
 'known_cost',(SELECT COALESCE(sum(amount) FILTER(WHERE status IN ('actual','zero') AND NOT stale),0)::numeric(20,2)::text FROM categories),
 'estimated_cost',(SELECT COALESCE(sum(amount) FILTER(WHERE status='estimated' AND NOT stale),0)::numeric(20,2)::text FROM categories),
 'categories',(SELECT jsonb_agg(jsonb_build_object('category',name,'revision',COALESCE(revision,0),'status',COALESCE(status,'missing'),'amount',amount::text,'stale',stale,'service_date',service_date,'source',source,'source_reference',source_reference,'reason',reason,'policy_id',policy_id,'contract_id',contract_id) ORDER BY name) FROM categories),
 'history',CASE WHEN detail THEN COALESCE((SELECT jsonb_agg(to_jsonb(e)-'amount'||jsonb_build_object('amount',e.amount::text) ORDER BY e.created_at,e.id) FROM job_cost_entries e WHERE e.job_id=j.id AND e.tenant_id=j.tenant_id),'[]') ELSE '[]'::jsonb END,
 'sources',CASE WHEN detail THEN jsonb_build_object('labor',job_cost_source(j,'labor'),'travel',job_cost_source(j,'travel'),'materials',job_cost_source(j,'materials'),
 'callback', (SELECT jsonb_build_object('visit_id',v.id,'labor_rate_snapshot',v.labor_rate_snapshot::text,'material_cost',v.material_cost::text,'currency_verified',false) FROM callback_visits v JOIN service_callbacks c ON c.id=v.callback_id AND c.tenant_id=j.tenant_id AND c.customer_id=j.customer_id AND c.property_id=j.property_id WHERE v.job_id=j.id AND v.tenant_id=j.tenant_id)) ELSE '{}'::jsonb END)
$$;

CREATE FUNCTION profitability_api(action text,tenant uuid,actor uuid,body jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE role_name text;t tenants;j jobs;prior job_cost_entries;entry job_cost_entries;policy job_cost_policies;replay job_cost_requests;
 category_name text;status_name text;source_name text;service_day date;amount_value numeric;reference_text text;reason_text text;minutes integer;
 limit_value integer;offset_value integer;items jsonb;answer jsonb;current_revision integer;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>100000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Object required'; END IF;
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 IF role_name NOT IN ('SUPER_ADMIN','MANAGER') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager access required'; END IF;
 SELECT * INTO t FROM tenants WHERE id=tenant FOR UPDATE;
 IF action IN ('settings','settings_read') THEN
  IF action='settings' THEN
   IF body ? 'enabled' AND jsonb_typeof(body->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Boolean required'; END IF;
   IF body ? 'currency' AND (jsonb_typeof(body->'currency') IS DISTINCT FROM 'string' OR body->>'currency' !~ '^[A-Z]{3}$') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Three-letter reporting currency required'; END IF;
   IF body ? 'timezone' AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=body->>'timezone') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='IANA timezone required'; END IF;
   IF body ? 'currency' AND t.profitability_currency IS DISTINCT FROM body->>'currency' AND (EXISTS(SELECT 1 FROM job_cost_entries WHERE tenant_id=tenant) OR EXISTS(SELECT 1 FROM job_cost_policies WHERE tenant_id=tenant)) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Reporting currency cannot change after cost evidence exists'; END IF;
   UPDATE tenants SET profitability_enabled=COALESCE((body->>'enabled')::boolean,profitability_enabled),profitability_currency=COALESCE(body->>'currency',profitability_currency),profitability_timezone=COALESCE(body->>'timezone',profitability_timezone) WHERE id=tenant RETURNING * INTO t;
   IF t.profitability_enabled AND (t.profitability_currency IS NULL OR t.profitability_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM job_cost_policies WHERE tenant_id=tenant)) THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Configure currency, timezone and a labor policy before enabling'; END IF;
   INSERT INTO job_cost_settings_events(tenant_id,actor_id,settings) VALUES(tenant,actor,jsonb_build_object('enabled',t.profitability_enabled,'currency',t.profitability_currency,'timezone',t.profitability_timezone));
  END IF;
  RETURN jsonb_build_object('enabled',t.profitability_enabled,'currency',t.profitability_currency,'timezone',t.profitability_timezone,'role',role_name,
   'policies',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'hourly_rate'||jsonb_build_object('hourly_rate',p.hourly_rate::text) ORDER BY p.effective_from,p.revision) FROM job_cost_policies p WHERE p.tenant_id=tenant),'[]'));
 END IF;
 IF action IN ('policy','record') THEN
  IF action='record' AND NOT t.profitability_enabled THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='Cost review disabled'; END IF;
  IF body->>'request_key' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Request key required'; END IF;
  SELECT * INTO replay FROM job_cost_requests WHERE tenant_id=tenant AND actor_id=actor AND request_key=(body->>'request_key')::uuid;
  IF FOUND THEN IF replay.payload<>body OR replay.action<>action THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Request key reused'; END IF;RETURN replay.result; END IF;
  reason_text:=trim(body->>'reason');IF COALESCE(length(reason_text),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Evidence or correction reason required'; END IF;
 END IF;
 IF action='policy' THEN
  IF t.profitability_currency IS NULL OR t.profitability_timezone IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Configure currency and timezone first'; END IF;
  IF jsonb_typeof(body->'hourly_rate') IS DISTINCT FROM 'string' OR body->>'hourly_rate' !~ '^\d{1,10}(\.\d{1,2})?$' OR jsonb_typeof(body->'effective_from') IS DISTINCT FROM 'string' OR body->>'effective_from' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Decimal rate string and effective date required'; END IF;
  INSERT INTO job_cost_policies(tenant_id,effective_from,revision,hourly_rate,currency,reason,actor_id) VALUES(tenant,(body->>'effective_from')::date,COALESCE((SELECT max(p.revision) FROM job_cost_policies p WHERE p.tenant_id=tenant AND p.effective_from=(body->>'effective_from')::date),0)+1,(body->>'hourly_rate')::numeric,t.profitability_currency,reason_text,actor) RETURNING * INTO policy;
  answer:=to_jsonb(policy)-'hourly_rate'||jsonb_build_object('hourly_rate',policy.hourly_rate::text);
  INSERT INTO job_cost_requests(tenant_id,actor_id,request_key,action,payload,result) VALUES(tenant,actor,(body->>'request_key')::uuid,action,body,answer);RETURN answer;
 END IF;
 IF NOT t.profitability_enabled THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='Cost review disabled'; END IF;
 IF action='list' THEN
  limit_value:=COALESCE((body->>'limit')::integer,25);offset_value:=COALESCE((body->>'offset')::integer,0);
  IF limit_value NOT BETWEEN 1 AND 100 OR offset_value NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid pagination'; END IF;
  SELECT COALESCE(jsonb_agg(value),'[]') INTO items FROM (SELECT job_cost_view(jj) value FROM jobs jj
   JOIN customers cu ON cu.id=jj.customer_id JOIN users u ON u.id=cu.user_id AND u.tenant_id=tenant JOIN properties p ON p.id=jj.property_id AND p.customer_id=cu.id
   WHERE jj.tenant_id=tenant
   AND (jj.technician_id IS NULL OR EXISTS(SELECT 1 FROM technicians te JOIN users tu ON tu.id=te.user_id AND tu.tenant_id=tenant WHERE te.id=jj.technician_id))
   AND NOT EXISTS(SELECT 1 FROM chemical_application_logs l JOIN inventory_items i ON i.id=l.inventory_item_id WHERE l.job_id=jj.id AND i.tenant_id<>tenant)
   AND (jj.contract_id IS NULL OR EXISTS(SELECT 1 FROM service_contracts c WHERE c.id=jj.contract_id AND c.tenant_id=tenant AND c.customer_id=jj.customer_id AND c.property_id=jj.property_id))
   AND (body->>'contract_id' IS NULL OR jj.contract_id=(body->>'contract_id')::uuid) AND (body->>'property_id' IS NULL OR jj.property_id=(body->>'property_id')::uuid)
   AND (NOT body ?| ARRAY['from','through'] OR EXISTS(SELECT 1 FROM job_cost_entries e WHERE e.job_id=jj.id AND e.revision=(SELECT max(newer.revision) FROM job_cost_entries newer WHERE newer.job_id=e.job_id AND newer.category=e.category) AND (body->>'from' IS NULL OR e.service_date>=(body->>'from')::date) AND (body->>'through' IS NULL OR e.service_date<=(body->>'through')::date)))
   AND (body->>'complete' IS NULL OR (job_cost_view(jj)->>'cost_complete')::boolean=(body->>'complete')::boolean)
   ORDER BY jj.created_at DESC,jj.id LIMIT limit_value+1 OFFSET offset_value) q;
  RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>limit_value THEN items-limit_value ELSE items END,'has_more',jsonb_array_length(items)>limit_value);
 END IF;
 IF action NOT IN ('get','record') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown profitability action'; END IF;
 SELECT * INTO j FROM jobs WHERE id=(body->>'id')::uuid AND tenant_id=tenant FOR UPDATE;
 IF NOT FOUND OR j.technician_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM technicians te JOIN users u ON u.id=te.user_id AND u.tenant_id=tenant WHERE te.id=j.technician_id) OR EXISTS(SELECT 1 FROM chemical_application_logs l JOIN inventory_items i ON i.id=l.inventory_item_id WHERE l.job_id=j.id AND i.tenant_id<>tenant) OR NOT EXISTS(SELECT 1 FROM customers cu JOIN users u ON u.id=cu.user_id AND u.tenant_id=tenant JOIN properties p ON p.customer_id=cu.id WHERE cu.id=j.customer_id AND p.id=j.property_id)
 OR j.contract_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM service_contracts c WHERE c.id=j.contract_id AND c.tenant_id=tenant AND c.customer_id=j.customer_id AND c.property_id=j.property_id)
 THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Job not found'; END IF;
 IF action='get' THEN RETURN job_cost_view(j,true); END IF;
 category_name:=body->>'category';status_name:=body->>'status';source_name:=body->>'source';reference_text:=trim(body->>'source_reference');
 IF NOT COALESCE(category_name IN ('labor','travel','materials','subcontractor','other'),false) OR NOT COALESCE(status_name IN ('actual','zero','estimated','unknown'),false) OR NOT COALESCE(source_name IN ('manual','recorded_time'),false)
 OR COALESCE(length(reference_text),0) NOT BETWEEN 1 AND 1000 OR jsonb_typeof(body->'service_date') IS DISTINCT FROM 'string' OR body->>'service_date' !~ '^\d{4}-\d{2}-\d{2}$' OR body->>'revision' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Category, status, source, service date, reference and current revision required'; END IF;
 service_day:=(body->>'service_date')::date;
 IF status_name IN ('actual','zero') AND service_day>(now() AT TIME ZONE t.profitability_timezone)::date THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Future service cost must be estimated'; END IF;
 SELECT * INTO prior FROM job_cost_entries WHERE job_id=j.id AND category=category_name ORDER BY revision DESC LIMIT 1;
 current_revision:=COALESCE(prior.revision,0);
 IF (body->>'revision')::integer<>current_revision THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Cost evidence changed; reload before correcting'; END IF;
 IF source_name='recorded_time' THEN
  IF category_name NOT IN ('labor','travel') OR status_name<>'estimated' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Recorded time is a provisional labor or travel estimate'; END IF;
  minutes:=CASE category_name WHEN 'labor' THEN j.on_site_time_minutes ELSE j.drive_time_minutes END;
  IF minutes IS NULL OR minutes NOT BETWEEN 0 AND 1440 THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Missing or invalid recorded minutes'; END IF;
  SELECT * INTO policy FROM job_cost_policies WHERE tenant_id=tenant AND effective_from<=service_day ORDER BY effective_from DESC,revision DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='No historical labor policy covers this service date'; END IF;
  amount_value:=round(policy.hourly_rate*minutes/60,2);
 ELSE
  IF status_name='unknown' THEN
   IF body->>'amount' IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown amount must be null'; END IF;amount_value:=NULL;
  ELSE
   IF jsonb_typeof(body->'amount') IS DISTINCT FROM 'string' OR body->>'amount' !~ '^\d{1,12}(\.\d{1,2})?$' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Nonnegative decimal amount string required'; END IF;
   amount_value:=(body->>'amount')::numeric;
   IF status_name='zero' AND amount_value<>0 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Confirmed zero must be zero'; END IF;
  END IF;
 END IF;
 INSERT INTO job_cost_entries(tenant_id,job_id,contract_id,category,revision,supersedes_id,status,amount,currency,service_date,source,source_reference,source_snapshot,policy_id,reason,actor_id)
 VALUES(tenant,j.id,j.contract_id,category_name,current_revision+1,prior.id,status_name,amount_value,t.profitability_currency,service_day,source_name,reference_text,job_cost_source(j,category_name),policy.id,reason_text,actor) RETURNING * INTO entry;
 answer:=job_cost_view(j,true);
 INSERT INTO job_cost_requests(tenant_id,actor_id,request_key,action,payload,result) VALUES(tenant,actor,(body->>'request_key')::uuid,action,body,answer);RETURN answer;
END $$;
CREATE FUNCTION job_cost_entry_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM jobs j WHERE j.id=NEW.job_id AND j.tenant_id=NEW.tenant_id AND j.contract_id IS NOT DISTINCT FROM NEW.contract_id)
 OR NOT EXISTS(SELECT 1 FROM users u WHERE u.id=NEW.actor_id AND u.tenant_id=NEW.tenant_id AND u.role::text IN ('MANAGER','SUPER_ADMIN'))
 OR NOT EXISTS(SELECT 1 FROM tenants t WHERE t.id=NEW.tenant_id AND t.profitability_currency=NEW.currency)
 OR NEW.policy_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM job_cost_policies p WHERE p.id=NEW.policy_id AND p.tenant_id=NEW.tenant_id AND p.currency=NEW.currency)
 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid cost evidence relationship'; END IF;
 IF NEW.revision=1 AND NEW.supersedes_id IS NOT NULL OR NEW.revision>1 AND NOT EXISTS(SELECT 1 FROM job_cost_entries prior WHERE prior.id=NEW.supersedes_id AND prior.tenant_id=NEW.tenant_id AND prior.job_id=NEW.job_id AND prior.category=NEW.category AND prior.revision=NEW.revision-1) THEN
  RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Invalid cost correction chain';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER job_cost_entry_insert_guard BEFORE INSERT ON job_cost_entries FOR EACH ROW EXECUTE FUNCTION job_cost_entry_insert_guard();
COMMIT;
