-- Wave 14: Canonical Job Customer Signature Capture ('record_signature', 'get_signature')
CREATE TABLE IF NOT EXISTS job_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  captured_by UUID NOT NULL REFERENCES users(id),
  signature_data_url TEXT NOT NULL CHECK (signature_data_url LIKE 'data:image/%' AND length(signature_data_url) <= 2000000),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_signatures_tenant_job ON job_signatures(tenant_id, job_id);

ALTER TABLE job_signatures ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_signatures' AND policyname = 'tenant_isolation_job_signatures'
  ) THEN
    CREATE POLICY tenant_isolation_job_signatures ON job_signatures
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$
DECLARE
  fn_sql text;
BEGIN
  SELECT replace(
    replace(
      pg_get_functiondef('job_api(text,uuid,uuid,jsonb)'::regprocedure),
      'FUNCTION public.job_api(',
      'FUNCTION public.job_api_slice1('
    ),
    'job_api.action',
    'job_api_slice1.action'
  ) INTO fn_sql;
  EXECUTE fn_sql;
END $$;

CREATE OR REPLACE FUNCTION job_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  staff boolean;
  tech uuid;
  j jobs;
  sig job_signatures;
  data_url text;
  cap_at timestamptz;
BEGIN
  IF action NOT IN ('record_signature', 'get_signature') THEN
    RETURN job_api_slice1(action, tenant, actor, body);
  END IF;

  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text) > 2500000 THEN
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

  IF NOT (body ? 'id') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Job id required';
  END IF;

  SELECT * INTO j FROM jobs WHERE id = (body->>'id')::uuid AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Job not found';
  END IF;

  IF role_name = 'TECHNICIAN' THEN
    SELECT id INTO tech FROM technicians WHERE user_id = actor;
    IF tech IS NULL OR j.technician_id IS DISTINCT FROM tech THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Job not assigned to technician';
    END IF;
  END IF;

  IF action = 'get_signature' THEN
    SELECT * INTO sig FROM job_signatures WHERE tenant_id = tenant AND job_id = j.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Signature not found';
    END IF;
    RETURN jsonb_build_object(
      'id', sig.id,
      'job_id', sig.job_id,
      'captured_by', sig.captured_by,
      'signature_data_url', sig.signature_data_url,
      'captured_at', sig.captured_at
    );
  END IF;

  data_url := btrim(COALESCE(body->>'signature_data_url', body->>'signatureDataUrl', ''));
  IF data_url NOT LIKE 'data:image/%' OR length(data_url) > 2000000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Valid data:image/ signature_data_url required';
  END IF;

  cap_at := COALESCE(NULLIF(COALESCE(body->>'captured_at', body->>'capturedAt'), '')::timestamptz, now());

  INSERT INTO job_signatures (tenant_id, job_id, captured_by, signature_data_url, captured_at, updated_at)
  VALUES (tenant, j.id, actor, data_url, cap_at, now())
  ON CONFLICT (tenant_id, job_id)
  DO UPDATE SET
    captured_by = EXCLUDED.captured_by,
    signature_data_url = EXCLUDED.signature_data_url,
    captured_at = EXCLUDED.captured_at,
    updated_at = now()
  RETURNING * INTO sig;

  INSERT INTO audit_logs(tenant_id, actor_id, actor_role, action, entity_type, entity_id, new_values)
  VALUES (
    tenant,
    actor,
    role_name,
    'job_signature_captured',
    'job',
    j.id,
    jsonb_build_object('signature_id', sig.id, 'captured_at', sig.captured_at)
  );

  RETURN jsonb_build_object(
    'id', sig.id,
    'job_id', sig.job_id,
    'captured_by', sig.captured_by,
    'signature_data_url', sig.signature_data_url,
    'captured_at', sig.captured_at
  );
END $$;
