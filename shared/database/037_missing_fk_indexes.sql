-- ⚡ Bolt Optimization: Add missing indexes for crucial foreign keys (tenant_id, customer_id, user_id, property_id)
-- to prevent full table scans and improve join performance in a multi-tenant environment.

CREATE INDEX IF NOT EXISTS catalog_products_tenant_id_idx ON catalog_products(tenant_id);
CREATE INDEX IF NOT EXISTS catalog_requests_tenant_id_idx ON catalog_requests(tenant_id);
CREATE INDEX IF NOT EXISTS commercial_accounts_tenant_id_idx ON commercial_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS commercial_requests_tenant_id_idx ON commercial_requests(tenant_id);
CREATE INDEX IF NOT EXISTS device_requests_tenant_id_idx ON device_requests(tenant_id);
CREATE INDEX IF NOT EXISTS inspection_requests_tenant_id_idx ON inspection_requests(tenant_id);
CREATE INDEX IF NOT EXISTS job_cost_policies_tenant_id_idx ON job_cost_policies(tenant_id);
CREATE INDEX IF NOT EXISTS job_cost_requests_tenant_id_idx ON job_cost_requests(tenant_id);
CREATE INDEX IF NOT EXISTS job_cost_settings_events_tenant_id_idx ON job_cost_settings_events(tenant_id);
CREATE INDEX IF NOT EXISTS property_devices_property_id_idx ON property_devices(property_id);
CREATE INDEX IF NOT EXISTS recurring_assessments_tenant_id_idx ON recurring_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS recurring_occurrences_tenant_id_idx ON recurring_occurrences(tenant_id);
CREATE INDEX IF NOT EXISTS recurring_schedule_revisions_tenant_id_idx ON recurring_schedule_revisions(tenant_id);
CREATE INDEX IF NOT EXISTS service_callbacks_property_id_idx ON service_callbacks(property_id);
