-- ⚡ Bolt Optimization: Add missing single-column foreign key indexes
-- Continuing to resolve referential integrity bottlenecks in multi-tenant schemas.
-- Added indexes for remaining unindexed foreign keys identified in the schema.

CREATE INDEX IF NOT EXISTS idx_service_agreements_customer_id ON service_agreements(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_agreements_property_id ON service_agreements(property_id);
CREATE INDEX IF NOT EXISTS idx_service_agreements_contract_id ON service_agreements(contract_id);
