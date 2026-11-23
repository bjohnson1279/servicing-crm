-- Wave 4: Enterprise Slice 2 Enhancements for Inspections, Devices, and Product Catalog
-- 1. Inspection & Treatment Capture Slice 2: Treatment Proposal Generation ('propose_treatment')
-- 2. Property Device Tracking Slice 2: Field Device Service & Activity Logging ('record_service')
-- 3. Verified Product Catalog Slice 2: Catalog Verification & Compliance Summary ('compliance_summary')

DO $$
DECLARE
  fn_sql text;
BEGIN
  SELECT replace(replace(pg_get_functiondef('inspection_api(text,uuid,uuid,jsonb)'::regprocedure), 'FUNCTION public.inspection_api(', 'FUNCTION public.inspection_api_slice1('), 'inspection_api.action', 'inspection_api_slice1.action') INTO fn_sql;
  EXECUTE fn_sql;

  SELECT replace(replace(pg_get_functiondef('device_api(text,uuid,uuid,jsonb)'::regprocedure), 'FUNCTION public.device_api(', 'FUNCTION public.device_api_slice1('), 'device_api.action', 'device_api_slice1.action') INTO fn_sql;
  EXECUTE fn_sql;

  SELECT replace(replace(pg_get_functiondef('catalog_api(text,uuid,uuid,jsonb)'::regprocedure), 'FUNCTION public.catalog_api(', 'FUNCTION public.catalog_api_slice1('), 'catalog_api.action', 'catalog_api_slice1.action') INTO fn_sql;
  EXECUTE fn_sql;
END $$;

CREATE OR REPLACE FUNCTION inspection_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  enabled boolean;
  i inspections;
  recommended_service text;
  estimated_amount numeric(12, 2);
  notes_text text;
BEGIN
  IF action <> 'propose_treatment' THEN
    RETURN inspection_api_slice1(action, tenant, actor, body);
  END IF;

  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Object required';
  END IF;

  SELECT role::text INTO role_name FROM users WHERE id = actor AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0401', MESSAGE = 'Invalid identity';
  END IF;
  IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER', 'DISPATCHER', 'CUSTOMER_SERVICE_REP', 'CSR') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Office staff required to generate treatment proposals';
  END IF;

  SELECT inspections_enabled INTO enabled FROM tenants WHERE id = tenant FOR SHARE;
  IF NOT enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0503', MESSAGE = 'Inspections are not enabled';
  END IF;

  recommended_service := btrim(COALESCE(body->>'recommended_service', ''));
  notes_text := btrim(COALESCE(body->>'notes', ''));
  IF NOT (body ? 'id') OR length(recommended_service) NOT BETWEEN 1 AND 200 OR length(notes_text) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Inspection id, recommended_service, and notes are required';
  END IF;

  IF body ? 'estimated_amount' THEN
    BEGIN
      estimated_amount := (body->>'estimated_amount')::numeric(12, 2);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Invalid estimated_amount';
    END;
    IF estimated_amount < 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'estimated_amount must be nonnegative';
    END IF;
  ELSE
    estimated_amount := 0.00;
  END IF;

  SELECT * INTO i FROM inspections WHERE id = (body->>'id')::uuid AND tenant_id = tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Inspection not found';
  END IF;
  IF i.state <> 'reviewed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Only reviewed inspections can generate treatment proposals';
  END IF;

  INSERT INTO inspection_events(inspection_id, actor_id, action, revision, reason)
  VALUES (
    i.id,
    actor,
    'propose_treatment',
    i.revision,
    recommended_service || ' ($' || estimated_amount::text || '): ' || notes_text
  );

  RETURN inspection_view(i) || jsonb_build_object(
    'proposal', jsonb_build_object(
      'recommended_service', recommended_service,
      'estimated_amount', estimated_amount::text,
      'notes', notes_text,
      'proposed_by', actor
    )
  );
END $$;


CREATE OR REPLACE FUNCTION device_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  staff boolean;
  tech uuid;
  enabled boolean;
  d property_devices;
  j jobs;
  activity_level text;
  bait_pct int;
  action_taken text;
  reason_text text;
