-- ⚡ Bolt Optimization: Add missing single-column foreign key indexes
-- Continuing to resolve referential integrity bottlenecks in multi-tenant schemas.
-- Added indexes for remaining unindexed foreign keys identified in the schema.

CREATE INDEX IF NOT EXISTS idx_callback_visits_job_id ON callback_visits(job_id);
CREATE INDEX IF NOT EXISTS idx_inspections_job_id ON inspections(job_id);
CREATE INDEX IF NOT EXISTS idx_inspection_attachments_inspection_id ON inspection_attachments(inspection_id);
CREATE INDEX IF NOT EXISTS idx_property_devices_property_id ON property_devices(property_id);
