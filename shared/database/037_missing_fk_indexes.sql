-- ⚡ Bolt Optimization: Add missing foreign key indexes to prevent full table scans.

CREATE INDEX IF NOT EXISTS service_callbacks_property_idx ON service_callbacks(property_id);
CREATE INDEX IF NOT EXISTS property_devices_property_idx ON property_devices(property_id);
CREATE INDEX IF NOT EXISTS job_cost_entries_contract_idx ON job_cost_entries(contract_id);
