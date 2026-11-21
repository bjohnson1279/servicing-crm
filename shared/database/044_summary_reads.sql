-- Invoker rights and existing FORCE RLS remain in effect. Summaries never load
-- complete entity payloads into an application process.
CREATE OR REPLACE FUNCTION dashboard_summary(tenant uuid,actor uuid,python_compat boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE role_name text;answer jsonb;
BEGIN
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 IF role_name NOT IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','DOOR_TO_DOOR_SALES') THEN
  RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff analytics access required';
 END IF;
 WITH contracts AS (
  SELECT count(*) AS count,coalesce(sum(coalesce(recurring_amount,0)/CASE cadence
   WHEN 'MONTHLY' THEN 1 WHEN 'BI_MONTHLY' THEN 2 WHEN 'QUARTERLY' THEN 3
   WHEN 'SEMI_ANNUALLY' THEN 6 WHEN 'ANNUALLY' THEN 12 ELSE NULL END),0) AS mrr
  FROM service_contracts WHERE tenant_id=tenant AND status='active'
 ), commission_totals AS MATERIALIZED (
  SELECT sales_rep_id,sum(amount) AS amount FROM commissions WHERE tenant_id=tenant
   AND (NOT python_compat OR is_clawed_back=false) GROUP BY sales_rep_id
 ), completed AS MATERIALIZED (
  SELECT technician_id,count(*) AS count FROM jobs WHERE tenant_id=tenant AND status='completed' GROUP BY technician_id
 ), technicians_page AS (
  SELECT t.id,u.email,coalesce(j.count,0) AS count FROM technicians t JOIN users u ON u.id=t.user_id AND u.tenant_id=tenant
   LEFT JOIN completed j ON j.technician_id=t.id WHERE python_compat OR j.count>0
   ORDER BY count DESC,u.email,t.id LIMIT 5
 ), sales_page AS (
  SELECT u.id,u.email,c.amount FROM commission_totals c JOIN users u ON u.id=c.sales_rep_id AND u.tenant_id=tenant
   ORDER BY c.amount DESC,u.email,u.id LIMIT 5
 ), revenue AS (
  SELECT coalesce(sum(i.total_amount),0) AS amount FROM invoices i JOIN jobs j ON j.id=i.job_id WHERE j.tenant_id=tenant AND i.status IN ('paid','PAID')
 )
 SELECT CASE WHEN python_compat THEN jsonb_build_object(
  'mrr',round(c.mrr,2),'arr',round(c.mrr*12,2),'activeContracts',c.count,
  'totalCommissions',round(coalesce((SELECT sum(amount) FROM commission_totals),0),2),'paidRevenue',round(r.amount,2),
  'techLeaderboard',(SELECT coalesce(jsonb_agg(jsonb_build_object('technicianId',id,'email',email,'completedJobs',count) ORDER BY count DESC,email,id),'[]') FROM technicians_page),
  'salesLeaderboard',(SELECT coalesce(jsonb_agg(jsonb_build_object('salesRepId',id,'email',email,'totalRevenue',amount) ORDER BY amount DESC,email,id),'[]') FROM sales_page))
 ELSE jsonb_build_object('mrr',c.mrr,'arr',c.mrr*12,'activeContractsCount',c.count,
  'totalCommissions',coalesce((SELECT sum(amount) FROM commission_totals),0),'totalRevenue',r.amount,
  'techLeaderboard',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',email,'count',count) ORDER BY count DESC,email,id),'[]') FROM technicians_page),
  'salesLeaderboard',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',email,'revenue',amount) ORDER BY amount DESC,email,id),'[]') FROM sales_page)) END INTO answer FROM contracts c CROSS JOIN revenue r;
 RETURN answer;
END $$;

-- One bounded account set, one ownership evaluation per site, and joined source
-- validation per contact. Stale ownership/source links retain their review flags.
CREATE OR REPLACE FUNCTION commercial_account_summaries(account_ids uuid[]) RETURNS TABLE(id uuid,value jsonb)
LANGUAGE sql STABLE AS $$
 WITH accounts AS MATERIALIZED (SELECT a.* FROM commercial_accounts a WHERE a.id=ANY(account_ids)),
 sites AS MATERIALIZED (
  SELECT s.*,u.id IS NOT NULL AS valid FROM commercial_sites s JOIN accounts a ON a.id=s.account_id AND a.tenant_id=s.tenant_id
  LEFT JOIN properties p ON p.id=s.property_id AND p.customer_id=s.customer_id
  LEFT JOIN customers c ON c.id=p.customer_id LEFT JOIN users u ON u.id=c.user_id AND u.tenant_id=s.tenant_id
 ), site_counts AS (
  SELECT account_id,count(*) FILTER(WHERE state='active' AND valid) AS active,
   count(*) FILTER(WHERE NOT valid) AS review FROM sites GROUP BY account_id
 ), contact_counts AS (
  SELECT c.account_id,count(*) FILTER(WHERE NOT (
   (c.site_id IS NULL OR coalesce(s.valid AND s.customer_id IS NOT DISTINCT FROM c.customer_id,false))
   AND (c.customer_id IS NULL OR u.id IS NOT NULL)
   AND (c.source_email_id IS NULL OR coalesce(e.email_address=c.email,false))
   AND (c.source_phone_id IS NULL OR coalesce(p.phone_number=c.phone,false)))) AS review
  FROM commercial_contacts c JOIN accounts a ON a.id=c.account_id AND a.tenant_id=c.tenant_id
  LEFT JOIN sites s ON s.id=c.site_id AND s.account_id=c.account_id AND s.tenant_id=c.tenant_id
  LEFT JOIN customers cu ON cu.id=c.customer_id LEFT JOIN users u ON u.id=cu.user_id AND u.tenant_id=c.tenant_id
  LEFT JOIN customer_emails e ON e.id=c.source_email_id AND e.customer_id=c.customer_id
  LEFT JOIN customer_phones p ON p.id=c.source_phone_id AND p.customer_id=c.customer_id
  WHERE c.state='active' GROUP BY c.account_id
 )
 SELECT a.id,to_jsonb(a)||jsonb_build_object('owner_name',u.email,'active_site_count',coalesce(s.active,0),
  'ownership_review_count',coalesce(s.review,0),'contact_review_count',coalesce(c.review,0))
 FROM accounts a LEFT JOIN users u ON u.id=a.owner_id AND u.tenant_id=a.tenant_id AND u.role::text IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR')
 LEFT JOIN site_counts s ON s.account_id=a.id LEFT JOIN contact_counts c ON c.account_id=a.id
$$;

CREATE OR REPLACE FUNCTION commercial_account_view(a commercial_accounts) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT value FROM commercial_account_summaries(ARRAY[a.id])
$$;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servicing_crm_runtime') THEN
  GRANT EXECUTE ON FUNCTION dashboard_summary(uuid,uuid,boolean),commercial_account_summaries(uuid[]) TO servicing_crm_runtime;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servicing_crm_worker') THEN
  GRANT EXECUTE ON FUNCTION dashboard_summary(uuid,uuid,boolean),commercial_account_summaries(uuid[]) TO servicing_crm_worker;
 END IF;
END $$;

-- Existing command behavior retained; list enrichment is performed after paging.
CREATE OR REPLACE FUNCTION commercial_api(action text,tenant uuid,actor uuid,body jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE role_name text;manager boolean;enabled boolean;a commercial_accounts;s commercial_sites;c commercial_contacts;replay commercial_requests;
 page_limit integer;page_offset integer;items jsonb;answer jsonb;details jsonb;reason_text text;code_text text;name_text text;owner uuid;
 property uuid;customer uuid;email_text text;phone_text text;responsibility_text text;is_primary_value boolean;dep_total bigint;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>100000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Object required'; END IF;
 SELECT role::text INTO role_name FROM users WHERE id=actor AND tenant_id=tenant FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0401',MESSAGE='Invalid identity'; END IF;
 IF role_name NOT IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR') THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Staff directory access required'; END IF;
 manager:=role_name IN ('SUPER_ADMIN','MANAGER');
 IF action IN ('settings_read','list','get','options','sites','site_get','contacts','events') THEN
  SELECT commercial_accounts_enabled INTO enabled FROM tenants WHERE id=tenant FOR SHARE;
 ELSE
  SELECT commercial_accounts_enabled INTO enabled FROM tenants WHERE id=tenant FOR UPDATE;
 END IF;
 IF action IN ('settings','settings_read') THEN
  IF action='settings' THEN
   IF NOT manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager required'; END IF;
   IF jsonb_typeof(body->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Enabled boolean required'; END IF;
   UPDATE tenants SET commercial_accounts_enabled=(body->>'enabled')::boolean WHERE id=tenant;enabled:=(body->>'enabled')::boolean;
  END IF;RETURN jsonb_build_object('enabled',enabled,'role',role_name);
 END IF;
 IF NOT enabled THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='Commercial directory disabled'; END IF;
 IF action NOT IN ('list','get','options','sites','site_get','contacts','events') THEN
  IF NOT manager THEN RAISE EXCEPTION USING ERRCODE='P0403',MESSAGE='Manager required'; END IF;
  IF action NOT IN ('create','update','archive','reopen','link_site','update_site','archive_site','reopen_site','save_contact','archive_contact') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown commercial action'; END IF;
  IF body->>'request_key' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Request key required'; END IF;
  SELECT * INTO replay FROM commercial_requests WHERE tenant_id=tenant AND actor_id=actor AND request_key=(body->>'request_key')::uuid;
  IF FOUND THEN
   IF replay.action<>action OR replay.payload<>body THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Request key reused'; END IF;
   IF action IN ('link_site','update_site','archive_site','reopen_site') AND NOT EXISTS(SELECT 1 FROM commercial_sites ss WHERE ss.id=(replay.result->>'id')::uuid AND ss.tenant_id=tenant AND commercial_property_valid(tenant,ss.property_id,ss.customer_id)) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Site ownership review required'; END IF;
   IF action IN ('save_contact','archive_contact') AND NOT EXISTS(SELECT 1 FROM commercial_contacts cc WHERE cc.id=(replay.result->>'id')::uuid AND cc.tenant_id=tenant AND CASE WHEN action='archive_contact' THEN commercial_contact_scope_valid(cc) ELSE commercial_contact_valid(cc) END) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Contact ownership or source review required'; END IF;
   RETURN replay.result;
  END IF;
  reason_text:=trim(body->>'reason');IF COALESCE(length(reason_text),0) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Action reason required'; END IF;
 END IF;
 page_limit:=COALESCE((body->>'limit')::integer,25);page_offset:=COALESCE((body->>'offset')::integer,0);
 IF page_limit NOT BETWEEN 1 AND 100 OR page_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Invalid pagination'; END IF;
 IF action='options' THEN
  IF body->>'kind'='owners' THEN
   SELECT COALESCE(jsonb_agg(value),'[]') INTO items FROM (SELECT jsonb_build_object('id',id,'name',email,'role',role) value FROM users WHERE tenant_id=tenant AND role::text IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR') AND (body->>'q' IS NULL OR email ILIKE '%'||(body->>'q')||'%') ORDER BY email,id LIMIT page_limit+1 OFFSET page_offset) q;
  ELSIF body->>'kind'='contacts' THEN
   customer:=(body->>'customer_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM customers cu JOIN users u ON u.id=cu.user_id WHERE cu.id=customer AND u.tenant_id=tenant) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Customer not found'; END IF;
   SELECT COALESCE(jsonb_agg(value),'[]') INTO items FROM (SELECT value FROM (
    SELECT jsonb_build_object('kind','email','id',id,'value',email_address) value,id FROM customer_emails WHERE customer_id=customer
    UNION ALL SELECT jsonb_build_object('kind','phone','id',id,'value',phone_number),id FROM customer_phones WHERE customer_id=customer) all_contacts ORDER BY id LIMIT page_limit+1 OFFSET page_offset) q;
  ELSE
   SELECT COALESCE(jsonb_agg(value),'[]') INTO items FROM (SELECT jsonb_build_object('property_id',p.id,'customer_id',cu.id,'customer_name',cu.name,'address',p.address,'dependencies',commercial_dependencies(tenant,p.id,cu.id)) value
    FROM properties p JOIN customers cu ON cu.id=p.customer_id JOIN users u ON u.id=cu.user_id AND u.tenant_id=tenant
    WHERE NOT EXISTS(SELECT 1 FROM commercial_sites linked_site WHERE linked_site.property_id=p.id AND linked_site.state='active') AND (body->>'q' IS NULL OR p.address ILIKE '%'||(body->>'q')||'%' OR cu.name ILIKE '%'||(body->>'q')||'%')
    ORDER BY cu.name,p.address,p.id LIMIT page_limit+1 OFFSET page_offset) q;
  END IF;
 ELSIF action='list' THEN
  WITH eligible AS MATERIALIZED (
   SELECT aa.id,aa.name FROM commercial_accounts aa WHERE aa.tenant_id=tenant
    AND (body->>'state' IS NULL OR aa.state=body->>'state') AND (body->>'q' IS NULL OR aa.name ILIKE '%'||(body->>'q')||'%' OR aa.code ILIKE '%'||(body->>'q')||'%')
    ORDER BY aa.name,aa.id LIMIT page_limit+1 OFFSET page_offset
  ), shown AS MATERIALIZED (SELECT * FROM eligible ORDER BY name,id LIMIT page_limit)
  SELECT jsonb_build_object('items',coalesce(jsonb_agg(summary_rows.value ORDER BY p.name,p.id),'[]'),'has_more',(SELECT count(*)>page_limit FROM eligible))
   INTO answer FROM shown p JOIN commercial_account_summaries(ARRAY(SELECT id FROM shown)) summary_rows ON summary_rows.id=p.id;
  RETURN answer;
 END IF;
 IF action IN ('list','options') THEN RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>page_limit THEN items-page_limit ELSE items END,'has_more',jsonb_array_length(items)>page_limit); END IF;
 IF action='create' THEN
  code_text:=upper(trim(body->>'code'));name_text:=trim(body->>'name');owner:=COALESCE((body->>'owner_id')::uuid,actor);
  IF COALESCE(code_text,'') !~ '^[A-Z0-9][A-Z0-9_-]{0,79}$' OR COALESCE(length(name_text),0) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Account code and name required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=owner AND tenant_id=tenant AND role::text IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR')) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Staff owner not found'; END IF;
  INSERT INTO commercial_accounts(tenant_id,code,name,owner_id) VALUES(tenant,code_text,name_text,owner) RETURNING * INTO a;
  answer:=commercial_account_view(a);details:=to_jsonb(a);
 ELSE
  SELECT * INTO a FROM commercial_accounts WHERE id=(body->>'id')::uuid AND tenant_id=tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Account not found'; END IF;
  IF action='get' THEN RETURN commercial_account_view(a); END IF;
  IF action='sites' THEN
   SELECT COALESCE(jsonb_agg(value),'[]') INTO items FROM (SELECT commercial_site_view(ss) value FROM commercial_sites ss WHERE ss.tenant_id=tenant AND ss.account_id=a.id AND (body->>'state' IS NULL OR ss.state=body->>'state') ORDER BY ss.name,ss.id LIMIT page_limit+1 OFFSET page_offset) q;
  ELSIF action='contacts' THEN
   IF body->>'site_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_sites ss WHERE ss.id=(body->>'site_id')::uuid AND ss.tenant_id=tenant AND ss.account_id=a.id AND commercial_property_valid(tenant,ss.property_id,ss.customer_id)) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Site ownership review required'; END IF;
   SELECT COALESCE(jsonb_agg(value),'[]') INTO items FROM (SELECT CASE WHEN commercial_contact_valid(cc) THEN to_jsonb(cc) ELSE jsonb_build_object('id',cc.id,'site_id',cc.site_id,'name','Contact source review required','responsibility',cc.responsibility,'email',NULL,'phone',NULL,'is_primary',cc.is_primary,'state',cc.state,'version',cc.version,'needs_review',true,'scope_valid',commercial_contact_scope_valid(cc)) END value FROM commercial_contacts cc WHERE cc.tenant_id=tenant AND cc.account_id=a.id AND cc.site_id IS NOT DISTINCT FROM (body->>'site_id')::uuid AND CASE WHEN COALESCE((body->>'review')::boolean,false) THEN NOT commercial_contact_valid(cc) ELSE commercial_contact_valid(cc) END AND (body->>'state' IS NULL OR cc.state=body->>'state') ORDER BY cc.name,cc.id LIMIT page_limit+1 OFFSET page_offset) q;
  ELSIF action='events' THEN
   SELECT COALESCE(jsonb_agg(value),'[]') INTO items FROM (SELECT to_jsonb(e) value FROM commercial_events e WHERE e.tenant_id=tenant AND e.account_id=a.id ORDER BY e.created_at DESC,e.id LIMIT page_limit+1 OFFSET page_offset) q;
  END IF;
  IF action IN ('sites','contacts','events') THEN RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>page_limit THEN items-page_limit ELSE items END,'has_more',jsonb_array_length(items)>page_limit); END IF;
  IF action IN ('update','archive','reopen') THEN
   IF (body->>'version')::integer IS DISTINCT FROM a.version THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Account changed; reload'; END IF;
   IF action='update' THEN
    IF a.state<>'active' OR body ? 'code' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Active account and permanent code required'; END IF;
    name_text:=trim(COALESCE(body->>'name',a.name));owner:=COALESCE((body->>'owner_id')::uuid,a.owner_id);
    IF length(name_text) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Account name required'; END IF;
    IF NOT EXISTS(SELECT 1 FROM users WHERE id=owner AND tenant_id=tenant AND role::text IN ('SUPER_ADMIN','MANAGER','DISPATCHER','CUSTOMER_SERVICE_REP','CSR')) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Staff owner not found'; END IF;
    UPDATE commercial_accounts SET name=name_text,owner_id=owner,version=version+1,updated_at=now() WHERE id=a.id RETURNING * INTO a;
   ELSE
    IF action='archive' AND a.state<>'active' OR action='reopen' AND a.state<>'archived' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Invalid account transition'; END IF;
    IF action='archive' AND body->'acknowledge_dependencies' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Acknowledge that site membership and service/billing obligations remain unchanged'; END IF;
    UPDATE commercial_accounts SET state=CASE action WHEN 'archive' THEN 'archived' ELSE 'active' END,version=version+1,updated_at=now() WHERE id=a.id RETURNING * INTO a;
   END IF;
   answer:=commercial_account_view(a);details:=to_jsonb(a);
  ELSE
   IF a.state<>'active' AND action<>'site_get' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Reopen account before changing its directory'; END IF;
   IF action='link_site' THEN
    IF (body->>'version')::integer IS DISTINCT FROM a.version THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Account changed; reload'; END IF;
    property:=(body->>'property_id')::uuid;SELECT customer_id INTO customer FROM properties WHERE id=property FOR SHARE;
    IF NOT commercial_property_valid(tenant,property,customer) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Property not found'; END IF;
    code_text:=upper(trim(body->>'code'));name_text:=trim(body->>'name');
    IF COALESCE(code_text,'') !~ '^[A-Z0-9][A-Z0-9_-]{0,79}$' OR COALESCE(length(name_text),0) NOT BETWEEN 1 AND 160 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=body->>'timezone') THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Site code, name and IANA timezone required'; END IF;
    details:=commercial_dependencies(tenant,property,customer);SELECT sum(value::bigint) INTO dep_total FROM jsonb_each_text(details);
    IF dep_total>0 AND body->'acknowledge_dependencies' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Review and acknowledge existing site dependencies'; END IF;
    INSERT INTO commercial_sites(tenant_id,account_id,code,name,property_id,customer_id,timezone) VALUES(tenant,a.id,code_text,name_text,property,customer,body->>'timezone') RETURNING * INTO s;
    UPDATE commercial_accounts SET version=version+1,updated_at=now() WHERE id=a.id;
    answer:=commercial_site_view(s);details:=details||jsonb_build_object('site_id',s.id,'code',s.code,'property_id',s.property_id,'customer_id',s.customer_id);
   ELSIF action IN ('site_get','update_site','archive_site','reopen_site') THEN
    SELECT * INTO s FROM commercial_sites WHERE id=(body->>'site_id')::uuid AND account_id=a.id AND tenant_id=tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Site not found'; END IF;
    IF action='site_get' THEN RETURN commercial_site_view(s); END IF;
    IF NOT commercial_property_valid(tenant,s.property_id,s.customer_id) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Site ownership review required'; END IF;
    IF (body->>'version')::integer IS DISTINCT FROM s.version THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Site changed; reload'; END IF;
    IF action='update_site' THEN
     IF s.state<>'active' OR body ?| ARRAY['code','property_id','customer_id'] THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Active site with permanent identity required'; END IF;
     name_text:=trim(COALESCE(body->>'name',s.name));
     IF length(name_text) NOT BETWEEN 1 AND 160 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=COALESCE(body->>'timezone',s.timezone)) THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Site name and timezone required'; END IF;
     UPDATE commercial_sites SET name=name_text,timezone=COALESCE(body->>'timezone',timezone),version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
    ELSE
     IF action='archive_site' AND s.state<>'active' OR action='reopen_site' AND s.state<>'archived' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Invalid site transition'; END IF;
     IF action='archive_site' AND body->'acknowledge_dependencies' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Acknowledge that service and billing remain unchanged'; END IF;
     UPDATE commercial_sites SET state=CASE action WHEN 'archive_site' THEN 'archived' ELSE 'active' END,version=version+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
    END IF;
    answer:=commercial_site_view(s);details:=jsonb_build_object('site',to_jsonb(s),'dependencies',commercial_dependencies(tenant,s.property_id,s.customer_id));
   ELSIF action IN ('save_contact','archive_contact') THEN
    IF body->>'contact_id' IS NOT NULL THEN
     SELECT * INTO c FROM commercial_contacts WHERE id=(body->>'contact_id')::uuid AND account_id=a.id AND tenant_id=tenant FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Contact not found'; END IF;
     IF (body->>'version')::integer IS DISTINCT FROM c.version THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Contact changed; reload'; END IF;
     IF NOT commercial_contact_scope_valid(c) OR action='save_contact' AND NOT commercial_contact_valid(c) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Contact ownership or source review required'; END IF;
     IF body ?| ARRAY['site_id','customer_id','source_email_id','source_phone_id'] THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Contact scope is permanent'; END IF;
     IF c.site_id IS NOT NULL THEN SELECT * INTO s FROM commercial_sites WHERE id=c.site_id AND account_id=a.id AND tenant_id=tenant; END IF;
    ELSE
     IF action='archive_contact' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Contact ID required'; END IF;
     IF body->>'site_id' IS NOT NULL THEN
      SELECT * INTO s FROM commercial_sites WHERE id=(body->>'site_id')::uuid AND account_id=a.id AND tenant_id=tenant;
      IF NOT FOUND OR NOT commercial_property_valid(tenant,s.property_id,s.customer_id) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Site not found'; END IF;
     END IF;
     customer:=COALESCE(s.customer_id,(body->>'customer_id')::uuid);
     IF customer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_sites ss WHERE ss.account_id=a.id AND ss.tenant_id=tenant AND ss.customer_id=customer AND commercial_property_valid(tenant,ss.property_id,ss.customer_id)) THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Account customer not found'; END IF;
    END IF;
    IF s.id IS NOT NULL AND s.state<>'active' AND action='save_contact' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Active site required'; END IF;
    IF c.id IS NOT NULL AND c.state<>'active' THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Archived contact must be replaced'; END IF;
    IF action='archive_contact' THEN
     UPDATE commercial_contacts SET state='archived',version=version+1,updated_at=now() WHERE id=c.id RETURNING * INTO c;
    ELSE
     responsibility_text:=COALESCE(body->>'responsibility',c.responsibility);name_text:=trim(COALESCE(body->>'name',c.name));email_text:=NULLIF(trim(COALESCE(body->>'email',c.email)),'');phone_text:=NULLIF(trim(COALESCE(body->>'phone',c.phone)),'');
     IF body ? 'is_primary' AND jsonb_typeof(body->'is_primary') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Primary boolean required'; END IF;
     is_primary_value:=COALESCE((body->>'is_primary')::boolean,c.is_primary,false);
     IF body->>'source_email_id' IS NOT NULL THEN SELECT email_address INTO email_text FROM customer_emails WHERE id=(body->>'source_email_id')::uuid AND customer_id=customer;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Customer email not found'; END IF; END IF;
     IF body->>'source_phone_id' IS NOT NULL THEN SELECT phone_number INTO phone_text FROM customer_phones WHERE id=(body->>'source_phone_id')::uuid AND customer_id=customer;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0404',MESSAGE='Customer phone not found'; END IF; END IF;
     IF NOT COALESCE(responsibility_text IN ('corporate','on_site','billing','emergency'),false) OR COALESCE(length(name_text),0) NOT BETWEEN 1 AND 160 OR email_text IS NULL AND phone_text IS NULL
      OR email_text IS NOT NULL AND (length(email_text)>255 OR email_text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') OR phone_text IS NOT NULL AND length(phone_text)>40 THEN RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Responsibility, name and valid email or phone required'; END IF;
     IF c.id IS NULL THEN
      INSERT INTO commercial_contacts(tenant_id,account_id,site_id,customer_id,source_email_id,source_phone_id,responsibility,name,email,phone,is_primary) VALUES(tenant,a.id,s.id,customer,(body->>'source_email_id')::uuid,(body->>'source_phone_id')::uuid,responsibility_text,name_text,email_text,phone_text,is_primary_value) RETURNING * INTO c;
     ELSE
      UPDATE commercial_contacts SET responsibility=responsibility_text,name=name_text,email=email_text,phone=phone_text,is_primary=is_primary_value,version=version+1,updated_at=now() WHERE id=c.id RETURNING * INTO c;
      IF NOT commercial_contact_valid(c) THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='Linked source contact cannot be overwritten'; END IF;
     END IF;
    END IF;
    answer:=to_jsonb(c);details:=to_jsonb(c);
   ELSE RAISE EXCEPTION USING ERRCODE='P0400',MESSAGE='Unknown commercial action'; END IF;
  END IF;
 END IF;
 INSERT INTO commercial_events(tenant_id,account_id,site_id,actor_id,action,reason,details) VALUES(tenant,a.id,COALESCE(s.id,c.site_id),actor,action,reason_text,details);
 INSERT INTO commercial_requests(tenant_id,actor_id,request_key,action,payload,result) VALUES(tenant,actor,(body->>'request_key')::uuid,action,body,answer);
 RETURN answer;
END $$;
