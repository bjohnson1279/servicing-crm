ALTER TABLE tenants ADD COLUMN IF NOT EXISTS playbooks_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE property_service_briefs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  access_instructions text NOT NULL DEFAULT '',
  restricted_credentials text,
  service_zones jsonb NOT NULL DEFAULT '[]'::jsonb,
  known_hazards text NOT NULL DEFAULT '',
  pets_notes text NOT NULL DEFAULT '',
  pest_concerns text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, property_id)
);

CREATE INDEX idx_property_service_briefs_property ON property_service_briefs(property_id);
CREATE INDEX idx_property_service_briefs_updated_by ON property_service_briefs(updated_by);

CREATE TABLE service_checklist_versions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  template_key text NOT NULL,
  title text NOT NULL,
  service_type text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'published' CHECK(status IN ('published', 'retired')),
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, template_key, version)
);

CREATE INDEX idx_service_checklist_versions_published_by ON service_checklist_versions(published_by);

CREATE TABLE job_playbook_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  checklist_version_id uuid NOT NULL REFERENCES service_checklist_versions(id),
  technician_id uuid REFERENCES technicians(id),
  state text NOT NULL DEFAULT 'pending_ack' CHECK(state IN ('pending_ack', 'in_progress', 'submitted', 'reviewed')),
  brief_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  acknowledged_at timestamptz,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  exceptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  observations text NOT NULL DEFAULT '',
  follow_up_flagged boolean NOT NULL DEFAULT false,
  review_notes text,
  version integer NOT NULL DEFAULT 1,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, job_id)
);

CREATE INDEX idx_job_playbook_runs_job ON job_playbook_runs(job_id);
CREATE INDEX idx_job_playbook_runs_property ON job_playbook_runs(property_id);
CREATE INDEX idx_job_playbook_runs_checklist ON job_playbook_runs(checklist_version_id);
CREATE INDEX idx_job_playbook_runs_technician ON job_playbook_runs(technician_id);

CREATE TABLE playbook_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  job_run_id uuid REFERENCES job_playbook_runs(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_events_tenant ON playbook_events(tenant_id, created_at DESC);
CREATE INDEX idx_playbook_events_property ON playbook_events(property_id);
CREATE INDEX idx_playbook_events_run ON playbook_events(job_run_id);
CREATE INDEX idx_playbook_events_actor ON playbook_events(actor_id);

CREATE OR REPLACE FUNCTION playbook_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Playbook event history is immutable';
END $$;

CREATE TRIGGER playbook_event_guard
  BEFORE UPDATE OR DELETE ON playbook_events
  FOR EACH ROW EXECUTE FUNCTION playbook_event_immutable();

CREATE OR REPLACE FUNCTION playbook_run_json(r job_playbook_runs) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'tenant_id', r.tenant_id,
    'job_id', r.job_id,
    'property_id', r.property_id,
    'checklist_version_id', r.checklist_version_id,
    'technician_id', r.technician_id,
    'state', r.state,
    'brief_snapshot', r.brief_snapshot,
    'checklist_snapshot', r.checklist_snapshot,
    'acknowledged_at', r.acknowledged_at,
    'responses', r.responses,
    'exceptions', r.exceptions,
    'observations', r.observations,
    'follow_up_flagged', r.follow_up_flagged,
    'review_notes', r.review_notes,
    'version', r.version,
    'submitted_at', r.submitted_at,
    'reviewed_at', r.reviewed_at,
    'property_address', (SELECT p.address FROM properties p WHERE p.id = r.property_id),
    'customer_name', (SELECT c.name FROM properties p JOIN customers c ON c.id = p.customer_id WHERE p.id = r.property_id),
    'checklist_title', (SELECT cv.title FROM service_checklist_versions cv WHERE cv.id = r.checklist_version_id),
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'action', pe.action,
        'actor_id', pe.actor_id,
        'details', pe.details,
        'created_at', pe.created_at
      ) ORDER BY pe.created_at ASC, pe.id ASC)
      FROM playbook_events pe WHERE pe.job_run_id = r.id
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION playbook_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  t tenants;
  tech_id uuid;
  prop properties;
  brief property_service_briefs;
  tpl service_checklist_versions;
  job_row jobs;
  run_row job_playbook_runs;
  next_ver integer;
  task_item jsonb;
  task_id text;
  resp_val text;
  exc_val text;
  items jsonb;
