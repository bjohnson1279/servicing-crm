ALTER TABLE tenants ADD COLUMN recurring_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN recurring_timezone text;
ALTER TABLE tenants ADD COLUMN recurring_horizon integer NOT NULL DEFAULT 30 CHECK(recurring_horizon BETWEEN 1 AND 90);
ALTER TABLE tenants ADD COLUMN recurring_lookback integer NOT NULL DEFAULT 90 CHECK(recurring_lookback BETWEEN 1 AND 366);
CREATE TABLE recurring_schedule_revisions (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),contract_id uuid NOT NULL REFERENCES service_contracts(id),
 fingerprint text NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(contract_id,fingerprint)
);
CREATE TABLE recurring_occurrences (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),contract_id uuid NOT NULL REFERENCES service_contracts(id),
 revision_id uuid NOT NULL REFERENCES recurring_schedule_revisions(id),ordinal integer NOT NULL,nominal_date date NOT NULL,timezone text NOT NULL,
 observed_job_id uuid REFERENCES jobs(id),match_state text NOT NULL,evidence jsonb NOT NULL,assessed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(revision_id,ordinal)
);
CREATE TABLE recurring_assessments (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),actor_id uuid NOT NULL REFERENCES users(id),
 request_key uuid NOT NULL,payload jsonb NOT NULL,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,actor_id,request_key)
);
CREATE TABLE recurring_exceptions (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),contract_id uuid NOT NULL REFERENCES service_contracts(id),
 occurrence_id uuid REFERENCES recurring_occurrences(id),reason text NOT NULL,state text NOT NULL CHECK(state IN ('open','resolved')),
 evidence jsonb NOT NULL,first_detected_at timestamptz NOT NULL DEFAULT now(),last_detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX recurring_exception_occurrence ON recurring_exceptions(occurrence_id,reason) WHERE occurrence_id IS NOT NULL;
CREATE UNIQUE INDEX recurring_exception_contract ON recurring_exceptions(contract_id,reason) WHERE occurrence_id IS NULL;
CREATE INDEX recurring_queue ON recurring_exceptions(tenant_id,state,last_detected_at,id);
CREATE TABLE recurring_exception_events (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),exception_id uuid NOT NULL REFERENCES recurring_exceptions(id),assessment_id uuid NOT NULL REFERENCES recurring_assessments(id),
 state text NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION recurring_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Recurring evidence history is immutable'; END $$;
CREATE TRIGGER recurring_revision_guard BEFORE UPDATE OR DELETE ON recurring_schedule_revisions FOR EACH ROW EXECUTE FUNCTION recurring_immutable();
CREATE TRIGGER recurring_event_guard BEFORE UPDATE OR DELETE ON recurring_exception_events FOR EACH ROW EXECUTE FUNCTION recurring_immutable();

CREATE FUNCTION recurring_date(anchor date,cadence text,ordinal integer) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE months integer;first_day date;last_day date;
BEGIN
 months:=CASE cadence WHEN 'MONTHLY' THEN 1 WHEN 'BI_MONTHLY' THEN 2 WHEN 'QUARTERLY' THEN 3 WHEN 'SEMI_ANNUALLY' THEN 6 WHEN 'ANNUALLY' THEN 12 END;
 IF months IS NULL OR ordinal<0 OR ordinal>120000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid recurrence'; END IF;
 first_day:=(date_trunc('month',anchor::timestamp)+make_interval(months=>months*ordinal))::date;
 last_day:=(first_day+interval '1 month - 1 day')::date;
 RETURN first_day+least(extract(day FROM anchor)::integer,extract(day FROM last_day)::integer)-1;
END $$;

