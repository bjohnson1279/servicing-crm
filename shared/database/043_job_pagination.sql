-- Public job reads use bounded keyset pages. Internal dispatch commands retain
-- their existing job_api list semantics; pagination cannot truncate a schedule.
CREATE INDEX IF NOT EXISTS jobs_tenant_page ON jobs(tenant_id,(coalesce(scheduled_start,'infinity'::timestamptz)),id);
CREATE OR REPLACE FUNCTION job_page(action text,tenant uuid,actor uuid,body jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql AS $page$
DECLARE role_name text;tech uuid;customer uuid;page_limit integer:=50;cursor_value jsonb;
 cursor_date timestamptz;cursor_id uuid;from_date timestamptz;through_date timestamptz;
 include_unscheduled boolean:=false;active_only boolean:=false;statuses text[];
 items jsonb;more boolean;next_cursor text;
BEGIN
 IF action NOT IN ('list','calendar') OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>10000 THEN
  RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid job page request';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(body) k WHERE k NOT IN ('limit','cursor','from','through','status','active_only','include_unscheduled','customer_id','technician_id','property_id','tenant_id')) THEN
  RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unsupported job page filter';
 END IF;
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 IF role_name NOT IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','TECHNICIAN','CUSTOMER') THEN
  RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Job access denied';
 END IF;
 SELECT id INTO tech FROM technicians WHERE user_id=actor;
 SELECT id INTO customer FROM customers WHERE user_id=actor;
 IF body ? 'limit' THEN
  IF coalesce(body->>'limit','') !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Page limit must be 1 to 200'; END IF;
  page_limit:=(body->>'limit')::integer;
  IF page_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Page limit must be 1 to 200'; END IF;
 END IF;
 IF body ? 'active_only' THEN
  IF coalesce(body->>'active_only','') NOT IN ('true','false') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Boolean required'; END IF;
  active_only:=(body->>'active_only')::boolean;
 END IF;
 IF body ? 'include_unscheduled' THEN
  IF coalesce(body->>'include_unscheduled','') NOT IN ('true','false') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Boolean required'; END IF;
  include_unscheduled:=(body->>'include_unscheduled')::boolean;
 END IF;
 IF body ? 'status' THEN
  statuses:=string_to_array(lower(body->>'status'),',');
  IF statuses IS NULL OR cardinality(statuses)=0 OR EXISTS(SELECT 1 FROM unnest(statuses) s WHERE s NOT IN ('draft','scheduled','in_progress','completed','invoiced','cancelled')) THEN
   RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid job status';
  END IF;
 END IF;
 IF (body ? 'from') IS DISTINCT FROM (body ? 'through') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Both date bounds are required'; END IF;
 IF body ? 'from' THEN
  BEGIN
   from_date:=(body->>'from')::timestamptz;through_date:=(body->>'through')::timestamptz;
   IF from_date IS NULL OR through_date IS NULL OR NOT isfinite(from_date) OR NOT isfinite(through_date) OR from_date>=through_date OR through_date-from_date>interval '62 days' THEN RAISE EXCEPTION 'Invalid range'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Choose a valid date range of at most 62 days'; END;
 ELSIF action='calendar' THEN
  from_date:=date_trunc('month',now())-interval '7 days';through_date:=from_date+interval '49 days';
 END IF;
 IF coalesce(body->>'cursor','')<>'' THEN
  BEGIN
   IF length(body->>'cursor')>1024 OR body->>'cursor' !~ '^[A-Za-z0-9_-]+$' THEN RAISE EXCEPTION 'Invalid cursor'; END IF;
   cursor_value:=convert_from(decode(translate(body->>'cursor','-_','+/')||repeat('=',(4-length(body->>'cursor')%4)%4),'base64'),'UTF8')::jsonb;
   IF jsonb_typeof(cursor_value) IS DISTINCT FROM 'object' OR jsonb_typeof(cursor_value->'id') IS DISTINCT FROM 'string' OR NOT cursor_value ? 'scheduled_start' OR jsonb_typeof(cursor_value->'scheduled_start') NOT IN ('string','null') THEN RAISE EXCEPTION 'Invalid cursor'; END IF;
   cursor_id:=(cursor_value->>'id')::uuid;cursor_date:=(cursor_value->>'scheduled_start')::timestamptz;
   IF cursor_date IS NOT NULL AND NOT isfinite(cursor_date) THEN RAISE EXCEPTION 'Invalid cursor'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid page cursor'; END;
 END IF;
 WITH page AS MATERIALIZED (
  SELECT x.* FROM jobs x WHERE x.tenant_id=tenant
   AND (role_name NOT IN ('TECHNICIAN','CUSTOMER') OR role_name='TECHNICIAN' AND x.technician_id=tech OR role_name='CUSTOMER' AND x.customer_id=customer)
   AND (NOT body ? 'customer_id' OR x.customer_id=(body->>'customer_id')::uuid)
   AND (NOT body ? 'technician_id' OR x.technician_id=(body->>'technician_id')::uuid)
   AND (NOT body ? 'property_id' OR x.property_id=(body->>'property_id')::uuid)
   AND (statuses IS NULL OR x.status::text=ANY(statuses))
   AND (NOT active_only OR x.status::text IN ('draft','scheduled','in_progress'))
   AND (action<>'calendar' OR x.scheduled_start IS NOT NULL)
   AND (from_date IS NULL OR x.scheduled_start IS NULL AND include_unscheduled OR x.scheduled_start<through_date AND coalesce(x.scheduled_end,x.scheduled_start+interval '1 hour')>from_date)
   AND (cursor_id IS NULL OR (coalesce(x.scheduled_start,'infinity'::timestamptz),x.id)>(coalesce(cursor_date,'infinity'::timestamptz),cursor_id))
  ORDER BY coalesce(x.scheduled_start,'infinity'::timestamptz),x.id LIMIT page_limit+1
 ), shown AS MATERIALIZED (
  SELECT * FROM page ORDER BY coalesce(scheduled_start,'infinity'::timestamptz),id LIMIT page_limit
 )
 SELECT coalesce(jsonb_agg(CASE WHEN action='calendar' THEN
   jsonb_build_object('id',x.id,'title',CASE WHEN x.purpose='return_visit' THEN 'Return visit: ' ELSE '' END||c.name||' - '||p.address,
    'start',x.scheduled_start,'end',coalesce(x.scheduled_end,x.scheduled_start+interval '1 hour'),'status',x.status,
    'color',CASE x.status::text WHEN 'completed' THEN '#10b981' WHEN 'invoiced' THEN '#10b981' WHEN 'in_progress' THEN '#f59e0b' WHEN 'cancelled' THEN '#ef4444' ELSE '#3b82f6' END)
   ELSE (to_jsonb(x)-'customer_signature')||jsonb_build_object('customer',jsonb_build_object('id',c.id,'name',c.name,'user_id',c.user_id),'property',to_jsonb(p)) END
   ORDER BY coalesce(x.scheduled_start,'infinity'::timestamptz),x.id),'[]'),
  (SELECT count(*)>page_limit FROM page),
  (SELECT rtrim(translate(replace(encode(convert_to(jsonb_build_object('scheduled_start',s.scheduled_start,'id',s.id)::text,'UTF8'),'base64'),E'\n',''),'+/','-_'),'=') FROM shown s ORDER BY coalesce(s.scheduled_start,'infinity'::timestamptz) DESC,s.id DESC LIMIT 1)
 INTO items,more,next_cursor FROM shown x JOIN customers c ON c.id=x.customer_id JOIN properties p ON p.id=x.property_id;
 RETURN jsonb_build_object('items',items,'has_more',more,'next_cursor',CASE WHEN more THEN next_cursor END,'limit',page_limit);
END $page$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servicing_crm_runtime') THEN
  GRANT EXECUTE ON FUNCTION job_page(text,uuid,uuid,jsonb) TO servicing_crm_runtime;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servicing_crm_worker') THEN
  GRANT EXECUTE ON FUNCTION job_page(text,uuid,uuid,jsonb) TO servicing_crm_worker;
 END IF;
END $$;
