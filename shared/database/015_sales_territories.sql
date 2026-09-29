-- 015_sales_territories.sql
-- Feature #11: Sales Territory Management & Do-Not-Knock Compliance

CREATE TABLE IF NOT EXISTS territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_rep_id UUID REFERENCES users(id) ON DELETE SET NULL,
    color VARCHAR(50) DEFAULT '#3b82f6',
    polygon_coordinates JSONB NOT NULL, -- Array of [lat, lng] vertices defining polygon
    quota_target DECIMAL(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS do_not_knock_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    territory_id UUID REFERENCES territories(id) ON DELETE SET NULL,
    address VARCHAR(255) NOT NULL,
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    reason VARCHAR(255) DEFAULT 'Customer Request', -- e.g., 'Customer Request', 'Municipal Ordinance', 'HOA Restriction'
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Link canvass_pins with territories and do-not-knock flags
ALTER TABLE canvass_pins ADD COLUMN IF NOT EXISTS territory_id UUID REFERENCES territories(id) ON DELETE SET NULL;
ALTER TABLE canvass_pins ADD COLUMN IF NOT EXISTS is_do_not_knock BOOLEAN DEFAULT false;

-- Indexes for spatial queries and analytics
CREATE INDEX IF NOT EXISTS idx_territories_tenant ON territories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_territories_rep ON territories(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_dnk_tenant ON do_not_knock_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dnk_territory ON do_not_knock_records(territory_id);
CREATE INDEX IF NOT EXISTS idx_canvass_pins_territory ON canvass_pins(territory_id);