CREATE FUNCTION recurring_record(t uuid,c uuid,o uuid,reason_code text,active boolean,details jsonb,run uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE e recurring_exceptions;new_state text;
BEGIN
 SELECT * INTO e FROM recurring_exceptions WHERE tenant_id=t AND contract_id=c AND occurrence_id IS NOT DISTINCT FROM o AND reason=reason_code FOR UPDATE;
 new_state:=CASE WHEN active THEN 'open' ELSE 'resolved' END;
 IF NOT FOUND AND NOT COALESCE(active,false) THEN RETURN; END IF;
 IF e.id IS NULL THEN
  INSERT INTO recurring_exceptions(tenant_id,contract_id,occurrence_id,reason,state,evidence) VALUES(t,c,o,reason_code,new_state,details) RETURNING * INTO e;
  INSERT INTO recurring_exception_events(exception_id,assessment_id,state,evidence) VALUES(e.id,run,new_state,details);
 ELSE
  IF e.state IS DISTINCT FROM new_state OR e.evidence IS DISTINCT FROM details THEN
   INSERT INTO recurring_exception_events(exception_id,assessment_id,state,evidence) VALUES(e.id,run,new_state,details);
  END IF;
  UPDATE recurring_exceptions SET state=new_state,evidence=details,last_detected_at=now() WHERE id=e.id;
 END IF;
END $$;

CREATE FUNCTION recurring_context(t uuid,c uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE((SELECT jsonb_build_object('customer_name',cu.name,'property_address',p.address,'cadence',sc.cadence)
 FROM service_contracts sc JOIN customers cu ON cu.id=sc.customer_id JOIN users u ON u.id=cu.user_id AND u.tenant_id=t
 JOIN properties p ON p.id=sc.property_id AND p.customer_id=cu.id WHERE sc.id=c AND sc.tenant_id=t),'{}'::jsonb)
$$;

CREATE FUNCTION recurring_api(action text,tenant uuid,actor uuid,body jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE role_name text;t tenants;c service_contracts;rev recurring_schedule_revisions;o recurring_occurrences;
 run recurring_assessments;signature text;snapshot jsonb;local_today date;low_date date;high_date date;nominal date;n integer;step integer;
 matches jsonb;j jobs;count_matches integer;details jsonb;invalid boolean;processed integer:=0;cursor_id uuid;
 page_limit integer;page_offset integer;items jsonb;answer jsonb;old_exception recurring_exceptions;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>100000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Object required'; END IF;
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 IF role_name NOT IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff required'; END IF;
 SELECT * INTO t FROM tenants WHERE id=tenant FOR UPDATE;
 IF action IN ('settings','settings_read') THEN
  IF action='settings' AND body ?| ARRAY['enabled','timezone','horizon','lookback'] THEN
   IF role_name NOT IN ('SUPER_ADMIN','MANAGER') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager required'; END IF;
   IF body ? 'enabled' AND jsonb_typeof(body->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Boolean required'; END IF;
   IF body ? 'timezone' AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=body->>'timezone') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Explicit IANA timezone required'; END IF;
   IF body ? 'horizon' AND (body->>'horizon')::integer NOT BETWEEN 1 AND 90 OR body ? 'lookback' AND (body->>'lookback')::integer NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid assessment window'; END IF;
   UPDATE tenants SET recurring_enabled=COALESCE((body->>'enabled')::boolean,recurring_enabled),recurring_timezone=COALESCE(body->>'timezone',recurring_timezone),
    recurring_horizon=COALESCE((body->>'horizon')::integer,recurring_horizon),recurring_lookback=COALESCE((body->>'lookback')::integer,recurring_lookback) WHERE id=tenant RETURNING * INTO t;
   IF t.recurring_enabled AND t.recurring_timezone IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Configure timezone before enabling'; END IF;
  END IF;
  RETURN jsonb_build_object('enabled',t.recurring_enabled,'timezone',t.recurring_timezone,'horizon',t.recurring_horizon,'lookback',t.recurring_lookback,'role',role_name);
 END IF;
 IF NOT t.recurring_enabled THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='Recurring assessment disabled'; END IF;
 IF action='assess' THEN
  IF role_name NOT IN ('SUPER_ADMIN','MANAGER') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager required for shadow assessment'; END IF;
  IF body->>'request_key' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Request key required'; END IF;
  SELECT * INTO run FROM recurring_assessments WHERE tenant_id=tenant AND actor_id=actor AND request_key=(body->>'request_key')::uuid;
  IF FOUND THEN
   IF run.payload<>body THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Request key reused'; END IF;RETURN run.result;
  END IF;
  INSERT INTO recurring_assessments(tenant_id,actor_id,request_key,payload) VALUES(tenant,actor,(body->>'request_key')::uuid,body) RETURNING * INTO run;
  local_today:=(now() AT TIME ZONE t.recurring_timezone)::date;low_date:=local_today-t.recurring_lookback;high_date:=local_today+t.recurring_horizon;
  FOR c IN SELECT * FROM service_contracts WHERE tenant_id=tenant AND cadence<>'ONE_TIME' AND (body->>'after' IS NULL OR id>(body->>'after')::uuid) ORDER BY id LIMIT 100 FOR SHARE LOOP
   processed:=processed+1;cursor_id:=c.id;
   BEGIN
   invalid:=c.end_date<c.start_date OR NOT EXISTS(SELECT 1 FROM customers cu JOIN users u ON u.id=cu.user_id JOIN properties p ON p.customer_id=cu.id WHERE cu.id=c.customer_id AND p.id=c.property_id AND u.tenant_id=tenant);
   invalid:=COALESCE(invalid,false);
   details:=jsonb_build_object('contract_status',c.status,'start_date',c.start_date,'end_date',c.end_date);
   PERFORM recurring_record(tenant,c.id,NULL,'invalid_schedule',invalid,details,run.id);
   IF invalid THEN CONTINUE; END IF;
   snapshot:=jsonb_build_object('cadence',c.cadence,'start_date',c.start_date,'end_date',c.end_date,'customer_id',c.customer_id,'property_id',c.property_id,'timezone',t.recurring_timezone);
   signature:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
   INSERT INTO recurring_schedule_revisions(tenant_id,contract_id,fingerprint,snapshot) VALUES(tenant,c.id,signature,snapshot) ON CONFLICT(contract_id,fingerprint) DO NOTHING;
   SELECT * INTO rev FROM recurring_schedule_revisions WHERE contract_id=c.id AND fingerprint=signature;
   -- Retire obsolete preview alerts while retaining evidence. No fulfillment is inferred.
   FOR old_exception IN SELECT e.* FROM recurring_exceptions e JOIN recurring_occurrences occ ON occ.id=e.occurrence_id WHERE e.tenant_id=tenant AND e.contract_id=c.id AND occ.revision_id<>rev.id AND e.state='open' LOOP
    PERFORM recurring_record(tenant,c.id,old_exception.occurrence_id,old_exception.reason,false,old_exception.evidence||jsonb_build_object('superseded_preview',true),run.id);
   END LOOP;
   FOR old_exception IN SELECT e.* FROM recurring_exceptions e JOIN recurring_occurrences occ ON occ.id=e.occurrence_id WHERE e.tenant_id=tenant AND e.contract_id=c.id AND occ.revision_id=rev.id AND (occ.nominal_date<low_date OR occ.nominal_date>high_date) AND e.state='open' LOOP
    PERFORM recurring_record(tenant,c.id,old_exception.occurrence_id,old_exception.reason,false,old_exception.evidence||jsonb_build_object('outside_review_window',true),run.id);
   END LOOP;
   step:=CASE c.cadence WHEN 'MONTHLY' THEN 1 WHEN 'BI_MONTHLY' THEN 2 WHEN 'QUARTERLY' THEN 3 WHEN 'SEMI_ANNUALLY' THEN 6 ELSE 12 END;
   n:=greatest(0,((extract(year FROM low_date)::int-extract(year FROM c.start_date)::int)*12+extract(month FROM low_date)::int-extract(month FROM c.start_date)::int)/step-1);
   LOOP
    nominal:=recurring_date(c.start_date,c.cadence::text,n);
    EXIT WHEN nominal>high_date OR (c.end_date IS NOT NULL AND nominal>c.end_date);
    IF nominal>=low_date THEN
     INSERT INTO recurring_occurrences(tenant_id,contract_id,revision_id,ordinal,nominal_date,timezone,match_state,evidence) VALUES(tenant,c.id,rev.id,n,nominal,t.recurring_timezone,'missing','{}') ON CONFLICT(revision_id,ordinal) DO NOTHING;
     SELECT * INTO o FROM recurring_occurrences WHERE revision_id=rev.id AND ordinal=n;
     SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'status',status,'scheduled_start',scheduled_start,'technician_id',technician_id) ORDER BY id),'[]') INTO matches FROM jobs
      WHERE tenant_id=tenant AND contract_id=c.id AND customer_id=c.customer_id AND property_id=c.property_id AND (scheduled_start AT TIME ZONE t.recurring_timezone)::date=nominal;
     count_matches:=jsonb_array_length(matches);j:=NULL;
     IF count_matches=1 THEN SELECT * INTO j FROM jobs WHERE id=(matches->0->>'id')::uuid; END IF;
     details:=jsonb_build_object('nominal_date',nominal,'timezone',t.recurring_timezone,'matches',matches,'contract_status',c.status,'preview',true);
     UPDATE recurring_occurrences SET observed_job_id=j.id,match_state=CASE WHEN count_matches=0 THEN 'missing' WHEN count_matches=1 THEN 'candidate' ELSE 'ambiguous' END,evidence=details,assessed_at=now() WHERE id=o.id;
     PERFORM recurring_record(tenant,c.id,o.id,'ambiguous_match',count_matches>1,details,run.id);
     PERFORM recurring_record(tenant,c.id,o.id,'missing_job',c.status='active' AND count_matches=0,details,run.id);
     PERFORM recurring_record(tenant,c.id,o.id,'overdue_service',c.status='active' AND nominal<local_today AND count_matches<=1 AND (j.id IS NULL OR j.status NOT IN ('completed','invoiced')),details,run.id);
     PERFORM recurring_record(tenant,c.id,o.id,'cancelled_visit',c.status='active' AND count_matches=1 AND j.status='cancelled',details,run.id);
     PERFORM recurring_record(tenant,c.id,o.id,'unassigned_visit',c.status='active' AND count_matches=1 AND j.status='scheduled' AND j.technician_id IS NULL AND (j.scheduled_start AT TIME ZONE t.recurring_timezone)::date<=local_today,details,run.id);
    END IF;
    n:=n+1;
   END LOOP;
   PERFORM recurring_record(tenant,c.id,NULL,'assessment_failure',false,'{}',run.id);
   EXCEPTION WHEN OTHERS THEN
    PERFORM recurring_record(tenant,c.id,NULL,'assessment_failure',true,jsonb_build_object('sqlstate',SQLSTATE,'message','Contract assessment failed; inspect configuration before retrying'),run.id);
   END;
  END LOOP;
  answer:=jsonb_build_object('processed_contracts',processed,'after',cursor_id,'has_more',EXISTS(SELECT 1 FROM service_contracts WHERE tenant_id=tenant AND cadence<>'ONE_TIME' AND id>cursor_id),'from',low_date,'through',high_date,'mode','shadow');
  UPDATE recurring_assessments SET result=answer WHERE id=run.id;RETURN answer;
 END IF;
 IF action='get' THEN
  SELECT to_jsonb(e)||jsonb_build_object('context',recurring_context(tenant,e.contract_id),'occurrence',to_jsonb(occ),'events',COALESCE((SELECT jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at,ev.id) FROM recurring_exception_events ev WHERE ev.exception_id=e.id),'[]')) INTO answer
   FROM recurring_exceptions e LEFT JOIN recurring_occurrences occ ON occ.id=e.occurrence_id WHERE e.tenant_id=tenant AND e.id=(body->>'id')::uuid;
  IF answer IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Exception not found'; END IF;RETURN answer;
 END IF;
 IF action='list' THEN
  page_limit:=COALESCE((body->>'limit')::integer,25);page_offset:=COALESCE((body->>'offset')::integer,0);
  IF page_limit NOT BETWEEN 1 AND 100 OR page_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid pagination'; END IF;
  SELECT COALESCE(jsonb_agg(row),'[]') INTO items FROM (SELECT to_jsonb(e)||jsonb_build_object('context',recurring_context(tenant,e.contract_id),'occurrence',to_jsonb(occ)) AS row FROM recurring_exceptions e LEFT JOIN recurring_occurrences occ ON occ.id=e.occurrence_id
   WHERE e.tenant_id=tenant AND e.state=COALESCE(body->>'state','open') AND (body->>'reason' IS NULL OR e.reason=body->>'reason') AND (body->>'contract_id' IS NULL OR e.contract_id=(body->>'contract_id')::uuid)
   AND (body->>'property_id' IS NULL OR EXISTS(SELECT 1 FROM recurring_schedule_revisions sr WHERE sr.id=occ.revision_id AND sr.snapshot->>'property_id'=body->>'property_id'))
   AND (body->>'from' IS NULL OR occ.nominal_date>=(body->>'from')::date) AND (body->>'through' IS NULL OR occ.nominal_date<=(body->>'through')::date)
   ORDER BY e.last_detected_at DESC,e.id LIMIT page_limit+1 OFFSET page_offset) q;
  RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>page_limit THEN items-page_limit ELSE items END,'has_more',jsonb_array_length(items)>page_limit);
 END IF;
 RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown recurring action';
END $$;

CREATE FUNCTION recurring_occurrence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Occurrence history must be retained'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.contract_id,NEW.revision_id,NEW.ordinal,NEW.nominal_date,NEW.timezone) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.contract_id,OLD.revision_id,OLD.ordinal,OLD.nominal_date,OLD.timezone) THEN
  RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Occurrence identity is immutable';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER recurring_occurrence_guard BEFORE UPDATE OR DELETE ON recurring_occurrences FOR EACH ROW EXECUTE FUNCTION recurring_occurrence_guard();
