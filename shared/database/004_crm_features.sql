-- 1. Onboarding & Documents
CREATE TABLE onboarding_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    role user_role NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    description TEXT,
    requires_document BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_onboarding_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    checklist_id UUID NOT NULL REFERENCES onboarding_checklists(id),
    status VARCHAR(50) DEFAULT 'pending',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    task_id UUID REFERENCES employee_onboarding_tasks(id),
    document_type VARCHAR(100) NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Advanced Contact Management
CREATE TABLE customer_phones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    phone_number VARCHAR(20) NOT NULL,
    type VARCHAR(50) NOT NULL, -- e.g., 'MOBILE', 'HOME', 'WORK'
    is_primary BOOLEAN DEFAULT false,
    receives_sms BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    email_address VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Routing & Queueing
ALTER TABLE routes 
ADD COLUMN expected_travel_time_mins INTEGER,
ADD COLUMN total_distance_miles DECIMAL(10, 2);

CREATE TABLE notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    job_id UUID REFERENCES jobs(id),
    channel VARCHAR(50) NOT NULL, -- 'SMS', 'VOICE', 'EMAIL'
    contact_target VARCHAR(255) NOT NULL, -- The specific phone number or email address
    message_content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_log TEXT,
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_customer_phones_customer ON customer_phones(customer_id);
CREATE INDEX idx_customer_emails_customer ON customer_emails(customer_id);
