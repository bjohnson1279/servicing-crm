-- Missing indexes for foreign keys in recent schema additions

CREATE INDEX IF NOT EXISTS idx_api_usage_tenant ON api_usage_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_customer ON notification_preferences(customer_id);
CREATE INDEX IF NOT EXISTS idx_surveys_tenant ON surveys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_surveys_customer ON surveys(customer_id);
CREATE INDEX IF NOT EXISTS idx_surveys_job ON surveys(job_id);
CREATE INDEX IF NOT EXISTS idx_surveys_technician ON surveys(technician_id);
CREATE INDEX IF NOT EXISTS idx_survey_resp_survey ON survey_responses(survey_id);
