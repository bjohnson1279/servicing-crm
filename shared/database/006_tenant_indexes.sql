-- Add missing tenant_id indexes to optimize multi-tenant queries

-- From 001_initial_schema.sql
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_routes_tenant ON routes(tenant_id);

-- From 002_expanded_domain.sql
CREATE INDEX idx_training_courses_tenant ON training_courses(tenant_id);
CREATE INDEX idx_canvass_pins_tenant ON canvass_pins(tenant_id);
CREATE INDEX idx_commissions_tenant ON commissions(tenant_id);
CREATE INDEX idx_service_contracts_tenant ON service_contracts(tenant_id);
CREATE INDEX idx_contact_logs_tenant ON contact_logs(tenant_id);
CREATE INDEX idx_internal_notes_tenant ON internal_notes(tenant_id);

-- From 004_crm_features.sql
CREATE INDEX idx_onboarding_checklists_tenant ON onboarding_checklists(tenant_id);
CREATE INDEX idx_notification_queue_tenant ON notification_queue(tenant_id);
