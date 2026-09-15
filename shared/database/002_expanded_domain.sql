-- 1. Human Resources (HR) & Staff Management Extensions
-- (Safe way to add enum values if they don't exist in PG16)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DOOR_TO_DOOR_SALES';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'CUSTOMER_SERVICE_REP';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'MANAGER';

-- 2. Training & Onboarding Module
CREATE TABLE training_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_mandatory BOOLEAN DEFAULT false,
    validity_months INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    course_id UUID NOT NULL REFERENCES training_courses(id),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Sales, Canvassing & Commission Engine
CREATE TYPE lead_status AS ENUM ('NOT_HOME', 'NOT_INTERESTED', 'PITCHED', 'SOLD');

CREATE TABLE canvass_pins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sales_rep_id UUID NOT NULL REFERENCES users(id),
    lat DECIMAL(10, 7) NOT NULL,
    lng DECIMAL(10, 7) NOT NULL,
    address VARCHAR(255),
    status lead_status NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    sales_rep_id UUID NOT NULL REFERENCES users(id),
    job_id UUID REFERENCES jobs(id),
    amount DECIMAL(10, 2) NOT NULL,
    type VARCHAR(50) NOT NULL, -- e.g., 'flat_rate', 'percentage'
    is_clawed_back BOOLEAN DEFAULT false,
    clawback_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Customer & Account Hierarchy (Technician Restrictions)
CREATE TABLE customer_technician_restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    technician_id UUID NOT NULL REFERENCES technicians(id),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, technician_id)
);

-- 5. Service Contracts, Subscriptions & Scheduling
CREATE TYPE contract_cadence AS ENUM ('ONE_TIME', 'MONTHLY', 'BI_MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY');

CREATE TABLE service_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    cadence contract_cadence NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    auto_renew BOOLEAN DEFAULT true,
    recurring_amount DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Link existing jobs to the new service_contracts table
ALTER TABLE jobs ADD COLUMN contract_id UUID REFERENCES service_contracts(id);

-- Chemical application logs for completion notes
CREATE TABLE chemical_application_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id),
    technician_id UUID NOT NULL REFERENCES technicians(id),
    chemical_name VARCHAR(255) NOT NULL,
    quantity_used DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    target_pests JSONB,
    weather_conditions JSONB,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Communications & Contact Log Module
CREATE TABLE contact_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    user_id UUID REFERENCES users(id), -- the staff member who logged/initiated the contact
    channel VARCHAR(50) NOT NULL, -- e.g., 'PHONE', 'EMAIL', 'SMS', 'IN_PERSON'
    direction VARCHAR(50) NOT NULL, -- e.g., 'INBOUND', 'OUTBOUND'
    summary TEXT,
    chronological_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE internal_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    property_id UUID REFERENCES properties(id),
    author_id UUID NOT NULL REFERENCES users(id),
    is_pinned BOOLEAN DEFAULT false,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance and reporting (Phase 7 Analytics preparation)
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_canvass_pins_status ON canvass_pins(status);
CREATE INDEX idx_commissions_sales_rep ON commissions(sales_rep_id);
CREATE INDEX idx_contact_logs_customer ON contact_logs(customer_id);
CREATE INDEX idx_service_contracts_status ON service_contracts(status);
