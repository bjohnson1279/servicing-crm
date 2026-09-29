-- Missing tenant_id index for multi-tenant query optimization
-- This will prevent full table scans and improve query speeds when filtering service agreements by tenant.
CREATE INDEX IF NOT EXISTS idx_service_agreements_tenant ON service_agreements(tenant_id);
