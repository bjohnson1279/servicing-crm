-- ⚡ Bolt Optimization: Add missing foreign key indexes to existing tables for warranty feature
-- These columns were added in 022_callbacks_warranty.sql but were missing indexes.
-- Adding them prevents severe performance bottlenecks (full table scans) during lookups and joins.

CREATE INDEX IF NOT EXISTS service_contracts_warranty_policy_idx ON service_contracts(warranty_policy_id);
CREATE INDEX IF NOT EXISTS jobs_warranty_policy_idx ON jobs(warranty_policy_id);
CREATE INDEX IF NOT EXISTS jobs_source_job_idx ON jobs(source_job_id);
