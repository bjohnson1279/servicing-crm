-- 020_platform_hardening.sql

-- Feature #17: API Usage Metrics
CREATE TABLE api_usage_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  request_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, endpoint, method, date)
);

CREATE INDEX idx_api_usage_date ON api_usage_metrics(date);

-- Feature #18: Audit Trail & Activity Logging
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(50),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);

-- Feature #19: Notification Preferences & Opt-Out
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  sms_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  voice_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  opt_out_timestamp TIMESTAMP,
  tcpa_consent_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feature #20: Surveys and NPS
CREATE TABLE surveys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  technician_id UUID REFERENCES technicians(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE TABLE survey_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id UUID UNIQUE REFERENCES surveys(id) ON DELETE CASCADE,
  nps_score INT CHECK (nps_score >= 0 AND nps_score <= 10),
  comments TEXT,
  responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feature #22: Technician Time Tracking (Adding to jobs)
ALTER TABLE jobs 
  ADD COLUMN actual_arrival TIMESTAMP,
  ADD COLUMN actual_departure TIMESTAMP,
  ADD COLUMN drive_time_minutes INT,
  ADD COLUMN on_site_time_minutes INT;
