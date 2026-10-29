-- ⚡ Bolt Optimization: Explicitly index the property_id foreign key in property_devices
-- to prevent full table scans during referential integrity checks. PostgreSQL requires
-- the foreign key to be the first column in an index to use it for cascade/restrict operations.
CREATE INDEX IF NOT EXISTS property_devices_property_id_idx ON property_devices(property_id);
