-- Missing indexes for foreign keys introduced in 020_platform_hardening.sql

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_surveys_tenant ON surveys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_surveys_customer ON surveys(customer_id);
CREATE INDEX IF NOT EXISTS idx_surveys_job ON surveys(job_id);
CREATE INDEX IF NOT EXISTS idx_surveys_technician ON surveys(technician_id);
