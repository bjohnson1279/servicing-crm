ALTER TABLE customers ADD COLUMN stripe_customer_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN stripe_payment_intent_id VARCHAR(255);

CREATE TABLE subscription_billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    stripe_invoice_id VARCHAR(255),
    amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
