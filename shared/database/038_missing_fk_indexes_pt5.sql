-- ⚡ Bolt Optimization: Add missing foreign key indexes
-- As documented in early DB migrations and learned from .jules/bolt.md, foreign keys in PostgreSQL
-- are not automatically indexed. These unindexed foreign keys lead to full table scans during JOINs.
-- This migration explicitly creates indexes for remaining unindexed foreign keys to optimize query performance.

CREATE INDEX IF NOT EXISTS idx_jobs_contract_id ON jobs(contract_id);
CREATE INDEX IF NOT EXISTS idx_automated_followups_tenant_id ON automated_followups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_id ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warranty_policy_versions_warranty_policy_id ON warranty_policy_versions(warranty_policy_id);
CREATE INDEX IF NOT EXISTS idx_warranty_policy_versions_source_job_id ON warranty_policy_versions(source_job_id);
CREATE INDEX IF NOT EXISTS idx_service_callbacks_tenant_id ON service_callbacks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inspections_tenant_id ON inspections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inspection_revisions_inspection_id ON inspection_revisions(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_requests_tenant_id ON inspection_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_property_devices_tenant_id ON property_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_events_device_id ON device_events(device_id);
CREATE INDEX IF NOT EXISTS idx_device_requests_tenant_id ON device_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_catalog_products_tenant_id ON catalog_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_catalog_events_product_id ON catalog_events(product_id);
CREATE INDEX IF NOT EXISTS idx_catalog_requests_tenant_id ON catalog_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_schedule_revisions_tenant_id ON recurring_schedule_revisions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_tenant_id ON recurring_occurrences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_assessments_tenant_id ON recurring_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_exceptions_tenant_id ON recurring_exceptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_policies_tenant_id ON job_cost_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_entries_tenant_id ON job_cost_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_requests_tenant_id ON job_cost_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_settings_events_tenant_id ON job_cost_settings_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commercial_accounts_tenant_id ON commercial_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commercial_requests_tenant_id ON commercial_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_contracts_contract_id ON service_contracts(contract_id);
