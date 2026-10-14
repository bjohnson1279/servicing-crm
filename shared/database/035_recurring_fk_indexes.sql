-- ⚡ Bolt Optimization: Add missing foreign key indexes to recurring tables to prevent full table scans on joins.

CREATE INDEX IF NOT EXISTS recurring_schedule_revisions_contract_idx ON recurring_schedule_revisions(contract_id);

CREATE INDEX IF NOT EXISTS recurring_occurrences_contract_idx ON recurring_occurrences(contract_id);
CREATE INDEX IF NOT EXISTS recurring_occurrences_revision_idx ON recurring_occurrences(revision_id);
CREATE INDEX IF NOT EXISTS recurring_occurrences_observed_job_idx ON recurring_occurrences(observed_job_id);

CREATE INDEX IF NOT EXISTS recurring_assessments_actor_idx ON recurring_assessments(actor_id);

CREATE INDEX IF NOT EXISTS recurring_exception_events_exception_idx ON recurring_exception_events(exception_id);
CREATE INDEX IF NOT EXISTS recurring_exception_events_assessment_idx ON recurring_exception_events(assessment_id);
