ALTER TABLE tenants ADD COLUMN devices_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE property_devices (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id uuid NOT NULL REFERENCES tenants(id),property_id uuid NOT NULL REFERENCES properties(id),customer_id uuid NOT NULL REFERENCES customers(id),
 label varchar(80) NOT NULL,device_type varchar(24) NOT NULL CHECK(device_type IN ('bait_station','trap','monitor')),
 manufacturer_serial varchar(160),equipment_item_id uuid REFERENCES inventory_items(id),
 lifecycle varchar(16) NOT NULL DEFAULT 'planned' CHECK(lifecycle IN ('planned','installed','retired')),
 location_version integer NOT NULL DEFAULT 1,version integer NOT NULL DEFAULT 1,
 installed_at timestamptz,retired_at timestamptz,historical_installation boolean NOT NULL DEFAULT false,
 replaces_device_id uuid UNIQUE REFERENCES property_devices(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,label),UNIQUE(tenant_id,id)
);
CREATE INDEX devices_property_register ON property_devices(tenant_id,property_id,lifecycle,id);
CREATE TABLE device_locations (
 device_id uuid NOT NULL REFERENCES property_devices(id),version integer NOT NULL,zone varchar(120) NOT NULL,description text NOT NULL,
 latitude numeric(10,7),longitude numeric(10,7),accuracy_meters numeric(10,2),actor_id uuid NOT NULL REFERENCES users(id),reason text NOT NULL,effective_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(device_id,version),CHECK((latitude IS NULL)=(longitude IS NULL)),CHECK(latitude BETWEEN -90 AND 90),CHECK(longitude BETWEEN -180 AND 180),CHECK(accuracy_meters>0)
);
CREATE TABLE device_events (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),device_id uuid NOT NULL REFERENCES property_devices(id),actor_id uuid NOT NULL REFERENCES users(id),action varchar(24) NOT NULL,
 reason text NOT NULL,job_id uuid REFERENCES jobs(id),details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE device_requests (
 tenant_id uuid NOT NULL REFERENCES tenants(id),actor_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,request_key uuid NOT NULL,device_id uuid NOT NULL REFERENCES property_devices(id),payload jsonb NOT NULL,
 PRIMARY KEY(tenant_id,actor_id,action,request_key)
);
CREATE INDEX device_event_history_index ON device_events(device_id,created_at,id);
CREATE FUNCTION device_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Device history is immutable'; END $$;
CREATE TRIGGER device_location_history BEFORE UPDATE OR DELETE ON device_locations FOR EACH ROW EXECUTE FUNCTION device_history_guard();
CREATE TRIGGER device_event_history BEFORE UPDATE OR DELETE ON device_events FOR EACH ROW EXECUTE FUNCTION device_history_guard();
CREATE FUNCTION device_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.tenant_id,NEW.property_id,NEW.customer_id,NEW.label,NEW.device_type,NEW.replaces_device_id) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.property_id,OLD.customer_id,OLD.label,OLD.device_type,OLD.replaces_device_id) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Device identity is permanent'; END IF;
 IF OLD.lifecycle='retired' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Retired devices are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER device_identity_guard BEFORE UPDATE ON property_devices FOR EACH ROW EXECUTE FUNCTION device_identity_guard();
CREATE FUNCTION device_view(d property_devices) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(d)||jsonb_build_object('property_address',(SELECT address FROM properties WHERE id=d.property_id),
 'locations',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.version) FROM device_locations l WHERE l.device_id=d.id),'[]'),
 'events',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM device_events e WHERE e.device_id=d.id),'[]'),
 'replacement_device_id',(SELECT id FROM property_devices WHERE replaces_device_id=d.id))
