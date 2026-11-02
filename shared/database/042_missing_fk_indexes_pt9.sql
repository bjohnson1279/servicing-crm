-- ⚡ Bolt Optimization: Add missing foreign key indexes from ALTER TABLE statements
-- Added missing single-column indexes for referential integrity that were introduced
-- via ALTER TABLE statements in earlier migrations.

CREATE INDEX IF NOT EXISTS idx_jobs_source_job_id ON jobs(source_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_warranty_policy_id ON jobs(warranty_policy_id);
CREATE INDEX IF NOT EXISTS idx_service_contracts_warranty_policy_id ON service_contracts(warranty_policy_id);
