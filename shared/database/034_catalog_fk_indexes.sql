-- ⚡ Bolt Optimization: Add missing foreign key indexes to catalog tables to prevent full table scans on joins.

CREATE INDEX IF NOT EXISTS catalog_versions_verified_by_idx ON catalog_versions(verified_by);

CREATE INDEX IF NOT EXISTS catalog_documents_uploaded_by_idx ON catalog_documents(uploaded_by);

CREATE INDEX IF NOT EXISTS catalog_events_actor_idx ON catalog_events(actor_id);

CREATE INDEX IF NOT EXISTS catalog_requests_actor_idx ON catalog_requests(actor_id);
CREATE INDEX IF NOT EXISTS catalog_requests_product_idx ON catalog_requests(product_id);
