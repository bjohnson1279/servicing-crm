-- Wave 6: Property Service Playbook Slice 2 (Property Template Assignments, Template Retirement, and Job Completion Gate)

CREATE TABLE IF NOT EXISTS property_playbook_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  service_type text NOT NULL DEFAULT 'general',
  checklist_version_id uuid NOT NULL REFERENCES service_checklist_versions(id),
  assigned_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, property_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_property_playbook_assignments_property ON property_playbook_assignments(property_id);
CREATE INDEX IF NOT EXISTS idx_property_playbook_assignments_checklist ON property_playbook_assignments(checklist_version_id);
CREATE INDEX IF NOT EXISTS idx_property_playbook_assignments_assigned_by ON property_playbook_assignments(assigned_by);

ALTER FUNCTION playbook_api(text, uuid, uuid, jsonb) RENAME TO playbook_api_slice1;

CREATE FUNCTION playbook_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  t tenants;
  tech_id uuid;
  prop properties;
  tpl service_checklist_versions;
  assign_row property_playbook_assignments;
  job_row jobs;
  run_row job_playbook_runs;
  svc_type text;
BEGIN
  IF action NOT IN ('assign_template', 'retire_template', 'completion_check') THEN
    RETURN playbook_api_slice1(action, tenant, actor, body);
  END IF;

  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text) > 200000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Object required';
  END IF;

  SELECT role::text INTO role_name FROM users WHERE id = actor AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0401', MESSAGE = 'Invalid identity';
  END IF;

  IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER', 'DISPATCHER', 'CUSTOMER_SERVICE_REP', 'CSR', 'TECHNICIAN') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Authorized staff or technician required';
  END IF;

  IF role_name = 'TECHNICIAN' THEN
    SELECT id INTO tech_id FROM technicians WHERE user_id = actor;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Technician profile required';
    END IF;
  END IF;

  SELECT * INTO t FROM tenants WHERE id = tenant FOR SHARE;
  IF NOT t.playbooks_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0503', MESSAGE = 'Property service playbooks are not enabled for this tenant';
  END IF;

  IF action = 'assign_template' THEN
    IF role_name = 'TECHNICIAN' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Office staff required to assign property checklist templates';
    END IF;
    IF NOT (body ? 'property_id') OR NOT (body ? 'checklist_version_id') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'property_id and checklist_version_id are required';
    END IF;

    SELECT p.* INTO prop
    FROM properties p
    JOIN customers c ON c.id = p.customer_id
    JOIN users u ON u.id = c.user_id AND u.tenant_id = tenant
    WHERE p.id = (body->>'property_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Property not found';
    END IF;

    SELECT * INTO tpl
    FROM service_checklist_versions
    WHERE id = (body->>'checklist_version_id')::uuid AND tenant_id = tenant AND status = 'published';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Published checklist version not found';
    END IF;

    svc_type := COALESCE(NULLIF(btrim(body->>'service_type'), ''), tpl.service_type, 'general');

    INSERT INTO property_playbook_assignments(
      tenant_id, property_id, service_type, checklist_version_id, assigned_by
    ) VALUES (
      tenant, prop.id, svc_type, tpl.id, actor
    )
    ON CONFLICT (tenant_id, property_id, service_type)
    DO UPDATE SET
      checklist_version_id = EXCLUDED.checklist_version_id,
      assigned_by = EXCLUDED.assigned_by,
      updated_at = now()
    RETURNING * INTO assign_row;

    INSERT INTO playbook_events(tenant_id, property_id, actor_id, action, details)
    VALUES (
      tenant,
      prop.id,
      actor,
      'template_assigned',
      jsonb_build_object('service_type', svc_type, 'checklist_version_id', tpl.id)
    );

    RETURN jsonb_build_object(
      'id', assign_row.id,
      'property_id', assign_row.property_id,
      'service_type', assign_row.service_type,
      'checklist_version_id', assign_row.checklist_version_id
    );
  END IF;

  IF action = 'retire_template' THEN
    IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Manager required to retire checklist templates';
    END IF;
    IF NOT (body ? 'checklist_version_id') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'checklist_version_id required';
    END IF;

    SELECT * INTO tpl
    FROM service_checklist_versions
    WHERE id = (body->>'checklist_version_id')::uuid AND tenant_id = tenant
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Checklist version not found';
    END IF;

    UPDATE service_checklist_versions SET status = 'retired' WHERE id = tpl.id RETURNING * INTO tpl;
    RETURN jsonb_build_object(
      'id', tpl.id,
      'template_key', tpl.template_key,
      'version', tpl.version,
      'status', tpl.status
    );
  END IF;

  IF action = 'completion_check' THEN
    IF NOT (body ? 'job_id') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'job_id required';
    END IF;

    SELECT * INTO job_row FROM jobs WHERE id = (body->>'job_id')::uuid AND tenant_id = tenant FOR SHARE;
    IF NOT FOUND OR (role_name = 'TECHNICIAN' AND job_row.technician_id IS DISTINCT FROM tech_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Assigned job not found';
    END IF;

    SELECT * INTO run_row FROM job_playbook_runs WHERE tenant_id = tenant AND job_id = job_row.id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'job_id', job_row.id,
        'has_playbook', false,
        'can_complete', true,
        'state', NULL,
        'run_id', NULL,
        'blocking_reason', NULL
      );
    END IF;

    RETURN jsonb_build_object(
      'job_id', job_row.id,
      'has_playbook', true,
      'can_complete', run_row.state IN ('submitted', 'reviewed'),
      'state', run_row.state,
      'run_id', run_row.id,
      'blocking_reason', CASE
        WHEN run_row.state = 'pending_ack' THEN 'Acknowledge property service brief and submit checklist before completing job'
        WHEN run_row.state = 'in_progress' THEN 'Submit required playbook checklist tasks before completing job'
        ELSE NULL
      END
    );
  END IF;

  RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Unsupported playbook action';
END $$;
