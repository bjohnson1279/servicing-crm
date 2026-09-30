-- Migration 016: Two-Way Live Chat (Customer ↔ CSR)
-- Supports real-time messaging, multi-conversation CSR inbox, canned response templates, and persistence to contact_logs.

CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    assigned_csr_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'WAITING_ON_CUSTOMER', 'WAITING_ON_AGENT', 'RESOLVED'
    subject VARCHAR(255),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL, -- 'CUSTOMER', 'CSR', 'SYSTEM'
    sender_id UUID,
    sender_name VARCHAR(255),
    message_text TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS canned_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shortcut VARCHAR(50) NOT NULL, -- e.g. '/eta', '/reschedule'
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'GENERAL',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant ON chat_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_customer ON chat_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant ON chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_canned_responses_tenant ON canned_responses(tenant_id);

-- Seed default canned response templates for existing tenants
INSERT INTO canned_responses (id, tenant_id, shortcut, title, category, content)
SELECT 
    uuid_generate_v4(),
    t.id,
    '/eta',
    'Technician Arrival ETA',
    'DISPATCH',
    'Hello! Your technician is currently en route and estimated to arrive within the next 20-30 minutes. You will receive an SMS as soon as they pull up.'
FROM tenants t
ON CONFLICT DO NOTHING;

INSERT INTO canned_responses (id, tenant_id, shortcut, title, category, content)
SELECT 
    uuid_generate_v4(),
    t.id,
    '/reschedule',
    'Reschedule Appointment',
    'SCHEDULING',
    'We would be happy to help reschedule your service! Please let us know which day and time window works best for you (Morning 8am-12pm or Afternoon 1pm-5pm).'
FROM tenants t
ON CONFLICT DO NOTHING;

INSERT INTO canned_responses (id, tenant_id, shortcut, title, category, content)
SELECT 
    uuid_generate_v4(),
    t.id,
    '/safety',
    'Chemical & Pet Safety Information',
    'COMPLIANCE',
    'All EPA-registered products applied by our technicians are child and pet friendly once dry. We recommend keeping pets off treated surfaces for 30 minutes following application.'
FROM tenants t
ON CONFLICT DO NOTHING;

INSERT INTO canned_responses (id, tenant_id, shortcut, title, category, content)
SELECT 
    uuid_generate_v4(),
    t.id,
    '/billing',
    'Payment & Invoice Assistance',
    'BILLING',
    'You can view and securely pay your open invoices anytime directly in your customer portal under the Invoices tab, or I can process payment for you right now.'
FROM tenants t
ON CONFLICT DO NOTHING;
