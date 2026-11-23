-- Wave 3: Enterprise Slice 2 Enhancements
-- 1. Recurring Service Exception Queue Slice 2: Operator Resolution Actions ('resolve')
-- 2. Job Cost Evidence & Profitability Slice 2: Contract & Tenant Revenue/Cost Rollup ('rollup')
-- 3. Commercial & Multi-Site Accounts Slice 2: Consolidated Multi-Site Account Summary ('summary')

ALTER FUNCTION recurring_api(text, uuid, uuid, jsonb) RENAME TO recurring_api_slice1;

CREATE FUNCTION recurring_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  t tenants;
  exc recurring_exceptions;
  run recurring_assessments;
  resolution_type text;
  reason_text text;
  req_key uuid;
  new_evidence jsonb;
BEGIN
  IF action <> 'resolve' THEN
    RETURN recurring_api_slice1(action, tenant, actor, body);
  END IF;

  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Object required';
  END IF;

  SELECT role::text INTO role_name FROM users WHERE id = actor AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0401', MESSAGE = 'Invalid identity';
  END IF;
  IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER', 'DISPATCHER') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Manager or dispatcher required to resolve recurring exceptions';
  END IF;

  SELECT * INTO t FROM tenants WHERE id = tenant FOR UPDATE;
  IF NOT t.recurring_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0503', MESSAGE = 'Recurring assessment disabled';
  END IF;

  resolution_type := btrim(COALESCE(body->>'resolution', ''));
  reason_text := btrim(COALESCE(body->>'reason', ''));
  IF NOT (body ? 'id') OR resolution_type NOT IN ('dismissed', 'rescheduled', 'on_hold') OR length(reason_text) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Exception id, valid resolution (dismissed, rescheduled, on_hold), and reason required';
  END IF;

  SELECT * INTO exc FROM recurring_exceptions WHERE id = (body->>'id')::uuid AND tenant_id = tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Exception not found';
  END IF;
  IF exc.state = 'resolved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'Exception is already resolved';
  END IF;

  req_key := COALESCE((body->>'request_key')::uuid, uuid_generate_v4());
  INSERT INTO recurring_assessments(tenant_id, actor_id, request_key, payload)
  VALUES (tenant, actor, req_key, body)
  ON CONFLICT (tenant_id, actor_id, request_key) DO UPDATE SET payload = EXCLUDED.payload
  RETURNING * INTO run;

  new_evidence := COALESCE(exc.evidence, '{}'::jsonb) || jsonb_build_object(
    'resolution', resolution_type,
    'resolution_reason', reason_text,
    'resolved_by', actor,
    'resolved_at', now()
  );

  UPDATE recurring_exceptions
  SET state = 'resolved', evidence = new_evidence, last_detected_at = now()
  WHERE id = exc.id
  RETURNING * INTO exc;

  INSERT INTO recurring_exception_events(exception_id, assessment_id, state, evidence)
  VALUES (exc.id, run.id, 'resolved', new_evidence);

  RETURN recurring_api_slice1('get', tenant, actor, jsonb_build_object('id', exc.id));
END $$;


ALTER FUNCTION profitability_api(text, uuid, uuid, jsonb) RENAME TO profitability_api_slice1;

CREATE FUNCTION profitability_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  t tenants;
  total_known numeric(20, 2);
  total_estimated numeric(20, 2);
  total_revenue numeric(20, 2);
  contract_rows jsonb;
BEGIN
  IF action <> 'rollup' THEN
    RETURN profitability_api_slice1(action, tenant, actor, body);
  END IF;

  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Object required';
  END IF;

  SELECT role::text INTO role_name FROM users WHERE id = actor AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0401', MESSAGE = 'Invalid identity';
  END IF;
  IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Manager access required';
  END IF;

  SELECT * INTO t FROM tenants WHERE id = tenant FOR SHARE;
  IF NOT t.profitability_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0503', MESSAGE = 'Cost review disabled';
  END IF;

  WITH latest_entries AS (
    SELECT DISTINCT ON (job_id, category) job_id, contract_id, category, status, amount
    FROM job_cost_entries
    WHERE tenant_id = tenant
    ORDER BY job_id, category, revision DESC
  )
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status IN ('actual', 'zero')), 0)::numeric(20, 2),
    COALESCE(SUM(amount) FILTER (WHERE status = 'estimated'), 0)::numeric(20, 2)
  INTO total_known, total_estimated
  FROM latest_entries;

  SELECT COALESCE(SUM(inv.total_amount), 0)::numeric(20, 2)
  INTO total_revenue
  FROM invoices inv
  JOIN jobs j ON j.id = inv.job_id
  WHERE j.tenant_id = tenant;

  SELECT COALESCE(jsonb_agg(row_obj ORDER BY contract_id), '[]'::jsonb)
  INTO contract_rows
  FROM (
    SELECT
      sc.id AS contract_id,
      jsonb_build_object(
        'contract_id', sc.id,
        'customer_name', cu.name,
        'property_address', p.address,
        'cadence', sc.cadence::text,
        'recurring_amount', COALESCE(sc.recurring_amount, 0)::numeric(20, 2)::text,
        'job_count', (SELECT COUNT(*)::int FROM jobs jj WHERE jj.tenant_id = tenant AND jj.contract_id = sc.id),
        'known_cost', COALESCE((
          SELECT SUM(le.amount)
          FROM (
            SELECT DISTINCT ON (e.job_id, e.category) e.amount, e.status
            FROM job_cost_entries e
            WHERE e.tenant_id = tenant AND e.contract_id = sc.id
            ORDER BY e.job_id, e.category, e.revision DESC
          ) le
          WHERE le.status IN ('actual', 'zero')
        ), 0)::numeric(20, 2)::text
      ) AS row_obj
    FROM service_contracts sc
    JOIN customers cu ON cu.id = sc.customer_id
    JOIN properties p ON p.id = sc.property_id
    WHERE sc.tenant_id = tenant
  ) sub;

  RETURN jsonb_build_object(
    'currency', t.profitability_currency,
    'total_jobs', (SELECT COUNT(*)::int FROM jobs WHERE tenant_id = tenant),
    'total_known_cost', total_known::text,
    'total_estimated_cost', total_estimated::text,
    'total_billed_revenue', total_revenue::text,
    'net_margin', (total_revenue - total_known)::numeric(20, 2)::text,
    'contracts', contract_rows
  );
