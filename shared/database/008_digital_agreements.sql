CREATE TYPE agreement_status AS ENUM ('draft', 'sent', 'signed', 'cancelled');

CREATE TABLE service_agreements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    status agreement_status DEFAULT 'draft',
    cadence contract_cadence NOT NULL,
    recurring_amount DECIMAL(10, 2) NOT NULL,
    start_date DATE NOT NULL,
    pdf_url TEXT,
    signature_svg TEXT,
    signed_at TIMESTAMP WITH TIME ZONE,
    contract_id UUID REFERENCES service_contracts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
