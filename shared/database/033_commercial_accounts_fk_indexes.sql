-- ⚡ Bolt Optimization: Add missing foreign key indexes to commercial accounts tables to prevent full table scans on joins.

CREATE INDEX IF NOT EXISTS commercial_accounts_owner_idx ON commercial_accounts(owner_id);

CREATE INDEX IF NOT EXISTS commercial_sites_customer_idx ON commercial_sites(customer_id);

CREATE INDEX IF NOT EXISTS commercial_contacts_customer_idx ON commercial_contacts(customer_id);
CREATE INDEX IF NOT EXISTS commercial_contacts_source_email_idx ON commercial_contacts(source_email_id);
CREATE INDEX IF NOT EXISTS commercial_contacts_source_phone_idx ON commercial_contacts(source_phone_id);

CREATE INDEX IF NOT EXISTS commercial_events_actor_idx ON commercial_events(actor_id);

CREATE INDEX IF NOT EXISTS commercial_requests_actor_idx ON commercial_requests(actor_id);