END $$;


ALTER FUNCTION commercial_api(text, uuid, uuid, jsonb) RENAME TO commercial_api_slice1;

CREATE FUNCTION commercial_api(action text, tenant uuid, actor uuid, body jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  role_name text;
  enabled boolean;
  a commercial_accounts;
  site_rows jsonb;
  total_jobs_cnt int;
  open_cb_cnt int;
  active_contracts_cnt int;
BEGIN
  IF action <> 'summary' THEN
    RETURN commercial_api_slice1(action, tenant, actor, body);
  END IF;

  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Object required';
  END IF;

  SELECT role::text INTO role_name FROM users WHERE id = actor AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0401', MESSAGE = 'Invalid identity';
  END IF;
  IF role_name NOT IN ('SUPER_ADMIN', 'MANAGER', 'DISPATCHER', 'CUSTOMER_SERVICE_REP', 'CSR') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0403', MESSAGE = 'Staff directory access required';
  END IF;

  SELECT commercial_accounts_enabled INTO enabled FROM tenants WHERE id = tenant FOR SHARE;
  IF NOT enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0503', MESSAGE = 'Commercial directory disabled';
  END IF;

  IF NOT (body ? 'id') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0400', MESSAGE = 'Account id required';
  END IF;

  SELECT * INTO a FROM commercial_accounts WHERE id = (body->>'id')::uuid AND tenant_id = tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0404', MESSAGE = 'Account not found';
  END IF;

  SELECT
    COALESCE(COUNT(DISTINCT j.id), 0)::int,
    COALESCE(COUNT(DISTINCT cb.id) FILTER (WHERE cb.state NOT IN ('resolved', 'cancelled')), 0)::int,
    COALESCE(COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'active'), 0)::int
  INTO total_jobs_cnt, open_cb_cnt, active_contracts_cnt
  FROM commercial_sites cs
  LEFT JOIN jobs j ON j.property_id = cs.property_id AND j.tenant_id = tenant
  LEFT JOIN service_callbacks cb ON cb.property_id = cs.property_id AND cb.tenant_id = tenant
  LEFT JOIN service_contracts sc ON sc.property_id = cs.property_id AND sc.tenant_id = tenant
  WHERE cs.account_id = a.id AND cs.tenant_id = tenant AND cs.state = 'active';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'site_id', cs.id,
    'code', cs.code,
    'name', cs.name,
    'state', cs.state,
    'property_id', cs.property_id,
    'job_count', (SELECT COUNT(*)::int FROM jobs jj WHERE jj.tenant_id = tenant AND jj.property_id = cs.property_id),
    'open_callbacks', (SELECT COUNT(*)::int FROM service_callbacks cbb WHERE cbb.tenant_id = tenant AND cbb.property_id = cs.property_id AND cbb.state NOT IN ('resolved', 'cancelled'))
  ) ORDER BY cs.name, cs.id), '[]'::jsonb)
  INTO site_rows
  FROM commercial_sites cs
  WHERE cs.account_id = a.id AND cs.tenant_id = tenant;

  RETURN jsonb_build_object(
    'account', commercial_account_view(a),
    'active_site_count', (SELECT COUNT(*)::int FROM commercial_sites cs WHERE cs.account_id = a.id AND cs.tenant_id = tenant AND cs.state = 'active'),
    'archived_site_count', (SELECT COUNT(*)::int FROM commercial_sites cs WHERE cs.account_id = a.id AND cs.tenant_id = tenant AND cs.state = 'archived'),
    'active_contact_count', (SELECT COUNT(*)::int FROM commercial_contacts cc WHERE cc.account_id = a.id AND cc.tenant_id = tenant AND cc.state = 'active'),
    'total_jobs', total_jobs_cnt,
    'open_callbacks', open_cb_cnt,
    'active_contracts', active_contracts_cnt,
    'sites', site_rows
  );
END $$;
