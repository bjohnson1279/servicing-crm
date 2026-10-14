-- ⚡ Bolt Optimization: Add missing foreign key indexes to inspection tables to prevent full table scans on joins.

CREATE INDEX IF NOT EXISTS inspections_customer_idx ON inspections(customer_id);
CREATE INDEX IF NOT EXISTS inspections_property_idx ON inspections(property_id);
-- job_id already has a UNIQUE constraint which creates an index

CREATE INDEX IF NOT EXISTS inspection_revisions_author_idx ON inspection_revisions(author_id);
CREATE INDEX IF NOT EXISTS inspection_revisions_submitted_by_idx ON inspection_revisions(submitted_by);
CREATE INDEX IF NOT EXISTS inspection_revisions_reviewed_by_idx ON inspection_revisions(reviewed_by);

CREATE INDEX IF NOT EXISTS inspection_attachments_actor_idx ON inspection_attachments(actor_id);

CREATE INDEX IF NOT EXISTS inspection_events_inspection_idx ON inspection_events(inspection_id);
CREATE INDEX IF NOT EXISTS inspection_events_actor_idx ON inspection_events(actor_id);

CREATE INDEX IF NOT EXISTS inspection_requests_actor_idx ON inspection_requests(actor_id);
CREATE INDEX IF NOT EXISTS inspection_requests_inspection_idx ON inspection_requests(inspection_id);