BEGIN
  IF action <> 'record_service' THEN
    RETURN device_api_slice1(action, tenant, actor, body);
  END IF;

  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Object required';
  END IF;

  SELECT role::text INTO role_name FROM users WHERE id = actor AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0401', MESSAGE = 'Invalid identity';
  END IF;

  staff := role_name IN ('SUPER_ADMIN', 'MANAGER', 'DISPATCHER', 'CUSTOMER_SERVICE_REP', 'CSR');
  IF NOT staff AND role_name <> 'TECHNICIAN' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Staff or assigned technician required';
  END IF;
  SELECT id INTO tech FROM technicians WHERE user_id = actor;

  SELECT devices_enabled INTO enabled FROM tenants WHERE id = tenant FOR SHARE;
  IF NOT enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0503', MESSAGE = 'Device tracking is not enabled';
  END IF;

  activity_level := btrim(COALESCE(body->>'activity_level', ''));
  action_taken := btrim(COALESCE(body->>'action_taken', ''));
  reason_text := btrim(COALESCE(body->>'reason', action_taken));
  bait_pct := COALESCE((body->>'bait_consumed_pct')::int, 0);

  IF NOT (body ? 'id') OR activity_level NOT IN ('none', 'low', 'moderate', 'high') OR bait_pct NOT BETWEEN 0 AND 100 OR length(action_taken) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Device id, activity_level (none/low/moderate/high), bait_consumed_pct (0..100), and action_taken required';
  END IF;

  SELECT * INTO d FROM property_devices WHERE id = (body->>'id')::uuid AND tenant_id = tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Device not found';
  END IF;

  IF role_name = 'TECHNICIAN' THEN
    IF NOT (body ? 'job_id') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Assigned active job required';
    END IF;
    SELECT * INTO j FROM jobs
    WHERE id = (body->>'job_id')::uuid
      AND tenant_id = tenant
      AND property_id = d.property_id
      AND technician_id = tech
      AND status::text NOT IN ('completed', 'cancelled');
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Device not found for assigned job';
    END IF;
  ELSIF body ? 'job_id' AND body->>'job_id' IS NOT NULL THEN
    SELECT * INTO j FROM jobs WHERE id = (body->>'job_id')::uuid AND tenant_id = tenant AND property_id = d.property_id;
  END IF;

  IF d.lifecycle <> 'installed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Only installed devices can record field service visits';
  END IF;

  INSERT INTO device_events(device_id, actor_id, action, reason, job_id, details)
  VALUES (
    d.id,
    actor,
    'serviced',
    reason_text,
    j.id,
    jsonb_build_object(
      'activity_level', activity_level,
      'bait_consumed_pct', bait_pct,
      'action_taken', action_taken
    )
  );

  RETURN device_view(d);
END $$;


CREATE OR REPLACE FUNCTION catalog_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  enabled boolean;
BEGIN
  IF action <> 'compliance_summary' THEN
    RETURN catalog_api_slice1(action, tenant, actor, body);
  END IF;

  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Object required';
  END IF;

  SELECT role::text INTO role_name FROM users WHERE id = actor AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0401', MESSAGE = 'Invalid identity';
  END IF;
  IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER', 'DISPATCHER', 'CUSTOMER_SERVICE_REP', 'CSR') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Staff access required for catalog compliance summary';
  END IF;

  SELECT catalog_enabled INTO enabled FROM tenants WHERE id = tenant FOR SHARE;
  IF NOT enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0503', MESSAGE = 'Product catalog is not enabled';
  END IF;

  RETURN jsonb_build_object(
    'total_products', (SELECT COUNT(*)::int FROM catalog_products p WHERE p.tenant_id = tenant),
    'active_verified_count', (
      SELECT COUNT(*)::int
      FROM catalog_versions v
      JOIN catalog_products p ON p.id = v.product_id
      WHERE p.tenant_id = tenant AND v.status = 'active' AND (v.review_due_at IS NULL OR v.review_due_at > now())
    ),
    'in_review_count', (
      SELECT COUNT(*)::int
      FROM catalog_versions v
      JOIN catalog_products p ON p.id = v.product_id
      WHERE p.tenant_id = tenant AND v.status = 'in_review'
    ),
    'draft_count', (
      SELECT COUNT(*)::int
      FROM catalog_versions v
      JOIN catalog_products p ON p.id = v.product_id
      WHERE p.tenant_id = tenant AND v.status = 'draft'
    ),
    'expired_review_count', (
      SELECT COUNT(*)::int
      FROM catalog_versions v
      JOIN catalog_products p ON p.id = v.product_id
      WHERE p.tenant_id = tenant AND v.status = 'active' AND v.review_due_at <= now()
    )
  );
END $$;