BEGIN
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

  SELECT * INTO t FROM tenants WHERE id = tenant FOR UPDATE;

  IF action = 'settings' THEN
    IF body ? 'enabled' THEN
      IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Manager required';
      END IF;
      IF jsonb_typeof(body->'enabled') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Boolean required';
      END IF;
      UPDATE tenants SET playbooks_enabled = (body->>'enabled')::boolean WHERE id = tenant RETURNING * INTO t;
    END IF;
    RETURN jsonb_build_object('enabled', t.playbooks_enabled, 'role', role_name);
  END IF;

  IF NOT t.playbooks_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0503', MESSAGE = 'Property service playbooks are not enabled for this tenant';
  END IF;

  IF action = 'options' THEN
    IF role_name = 'TECHNICIAN' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Office staff required';
    END IF;
    RETURN jsonb_build_object(
      'properties', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'address', p.address, 'customer_name', c.name) ORDER BY c.name, p.address)
        FROM properties p
        JOIN customers c ON c.id = p.customer_id
        JOIN users u ON u.id = c.user_id AND u.tenant_id = tenant
      ), '[]'::jsonb),
      'templates', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', cv.id, 'template_key', cv.template_key, 'title', cv.title, 'service_type', cv.service_type, 'version', cv.version, 'status', cv.status, 'tasks', cv.tasks) ORDER BY cv.title, cv.version DESC)
        FROM service_checklist_versions cv
        WHERE cv.tenant_id = tenant AND cv.status = 'published'
      ), '[]'::jsonb),
      'jobs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', j.id, 'property_id', j.property_id, 'technician_id', j.technician_id, 'status', j.status::text, 'scheduled_start', j.scheduled_start) ORDER BY j.created_at DESC)
        FROM jobs j
        WHERE j.tenant_id = tenant AND j.status::text NOT IN ('completed', 'cancelled')
      ), '[]'::jsonb)
    );
  END IF;

  IF action = 'save_brief' THEN
    IF role_name = 'TECHNICIAN' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Technicians cannot edit standing property briefs';
    END IF;
    IF NOT (body ? 'property_id') OR btrim(COALESCE(body->>'access_instructions', '')) = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Property and access instructions are required';
    END IF;

    SELECT p.* INTO prop
    FROM properties p
    JOIN customers c ON c.id = p.customer_id
    JOIN users u ON u.id = c.user_id AND u.tenant_id = tenant
    WHERE p.id = (body->>'property_id')::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Property not found';
    END IF;

    SELECT * INTO brief FROM property_service_briefs WHERE tenant_id = tenant AND property_id = prop.id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO property_service_briefs(
        tenant_id, property_id, access_instructions, restricted_credentials,
        service_zones, known_hazards, pets_notes, pest_concerns, version, updated_by
      ) VALUES (
        tenant, prop.id, btrim(body->>'access_instructions'), NULLIF(btrim(COALESCE(body->>'restricted_credentials', '')), ''),
        COALESCE(body->'service_zones', '[]'::jsonb), btrim(COALESCE(body->>'known_hazards', '')),
        btrim(COALESCE(body->>'pets_notes', '')), btrim(COALESCE(body->>'pest_concerns', '')), 1, actor
      ) RETURNING * INTO brief;
    ELSE
      IF (body ? 'version') AND (body->>'version')::integer IS DISTINCT FROM brief.version THEN
        RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Property brief changed; reload before saving';
      END IF;
      UPDATE property_service_briefs SET
        access_instructions = btrim(body->>'access_instructions'),
        restricted_credentials = CASE WHEN body ? 'restricted_credentials' THEN NULLIF(btrim(COALESCE(body->>'restricted_credentials', '')), '') ELSE restricted_credentials END,
        service_zones = COALESCE(body->'service_zones', service_zones),
        known_hazards = COALESCE(btrim(body->>'known_hazards'), known_hazards),
        pets_notes = COALESCE(btrim(body->>'pets_notes'), pets_notes),
        pest_concerns = COALESCE(btrim(body->>'pest_concerns'), pest_concerns),
        version = brief.version + 1,
        updated_by = actor,
        updated_at = now()
      WHERE id = brief.id RETURNING * INTO brief;
    END IF;

    INSERT INTO playbook_events(tenant_id, property_id, actor_id, action, details)
    VALUES (tenant, prop.id, actor, 'brief_saved', jsonb_build_object('version', brief.version));

    RETURN jsonb_build_object(
      'id', brief.id,
      'property_id', brief.property_id,
      'access_instructions', brief.access_instructions,
      'restricted_credentials', brief.restricted_credentials,
      'service_zones', brief.service_zones,
      'known_hazards', brief.known_hazards,
      'pets_notes', brief.pets_notes,
      'pest_concerns', brief.pest_concerns,
      'version', brief.version
    );
  END IF;

  IF action = 'publish_template' THEN
    IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Manager required to publish checklist templates';
    END IF;
    IF btrim(COALESCE(body->>'template_key', '')) = '' OR btrim(COALESCE(body->>'title', '')) = '' OR jsonb_typeof(body->'tasks') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'tasks') = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Template key, title, and non-empty tasks array required';
    END IF;

    SELECT COALESCE(MAX(version), 0) + 1 INTO next_ver
    FROM service_checklist_versions
    WHERE tenant_id = tenant AND template_key = btrim(body->>'template_key');

    INSERT INTO service_checklist_versions(
      tenant_id, template_key, title, service_type, version, status, tasks, published_by
    ) VALUES (
      tenant, btrim(body->>'template_key'), btrim(body->>'title'),
      COALESCE(NULLIF(btrim(body->>'service_type'), ''), 'general'),
      next_ver, 'published', body->'tasks', actor
    ) RETURNING * INTO tpl;

    RETURN jsonb_build_object(
      'id', tpl.id,
      'template_key', tpl.template_key,
      'title', tpl.title,
      'service_type', tpl.service_type,
      'version', tpl.version,
      'status', tpl.status,
      'tasks', tpl.tasks
    );
  END IF;

  IF action = 'start_run' THEN
    IF NOT (body ? 'job_id') OR NOT (body ? 'checklist_version_id') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'job_id and checklist_version_id required';
    END IF;

    SELECT * INTO job_row FROM jobs WHERE id = (body->>'job_id')::uuid AND tenant_id = tenant FOR UPDATE;
    IF NOT FOUND OR (role_name = 'TECHNICIAN' AND job_row.technician_id IS DISTINCT FROM tech_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Assigned job not found';
    END IF;

    SELECT * INTO tpl FROM service_checklist_versions WHERE id = (body->>'checklist_version_id')::uuid AND tenant_id = tenant AND status = 'published';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Published checklist version not found';
    END IF;

    SELECT * INTO brief FROM property_service_briefs WHERE tenant_id = tenant AND property_id = job_row.property_id;

    SELECT * INTO run_row FROM job_playbook_runs WHERE tenant_id = tenant AND job_id = job_row.id FOR UPDATE;
    IF FOUND THEN
      RETURN playbook_run_json(run_row);
    END IF;

    INSERT INTO job_playbook_runs(
      tenant_id, job_id, property_id, checklist_version_id, technician_id, state,
      brief_snapshot, checklist_snapshot
    ) VALUES (
      tenant, job_row.id, job_row.property_id, tpl.id, job_row.technician_id, 'pending_ack',
      jsonb_build_object(
        'access_instructions', COALESCE(brief.access_instructions, 'Standard property access'),
        'known_hazards', COALESCE(brief.known_hazards, ''),
        'pets_notes', COALESCE(brief.pets_notes, ''),
        'pest_concerns', COALESCE(brief.pest_concerns, ''),
        'service_zones', COALESCE(brief.service_zones, '[]'::jsonb),
        'brief_version', COALESCE(brief.version, 1)
      ),
      tpl.tasks
    ) RETURNING * INTO run_row;

    INSERT INTO playbook_events(tenant_id, property_id, job_run_id, actor_id, action, details)
    VALUES (tenant, job_row.property_id, run_row.id, actor, 'run_started', jsonb_build_object('checklist_version_id', tpl.id));

    RETURN playbook_run_json(run_row);
  END IF;

  IF action = 'list' THEN
    SELECT COALESCE(jsonb_agg(playbook_run_json(r) ORDER BY r.updated_at DESC, r.id DESC), '[]'::jsonb) INTO items
    FROM job_playbook_runs r
    JOIN jobs j ON j.id = r.job_id AND j.tenant_id = tenant
    WHERE r.tenant_id = tenant
      AND (role_name <> 'TECHNICIAN' OR j.technician_id = tech_id)
      AND (NOT (body ? 'property_id') OR btrim(body->>'property_id') = '' OR r.property_id = (body->>'property_id')::uuid)
      AND (NOT (body ? 'job_id') OR btrim(body->>'job_id') = '' OR r.job_id = (body->>'job_id')::uuid)
      AND (NOT (body ? 'state') OR btrim(body->>'state') = '' OR r.state = body->>'state');

    RETURN jsonb_build_object('items', items, 'has_more', false);
  END IF;

  IF action IN ('get', 'acknowledge', 'save_run', 'submit', 'review') THEN
    IF NOT (body ? 'id') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Playbook run id required';
    END IF;

    SELECT r.* INTO run_row
    FROM job_playbook_runs r
    JOIN jobs j ON j.id = r.job_id AND j.tenant_id = tenant
    WHERE r.id = (body->>'id')::uuid AND r.tenant_id = tenant
      AND (role_name <> 'TECHNICIAN' OR j.technician_id = tech_id)
    FOR UPDATE OF r;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Playbook run not found';
    END IF;

    IF action = 'get' THEN
      RETURN playbook_run_json(run_row);
    END IF;

    IF (body ? 'version') AND (body->>'version')::integer IS DISTINCT FROM run_row.version THEN
      RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Playbook run changed; reload before saving';
    END IF;

    IF action = 'acknowledge' THEN
      IF run_row.state NOT IN ('pending_ack', 'in_progress') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Playbook run already submitted';
      END IF;
      UPDATE job_playbook_runs SET
        state = 'in_progress',
        acknowledged_at = COALESCE(acknowledged_at, now()),
        version = run_row.version + 1,
        updated_at = now()
      WHERE id = run_row.id RETURNING * INTO run_row;

      INSERT INTO playbook_events(tenant_id, property_id, job_run_id, actor_id, action, details)
      VALUES (tenant, run_row.property_id, run_row.id, actor, 'brief_acknowledged', jsonb_build_object('version', run_row.version));

      RETURN playbook_run_json(run_row);
    END IF;

    IF action = 'save_run' THEN
      IF run_row.state = 'pending_ack' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Acknowledge property brief before recording responses';
      END IF;
      IF run_row.state IN ('submitted', 'reviewed') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Playbook run is locked';
      END IF;

      UPDATE job_playbook_runs SET
        responses = COALESCE(body->'responses', responses),
        exceptions = COALESCE(body->'exceptions', exceptions),
        observations = COALESCE(body->>'observations', observations),
        follow_up_flagged = COALESCE((body->>'follow_up_flagged')::boolean, follow_up_flagged),
        version = run_row.version + 1,
        updated_at = now()
      WHERE id = run_row.id RETURNING * INTO run_row;

      INSERT INTO playbook_events(tenant_id, property_id, job_run_id, actor_id, action, details)
      VALUES (tenant, run_row.property_id, run_row.id, actor, 'run_saved', jsonb_build_object('version', run_row.version));

      RETURN playbook_run_json(run_row);
    END IF;

    IF action = 'submit' THEN
      IF run_row.state = 'pending_ack' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Acknowledge property brief before submitting';
      END IF;
      IF run_row.state IN ('submitted', 'reviewed') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Playbook run already submitted';
      END IF;

      IF body ? 'responses' OR body ? 'exceptions' OR body ? 'observations' OR body ? 'follow_up_flagged' THEN
        UPDATE job_playbook_runs SET
          responses = COALESCE(body->'responses', responses),
          exceptions = COALESCE(body->'exceptions', exceptions),
          observations = COALESCE(body->>'observations', observations),
          follow_up_flagged = COALESCE((body->>'follow_up_flagged')::boolean, follow_up_flagged)
        WHERE id = run_row.id RETURNING * INTO run_row;
      END IF;

      FOR task_item IN SELECT * FROM jsonb_array_elements(run_row.checklist_snapshot) LOOP
        IF COALESCE((task_item->>'required')::boolean, false) THEN
          task_id := task_item->>'id';
          resp_val := btrim(COALESCE(run_row.responses->>task_id, ''));
          exc_val := btrim(COALESCE(run_row.exceptions->>task_id, ''));
          IF resp_val = '' AND exc_val = '' THEN
            RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = format('Required checklist task %s requires a response or exception reason', task_id);
          END IF;
        END IF;
      END LOOP;

      UPDATE job_playbook_runs SET
        state = 'submitted',
        submitted_at = now(),
        version = run_row.version + 1,
        updated_at = now()
      WHERE id = run_row.id RETURNING * INTO run_row;

      INSERT INTO playbook_events(tenant_id, property_id, job_run_id, actor_id, action, details)
      VALUES (tenant, run_row.property_id, run_row.id, actor, 'run_submitted', jsonb_build_object('follow_up_flagged', run_row.follow_up_flagged));

      RETURN playbook_run_json(run_row);
    END IF;

    IF action = 'review' THEN
      IF role_name = 'TECHNICIAN' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Office staff required to review playbook runs';
      END IF;
      IF run_row.state <> 'submitted' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Only submitted playbook runs can be reviewed';
      END IF;
      IF btrim(COALESCE(body->>'review_notes', '')) = '' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Review notes are required';
      END IF;

      UPDATE job_playbook_runs SET
        state = 'reviewed',
        review_notes = btrim(body->>'review_notes'),
        reviewed_at = now(),
        version = run_row.version + 1,
        updated_at = now()
      WHERE id = run_row.id RETURNING * INTO run_row;

      IF COALESCE((body->>'promote_to_brief')::boolean, false) AND btrim(run_row.observations) <> '' THEN
        UPDATE property_service_briefs SET
          pest_concerns = CASE WHEN pest_concerns = '' THEN run_row.observations ELSE pest_concerns || '; ' || run_row.observations END,
          version = version + 1,
          updated_by = actor,
          updated_at = now()
        WHERE tenant_id = tenant AND property_id = run_row.property_id;
      END IF;

      INSERT INTO playbook_events(tenant_id, property_id, job_run_id, actor_id, action, details)
      VALUES (tenant, run_row.property_id, run_row.id, actor, 'run_reviewed', jsonb_build_object('review_notes', run_row.review_notes));

      RETURN playbook_run_json(run_row);
    END IF;
  END IF;

  RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Unsupported playbook action';
END $$;
