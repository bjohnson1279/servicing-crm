-- ⚡ Bolt Optimization: Add missing foreign key indexes to property devices tables to prevent full table scans on joins.

CREATE INDEX IF NOT EXISTS property_devices_customer_idx ON property_devices(customer_id);
CREATE INDEX IF NOT EXISTS property_devices_equipment_item_idx ON property_devices(equipment_item_id);
CREATE INDEX IF NOT EXISTS property_devices_replaces_device_idx ON property_devices(replaces_device_id);

CREATE INDEX IF NOT EXISTS device_locations_device_idx ON device_locations(device_id);
CREATE INDEX IF NOT EXISTS device_locations_actor_idx ON device_locations(actor_id);

CREATE INDEX IF NOT EXISTS device_events_actor_idx ON device_events(actor_id);
CREATE INDEX IF NOT EXISTS device_events_job_idx ON device_events(job_id);

CREATE INDEX IF NOT EXISTS device_requests_device_idx ON device_requests(device_id);
CREATE INDEX IF NOT EXISTS device_requests_actor_idx ON device_requests(actor_id);
