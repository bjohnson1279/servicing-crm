CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected');
CREATE TYPE payment_method AS ENUM ('credit_card', 'cash', 'check', 'ach');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE erp_provider AS ENUM ('quickbooks', 'xero', 'netsuite');

CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    total_amount DECIMAL(12, 2) NOT NULL,
    status quote_status DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    amount DECIMAL(12, 2) NOT NULL,
    method payment_method NOT NULL,
    status payment_status DEFAULT 'pending',
    external_transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE erp_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider erp_provider NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    sync_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