$$;
CREATE FUNCTION device_api(action text,tenant uuid,actor uuid,body jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE role_name text;staff boolean;manager boolean;tech uuid;job_record jobs;d property_devices;old_device property_devices;replay device_requests;property uuid;customer uuid;item uuid;
 device_label text;kind text;reason_text text;zone_text text;description_text text;lat numeric;lng numeric;accuracy numeric;items jsonb;page_limit int;page_offset int;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Object required'; END IF;
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 staff:=role_name IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR');manager:=role_name IN ('SUPER_ADMIN','MANAGER');
 IF NOT staff AND role_name<>'TECHNICIAN' THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff or assigned technician required'; END IF;
 SELECT id INTO tech FROM technicians WHERE user_id=actor;
 IF action='settings' THEN
  IF body ? 'enabled' THEN
   IF NOT manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager required'; END IF;
   IF jsonb_typeof(body->'enabled')<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Boolean required'; END IF;
   UPDATE tenants SET devices_enabled=(body->>'enabled')::boolean WHERE id=tenant;
   INSERT INTO audit_logs(tenant_id,actor_id,actor_role,action,entity_type,entity_id,new_values) VALUES(tenant,actor,role_name,'device_settings','tenant',tenant,body);
  END IF;
  RETURN jsonb_build_object('enabled',(SELECT devices_enabled FROM tenants WHERE id=tenant),'role',role_name);
 END IF;
 IF NOT (SELECT devices_enabled FROM tenants WHERE id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='Device tracking is not enabled'; END IF;
 -- A device ID/label is never a technician authorization credential.
 IF NOT staff THEN
  SELECT * INTO job_record FROM jobs WHERE id=(body->>'job_id')::uuid AND tenant_id=tenant AND technician_id=tech AND status::text IN ('scheduled','in_progress') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Assigned active job required'; END IF;
  IF action NOT IN ('list','get','lookup') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff device management required'; END IF;
 END IF;
 IF action='options' THEN
  RETURN jsonb_build_object('properties',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'address',p.address,'customer_name',c.name)) FROM properties p JOIN customers c ON c.id=p.customer_id JOIN users u ON u.id=c.user_id WHERE u.tenant_id=tenant),'[]'),
   'equipment',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'sku',sku)) FROM inventory_items WHERE tenant_id=tenant),'[]'),
   'jobs',COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(job_api('list',tenant,actor)) WHERE value->>'status' IN ('scheduled','in_progress')),'[]'));
 END IF;
 IF action='list' THEN
  page_limit:=least(50,greatest(1,COALESCE((body->>'limit')::int,25)));page_offset:=least(100000,greatest(0,COALESCE((body->>'offset')::int,0)));
  SELECT COALESCE(jsonb_agg(value ORDER BY label,id),'[]') INTO items FROM (
   SELECT device_view(x) value,x.label,x.id FROM property_devices x WHERE x.tenant_id=tenant AND (staff OR x.property_id=job_record.property_id AND x.customer_id=job_record.customer_id)
   AND (body->>'property_id' IS NULL OR x.property_id=(body->>'property_id')::uuid) AND (body->>'lifecycle' IS NULL OR x.lifecycle=body->>'lifecycle')
   ORDER BY x.label,x.id LIMIT page_limit+1 OFFSET page_offset) q;
  RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>page_limit THEN items-page_limit ELSE items END,'has_more',jsonb_array_length(items)>page_limit);
 END IF;
 IF action IN ('create','replace') THEN
  IF NOT staff THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff registration required'; END IF;
 ELSE
  SELECT * INTO d FROM property_devices WHERE tenant_id=tenant AND (CASE WHEN action='lookup' THEN label=upper(trim(body->>'label')) ELSE id=(body->>'id')::uuid END) FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE((staff OR d.property_id=job_record.property_id AND d.customer_id=job_record.customer_id),false) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Device not found'; END IF;
  IF action IN ('get','lookup') THEN RETURN device_view(d); END IF;
 END IF;
 IF action NOT IN ('create','install','relocate','retire','replace') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown device action'; END IF;
 IF action='replace' THEN
  SELECT * INTO old_device FROM property_devices WHERE id=(body->>'id')::uuid AND tenant_id=tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Device not found'; END IF;
 END IF;
 IF body->>'request_key' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Retry key required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tenant::text||actor::text||action||(body->>'request_key'),0));
 SELECT * INTO replay FROM device_requests WHERE tenant_id=tenant AND actor_id=actor AND device_requests.action=device_api.action AND request_key=(body->>'request_key')::uuid;
 IF FOUND THEN
  IF replay.payload<>body THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Retry key used with different data'; END IF;
  SELECT * INTO d FROM property_devices WHERE id=replay.device_id;RETURN device_view(d);
 END IF;
 reason_text:=trim(body->>'reason');
 IF COALESCE(length(reason_text),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Reason required'; END IF;
 IF action IN ('create','replace','relocate') THEN
  zone_text:=trim(body->>'zone');description_text:=trim(body->>'description');
  lat:=(body->>'latitude')::numeric;lng:=(body->>'longitude')::numeric;accuracy:=(body->>'accuracy_meters')::numeric;
  IF COALESCE(length(zone_text),0) NOT BETWEEN 1 AND 120 OR COALESCE(length(description_text),0) NOT BETWEEN 1 AND 4000 OR (lat IS NULL)<>(lng IS NULL) OR lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 OR accuracy<=0 OR accuracy::text IN ('NaN','Infinity','-Infinity') OR accuracy IS NOT NULL AND lat IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Zone, location description and valid optional coordinates required'; END IF;
 END IF;
 IF action IN ('create','replace') THEN
  property:=CASE WHEN action='replace' THEN old_device.property_id ELSE (body->>'property_id')::uuid END;
  SELECT c.id INTO customer FROM properties p JOIN customers c ON c.id=p.customer_id JOIN users u ON u.id=c.user_id WHERE p.id=property AND u.tenant_id=tenant;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Property not found'; END IF;
  device_label:=upper(trim(body->>'label'));kind:=COALESCE(body->>'device_type',old_device.device_type);item:=(body->>'equipment_item_id')::uuid;
  IF COALESCE(length(device_label),0) NOT BETWEEN 1 AND 80 OR device_label !~ '^[A-Z0-9][A-Z0-9._-]*$' OR NOT COALESCE(kind IN ('bait_station','trap','monitor'),false) OR length(body->>'manufacturer_serial')>160 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Valid permanent label and device type required'; END IF;
  IF item IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory_items WHERE id=item AND tenant_id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Equipment item not found'; END IF;
  IF action='replace' THEN
   IF old_device.lifecycle<>'installed' OR (body->>'version')::int IS DISTINCT FROM old_device.version THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Installed current device required'; END IF;
   UPDATE property_devices SET lifecycle='retired',retired_at=now(),version=version+1,updated_at=now() WHERE id=old_device.id;
  END IF;
  INSERT INTO property_devices(tenant_id,property_id,customer_id,label,device_type,manufacturer_serial,equipment_item_id,replaces_device_id) VALUES(tenant,property,customer,device_label,kind,body->>'manufacturer_serial',item,CASE WHEN action='replace' THEN old_device.id ELSE NULL END) RETURNING * INTO d;
  INSERT INTO device_locations(device_id,version,zone,description,latitude,longitude,accuracy_meters,actor_id,reason) VALUES(d.id,1,zone_text,description_text,lat,lng,accuracy,actor,reason_text);
  IF action='replace' THEN INSERT INTO device_events(device_id,actor_id,action,reason,details) VALUES(old_device.id,actor,'replaced',reason_text,jsonb_build_object('replacement_device_id',d.id));END IF;
 ELSE
  IF (body->>'version')::int IS DISTINCT FROM d.version OR d.lifecycle='retired' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Device changed or retired; reload'; END IF;
  IF action='install' THEN
   IF d.lifecycle<>'planned' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Planned device required'; END IF;
   IF body ? 'historical_installation' AND jsonb_typeof(body->'historical_installation')<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Historical installation must be explicit'; END IF;
   IF (body->>'installed_at')::timestamptz>now() OR body->>'installed_at' IS NOT NULL AND body->'historical_installation' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Only historical installations may specify a past installation date'; END IF;
   IF body->>'job_id' IS NOT NULL THEN
    SELECT * INTO job_record FROM jobs WHERE id=(body->>'job_id')::uuid AND tenant_id=tenant AND property_id=d.property_id AND customer_id=d.customer_id AND status::text IN ('scheduled','in_progress') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Active property job required'; END IF;
   ELSIF body->'historical_installation' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Select an active job or explicitly record a historical installation'; END IF;
   UPDATE property_devices SET lifecycle='installed',installed_at=CASE WHEN body->'historical_installation'='true'::jsonb THEN (body->>'installed_at')::timestamptz ELSE now() END,historical_installation=COALESCE((body->>'historical_installation')::boolean,false),version=version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  ELSIF action='relocate' THEN
   IF d.lifecycle<>'installed' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Installed device required'; END IF;
   INSERT INTO device_locations(device_id,version,zone,description,latitude,longitude,accuracy_meters,actor_id,reason) VALUES(d.id,d.location_version+1,zone_text,description_text,lat,lng,accuracy,actor,reason_text);
   UPDATE property_devices SET location_version=location_version+1,version=version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  ELSE UPDATE property_devices SET lifecycle='retired',retired_at=now(),version=version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  END IF;
 END IF;
 INSERT INTO device_events(device_id,actor_id,action,reason,job_id,details) VALUES(d.id,actor,action,reason_text,CASE WHEN action='install' THEN job_record.id ELSE NULL END,jsonb_build_object('lifecycle',d.lifecycle,'location_version',d.location_version,'version',d.version));
 INSERT INTO device_requests(tenant_id,actor_id,action,request_key,device_id,payload) VALUES(tenant,actor,action,(body->>'request_key')::uuid,d.id,body);
 RETURN device_view(d);
END $$;
