-- ⚡ Bolt Optimization: Add missing foreign key indexes to callback tables to prevent full table scans on joins.
-- Note: While CONCURRENTLY is best practice for massive tables to avoid write locks,
-- these tables were just created in migration 022 and are likely empty or small.
-- Leaving transaction management up to the migration runner.

CREATE INDEX IF NOT EXISTS service_callbacks_customer_idx ON service_callbacks(customer_id);
CREATE INDEX IF NOT EXISTS service_callbacks_source_job_idx ON service_callbacks(source_job_id);
CREATE INDEX IF NOT EXISTS service_callbacks_contract_idx ON service_callbacks(contract_id);
CREATE INDEX IF NOT EXISTS service_callbacks_assigned_csr_idx ON service_callbacks(assigned_csr_id);
CREATE INDEX IF NOT EXISTS service_callbacks_quote_idx ON service_callbacks(quote_id);

CREATE INDEX IF NOT EXISTS callback_visits_callback_idx ON callback_visits(callback_id);
CREATE INDEX IF NOT EXISTS callback_events_callback_idx ON callback_events(callback_id);
CREATE INDEX IF NOT EXISTS callback_attachments_callback_idx ON callback_attachments(callback_id);

CREATE INDEX IF NOT EXISTS callback_events_actor_idx ON callback_events(actor_id);
CREATE INDEX IF NOT EXISTS callback_attachments_actor_idx ON callback_attachments(actor_id);
