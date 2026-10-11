BEGIN;

-- ⚡ Bolt Optimization: Add missing tenant_id indexes to prevent full table scans in multi-tenant queries
CREATE INDEX callback_visits_tenant_idx ON callback_visits(tenant_id);
CREATE INDEX callback_events_tenant_idx ON callback_events(tenant_id);
CREATE INDEX callback_attachments_tenant_idx ON callback_attachments(tenant_id);
CREATE INDEX warranty_policy_versions_tenant_idx ON warranty_policy_versions(tenant_id);

COMMIT;
