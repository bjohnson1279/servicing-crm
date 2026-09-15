-- 003_seed_data.sql
-- Fills the database with realistic mock data for all CRM modules.

DO $$
DECLARE
    tenant_id UUID := '11111111-1111-1111-1111-111111111111';
    
    -- Users
    admin_id UUID := '22222222-2222-2222-2222-222222222221';
    tech1_id UUID := '22222222-2222-2222-2222-222222222222';
    tech2_id UUID := '22222222-2222-2222-2222-222222222223';
    sales_id UUID := '22222222-2222-2222-2222-222222222224';
    csr_id UUID   := '22222222-2222-2222-2222-222222222225';
    cust1_user_id UUID := '22222222-2222-2222-2222-222222222226';
    cust2_user_id UUID := '22222222-2222-2222-2222-222222222227';
    
    -- Real entities
    cust1_id UUID := '33333333-3333-3333-3333-333333333331';
    cust2_id UUID := '33333333-3333-3333-3333-333333333332';
    prop1_id UUID := '44444444-4444-4444-4444-444444444441';
    prop2_id UUID := '44444444-4444-4444-4444-444444444442';
    contract1_id UUID := '55555555-5555-5555-5555-555555555551';
    contract2_id UUID := '55555555-5555-5555-5555-555555555552';
    tech1_pk UUID;
    tech2_pk UUID;
BEGIN
    -- 1. Insert Tenant
    INSERT INTO tenants (id, name) VALUES (tenant_id, 'Acme Field Services') ON CONFLICT DO NOTHING;

    -- 2. Insert Users
    INSERT INTO users (id, tenant_id, email, password_hash, role) VALUES 
    (admin_id, tenant_id, 'admin@acmeservices.com', 'hashed_pass', 'SUPER_ADMIN'),
    (tech1_id, tenant_id, 'tech.john@acmeservices.com', 'hashed_pass', 'TECHNICIAN'),
    (tech2_id, tenant_id, 'tech.sarah@acmeservices.com', 'hashed_pass', 'TECHNICIAN'),
    (sales_id, tenant_id, 'sales.mike@acmeservices.com', 'hashed_pass', 'DOOR_TO_DOOR_SALES'),
    (csr_id, tenant_id, 'support.amy@acmeservices.com', 'hashed_pass', 'CUSTOMER_SERVICE_REP'),
    (cust1_user_id, tenant_id, 'customer1@gmail.com', 'hashed_pass', 'CUSTOMER'),
    (cust2_user_id, tenant_id, 'commercial@bigcorp.com', 'hashed_pass', 'CUSTOMER')
    ON CONFLICT DO NOTHING;

    -- 3. Insert Technicians & Capture PKs
    INSERT INTO technicians (user_id, status) VALUES 
    (tech1_id, 'available') RETURNING id INTO tech1_pk;
    
    INSERT INTO technicians (user_id, status) VALUES 
    (tech2_id, 'en_route') RETURNING id INTO tech2_pk;

    -- 4. Insert Customers (Billing Entities)
    INSERT INTO customers (id, user_id, name) VALUES 
    (cust1_id, cust1_user_id, 'Residential Client (John Doe)'),
    (cust2_id, cust2_user_id, 'Commercial Client (Big Corp)')
    ON CONFLICT DO NOTHING;

    -- 5. Insert Properties (Service Locations)
    INSERT INTO properties (id, customer_id, address, city, state, zip_code) VALUES 
    (prop1_id, cust1_id, '123 Elm St', 'Springfield', 'IL', '62704'),
    (prop2_id, cust2_id, '999 Industrial Blvd', 'Springfield', 'IL', '62705')
    ON CONFLICT DO NOTHING;

    -- 6. Insert Service Contracts
    INSERT INTO service_contracts (id, tenant_id, customer_id, property_id, cadence, start_date, recurring_amount) VALUES 
    (contract1_id, tenant_id, cust1_id, prop1_id, 'QUARTERLY', '2026-01-01', 150.00),
    (contract2_id, tenant_id, cust2_id, prop2_id, 'MONTHLY', '2026-03-01', 500.00)
    ON CONFLICT DO NOTHING;

    -- 7. Insert Jobs
    INSERT INTO jobs (tenant_id, customer_id, property_id, technician_id, contract_id, status, scheduled_start) VALUES 
    (tenant_id, cust1_id, prop1_id, tech1_pk, contract1_id, 'scheduled', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    (tenant_id, cust2_id, prop2_id, tech2_pk, contract2_id, 'in_progress', CURRENT_TIMESTAMP),
    (tenant_id, cust1_id, prop1_id, tech1_pk, contract1_id, 'completed', CURRENT_TIMESTAMP - INTERVAL '3 months');

    -- 8. Insert Canvass Pins
    INSERT INTO canvass_pins (tenant_id, sales_rep_id, lat, lng, address, status, notes) VALUES
    (tenant_id, sales_id, 39.7817, -89.6501, '125 Elm St', 'NOT_HOME', 'Left flyer on door'),
    (tenant_id, sales_id, 39.7818, -89.6502, '127 Elm St', 'SOLD', 'Signed quarterly pest control contract');

    -- 9. Insert Commissions
    INSERT INTO commissions (tenant_id, sales_rep_id, amount, type) VALUES
    (tenant_id, sales_id, 75.00, 'flat_rate_sign_on');

    -- 10. Contact Logs
    INSERT INTO contact_logs (tenant_id, customer_id, user_id, channel, direction, summary) VALUES
    (tenant_id, cust1_id, csr_id, 'PHONE', 'INBOUND', 'Customer called to reschedule tomorrow''s appointment.');

    -- 11. Internal Notes
    INSERT INTO internal_notes (tenant_id, customer_id, property_id, author_id, is_pinned, note_text) VALUES
    (tenant_id, cust1_id, prop1_id, csr_id, true, 'Customer has a large dog in the backyard. Call 30 minutes prior to arrival.');

END $$;
