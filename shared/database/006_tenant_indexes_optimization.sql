-- Add missing database indexes on tenant_id for performance optimization in multi-tenant queries.
-- Missing indexes cause full table scans in multi-tenant database.
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_routes_tenant ON routes(tenant_id);
CREATE INDEX idx_training_courses_tenant ON training_courses(tenant_id);
CREATE INDEX idx_canvass_pins_tenant ON canvass_pins(tenant_id);
CREATE INDEX idx_commissions_tenant ON commissions(tenant_id);
CREATE INDEX idx_service_contracts_tenant ON service_contracts(tenant_id);
CREATE INDEX idx_contact_logs_tenant ON contact_logs(tenant_id);
CREATE INDEX idx_internal_notes_tenant ON internal_notes(tenant_id);
CREATE INDEX idx_onboarding_checklists_tenant ON onboarding_checklists(tenant_id);
CREATE INDEX idx_notification_queue_tenant ON notification_queue(tenant_id);
