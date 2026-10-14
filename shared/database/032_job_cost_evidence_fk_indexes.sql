-- ⚡ Bolt Optimization: Add missing foreign key indexes to job cost evidence tables to prevent full table scans on joins.

CREATE INDEX IF NOT EXISTS job_cost_policies_actor_idx ON job_cost_policies(actor_id);

CREATE INDEX IF NOT EXISTS job_cost_entries_supersedes_idx ON job_cost_entries(supersedes_id);
CREATE INDEX IF NOT EXISTS job_cost_entries_policy_idx ON job_cost_entries(policy_id);
CREATE INDEX IF NOT EXISTS job_cost_entries_actor_idx ON job_cost_entries(actor_id);

CREATE INDEX IF NOT EXISTS job_cost_requests_actor_idx ON job_cost_requests(actor_id);

CREATE INDEX IF NOT EXISTS job_cost_settings_events_actor_idx ON job_cost_settings_events(actor_id);
