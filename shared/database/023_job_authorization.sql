-- Called only by adapters that verify the signed actor identity. Invoker rights;
-- ordinary application credentials must not be exposed to clients.
CREATE OR REPLACE FUNCTION job_distance(lat1 double precision,lng1 double precision,lat2 double precision,lng2 double precision) RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$ SELECT 7917.6*asin(sqrt(least(1.0,power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)))) $$;
CREATE OR REPLACE FUNCTION job_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE role_name text; staff boolean; tech uuid; customer uuid; j jobs; target uuid; next_status text; item jsonb; jobs_json jsonb; techs_json jsonb; route_json jsonb; lat double precision; lng double precision; distance double precision;
BEGIN
 IF jsonb_typeof(body)<>'object' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Object required'; END IF;
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 staff := role_name IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR');
 SELECT id INTO tech FROM technicians WHERE user_id=actor;
 SELECT id INTO customer FROM customers WHERE user_id=actor;
 IF NOT staff AND role_name NOT IN ('TECHNICIAN','CUSTOMER') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Job access denied'; END IF;
 IF action IN ('auto_schedule','commit_schedule','optimize','emergency') THEN
  IF NOT staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff dispatch required'; END IF;
  IF action='commit_schedule' THEN
   IF jsonb_typeof(body->'schedule') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'schedule')>1000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Schedule array required'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(body->'schedule') ORDER BY value->>'jobId' LOOP
    IF item->>'technicianId' IS NOT NULL THEN
     PERFORM job_api('update',tenant,actor,jsonb_build_object('id',item->>'jobId','technician_id',item->>'technicianId','status','scheduled'));
    END IF;
   END LOOP;
   RETURN jsonb_build_object('success',true);
  END IF;
  jobs_json:=job_api('list',tenant,actor,'{}');
  IF action='optimize' THEN
   IF jsonb_typeof(body->'job_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Job IDs required'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'job_ids') ids WHERE NOT EXISTS(SELECT 1 FROM jobs WHERE id=ids::uuid AND tenant_id=tenant)) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Job not found'; END IF;
   SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]') INTO jobs_json FROM jsonb_array_elements_text(body->'job_ids') WITH ORDINALITY ids(id,ord) JOIN jsonb_array_elements(jobs_json) ON value->>'id'=ids.id;
   IF body->>'start_lat' IS NULL OR body->>'start_lng' IS NULL THEN RETURN jobs_json; END IF;
   lat:=(body->>'start_lat')::double precision; lng:=(body->>'start_lng')::double precision; route_json:='[]';
   WHILE jsonb_array_length(jobs_json)>0 LOOP
    SELECT value INTO item FROM jsonb_array_elements(jobs_json) ORDER BY job_distance(lat,lng,34.0522+length(value->>'property_id')*0.01,-118.2437-length(value->>'property_id')*0.01),value->>'id' LIMIT 1;
    route_json:=route_json||jsonb_build_array(item);
    lat:=34.0522+length(item->>'property_id')*0.01; lng:=-118.2437-length(item->>'property_id')*0.01;
    SELECT COALESCE(jsonb_agg(value),'[]') INTO jobs_json FROM jsonb_array_elements(jobs_json) WHERE value->>'id'<>item->>'id';
   END LOOP;
   RETURN route_json;
  END IF;
  techs_json:=job_api('technicians',tenant,actor,'{}');
  IF action='auto_schedule' THEN
   SELECT COALESCE(jsonb_agg(value),'[]') INTO techs_json FROM jsonb_array_elements(techs_json) WHERE value->>'status'='available';
   SELECT COALESCE(jsonb_agg(jsonb_build_object('jobId',value->>'id','technicianId',CASE WHEN jsonb_array_length(techs_json)>0 THEN techs_json->((ord-1)%jsonb_array_length(techs_json))::int->>'id' ELSE NULL END,'estimatedDriveTimeMins',15)),'[]') INTO jobs_json
    FROM jsonb_array_elements(jobs_json) WITH ORDINALITY items(value,ord) WHERE value->>'status'='draft' AND value->>'technician_id' IS NULL;
   RETURN jobs_json;
  END IF;
  SELECT * INTO j FROM jobs WHERE id=(body->>'job_id')::uuid AND property_id=(body->>'property_id')::uuid AND tenant_id=tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Job or property not found'; END IF;
  -- Preserve the existing MVP geocoder until real coordinates are available.
  SELECT (value->>'id')::uuid,job_distance((value->>'lat')::double precision,(value->>'lng')::double precision,34.0522+length(j.property_id::text)*0.01,-118.2437-length(j.property_id::text)*0.01) INTO target,distance FROM jsonb_array_elements(techs_json)
   WHERE value->>'status'='available' AND value->>'lat' IS NOT NULL AND value->>'lng' IS NOT NULL
   ORDER BY job_distance((value->>'lat')::double precision,(value->>'lng')::double precision,34.0522+length(j.property_id::text)*0.01,-118.2437-length(j.property_id::text)*0.01) LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='No available technicians with coordinates'; END IF;
  jobs_json:=job_api('update',tenant,actor,jsonb_build_object('id',j.id,'technician_id',target,'status','scheduled'));
  RETURN jsonb_build_object('message','Emergency dispatch assigned','job',jobs_json,'job_id',j.id,'technician_id',target,'technician',(SELECT value FROM jsonb_array_elements(techs_json) WHERE value->>'id'=target::text),'distance',distance);
 END IF;
 IF action IN ('technicians','location') THEN
  IF role_name='CUSTOMER' THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Technician access denied'; END IF;
  IF action='location' THEN
   SELECT t.id INTO target FROM technicians t JOIN users u ON u.id=t.user_id WHERE t.id=(body->>'id')::uuid AND u.tenant_id=tenant AND (staff OR t.id=tech) FOR UPDATE OF t;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Technician not found'; END IF;
   IF NOT (body->>'lat')::numeric BETWEEN -90 AND 90 OR NOT (body->>'lng')::numeric BETWEEN -180 AND 180 OR body->>'lat' IS NULL OR body->>'lng' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid coordinates'; END IF;
   UPDATE technicians SET current_location_lat=(body->>'lat')::numeric,current_location_lng=(body->>'lng')::numeric,updated_at=now() WHERE id=target;
   RETURN jsonb_build_object('success',true);
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'user_id',t.user_id,'user',jsonb_build_object('id',u.id,'email',u.email),'skills',t.skills,'status',t.status,'lat',t.current_location_lat,'lng',t.current_location_lng,'current_location_lat',t.current_location_lat,'current_location_lng',t.current_location_lng)) FROM technicians t JOIN users u ON u.id=t.user_id WHERE u.tenant_id=tenant AND (staff OR t.id=tech)),'[]');
 END IF;
 IF action='list' THEN
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('customer',jsonb_build_object('id',c.id,'name',c.name,'user_id',c.user_id),'property',to_jsonb(p)) ORDER BY x.scheduled_start,x.id)
   FROM jobs x JOIN customers c ON c.id=x.customer_id JOIN properties p ON p.id=x.property_id
   WHERE x.tenant_id=tenant AND (staff OR role_name='TECHNICIAN' AND x.technician_id=tech OR role_name='CUSTOMER' AND x.customer_id=customer)
   AND (NOT body ? 'customer_id' OR x.customer_id=(body->>'customer_id')::uuid)
   AND (NOT body ? 'technician_id' OR x.technician_id=(body->>'technician_id')::uuid)
   AND (NOT body ? 'status' OR x.status::text=lower(body->>'status'))),'[]');
 END IF;
 IF action='create' THEN
  IF NOT staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff creation required'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(body) k WHERE k NOT IN ('tenant_id','customer_id','property_id','technician_id','contract_id','scheduled_start','scheduled_end','status')) THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unsupported job fields'; END IF;
  IF body ? 'status' AND body->>'status'<>'draft' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='New jobs must start as draft'; END IF;
  IF body ? 'tenant_id' AND (body->>'tenant_id')::uuid IS DISTINCT FROM tenant THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Tenant identity mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM properties p JOIN customers c ON c.id=p.customer_id JOIN users u ON u.id=c.user_id
   WHERE p.id=(body->>'property_id')::uuid AND c.id=(body->>'customer_id')::uuid AND u.tenant_id=tenant)
   THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Property or customer not found'; END IF;
  IF body->>'contract_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM service_contracts c WHERE c.id=(body->>'contract_id')::uuid AND c.tenant_id=tenant AND c.customer_id=(body->>'customer_id')::uuid AND c.property_id=(body->>'property_id')::uuid)
   THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Contract not found'; END IF;
  target := (body->>'technician_id')::uuid;
  IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM technicians t JOIN users u ON u.id=t.user_id WHERE t.id=target AND u.tenant_id=tenant AND u.role::text='TECHNICIAN') THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Technician not found'; END IF;
  INSERT INTO jobs(tenant_id,customer_id,property_id,technician_id,contract_id,status,scheduled_start,scheduled_end)
   VALUES(tenant,(body->>'customer_id')::uuid,(body->>'property_id')::uuid,target,(body->>'contract_id')::uuid,'draft',(body->>'scheduled_start')::timestamptz,(body->>'scheduled_end')::timestamptz) RETURNING * INTO j;
 ELSIF action IN ('update','clock_in','clock_out') THEN
  SELECT * INTO j FROM jobs WHERE id=(body->>'id')::uuid AND tenant_id=tenant FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE((staff OR role_name='TECHNICIAN' AND j.technician_id=tech),false) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Job not found'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(body) k WHERE k NOT IN ('id','status','technician_id','lat','lng')) THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unsupported job fields'; END IF;
  IF NOT staff AND body ? 'technician_id' THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff assignment required'; END IF;
  IF action='update' AND body ? 'technician_id' THEN
   target := (body->>'technician_id')::uuid;
   IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM technicians t JOIN users u ON u.id=t.user_id WHERE t.id=target AND u.tenant_id=tenant AND u.role::text='TECHNICIAN') THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Technician not found'; END IF;
   j.technician_id := target;
  END IF;
  next_status := CASE action WHEN 'clock_in' THEN 'in_progress' WHEN 'clock_out' THEN 'completed' ELSE lower(body->>'status') END;
  IF next_status IS NOT NULL AND next_status IS DISTINCT FROM j.status::text THEN
   IF next_status NOT IN ('draft','scheduled','in_progress','completed','invoiced','cancelled') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid status'; END IF;
   IF NOT staff AND NOT (j.status::text='scheduled' AND next_status='in_progress' OR j.status::text='in_progress' AND next_status='completed') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Technician transition denied'; END IF;
   IF action='clock_in' AND j.status::text<>'scheduled' OR action='clock_out' AND (j.status::text<>'in_progress' OR j.actual_arrival IS NULL) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Invalid clock transition'; END IF;
   IF next_status='in_progress' THEN j.actual_arrival:=now(); END IF;
   IF next_status='completed' THEN
    IF j.actual_arrival IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Clock in before completing'; END IF;
    j.actual_departure:=now(); j.on_site_time_minutes:=greatest(0,floor(extract(epoch FROM now()-j.actual_arrival)/60));
   END IF;
   j.status := next_status::job_status;
  END IF;
  UPDATE jobs SET technician_id=j.technician_id,status=j.status,actual_arrival=j.actual_arrival,actual_departure=j.actual_departure,on_site_time_minutes=j.on_site_time_minutes,updated_at=now() WHERE id=j.id RETURNING * INTO j;
 ELSE RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown job action';
 END IF;
 INSERT INTO audit_logs(tenant_id,actor_id,actor_role,action,entity_type,entity_id,new_values) VALUES(tenant,actor,role_name,'job_'||action,'job',j.id,to_jsonb(j));
 RETURN to_jsonb(j);
END $$;
