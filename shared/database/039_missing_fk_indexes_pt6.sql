-- ⚡ Bolt Optimization: Add missing single-column foreign key indexes
-- As discovered during performance review, while composite indexes (like tenant_id, property_id)
-- optimize tenant-scoped queries, PostgreSQL requires the foreign key column to be the *first* column
-- in an index to efficiently avoid full table scans during cascaded deletes or referential integrity checks.
-- This migration adds dedicated single-column indexes for remaining foreign keys to resolve this bottleneck.

CREATE INDEX IF NOT EXISTS idx_service_callbacks_property_id ON service_callbacks(property_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_entries_job_id ON job_cost_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_entries_contract_id ON job_cost_entries(contract_id);
CREATE INDEX IF NOT EXISTS idx_commercial_sites_account_id ON commercial_sites(account_id);
CREATE INDEX IF NOT EXISTS idx_commercial_events_account_id ON commercial_events(account_id);
