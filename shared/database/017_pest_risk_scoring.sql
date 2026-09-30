-- Migration 017: AI-Powered Pest Risk Scoring & Predictive Resurgence
-- Predicts pest activity using chemical application logs, weather conditions, elapsed treatment days, and property conditions.

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 7) DEFAULT 39.7817,
ADD COLUMN IF NOT EXISTS lng DECIMAL(10, 7) DEFAULT -89.6501;

CREATE TABLE IF NOT EXISTS property_pest_risk_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    overall_risk_score INTEGER NOT NULL, -- 0 to 100
    risk_level VARCHAR(50) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    primary_target_pest VARCHAR(100) NOT NULL, -- 'Carpenter Ants', 'Subterranean Termites', 'German Cockroaches', 'Rodents', 'Wasps'
    resurgence_probability DECIMAL(5, 2) NOT NULL, -- e.g. 78.50%
    days_to_projected_resurgence INTEGER NOT NULL, -- e.g. 24 days
    weather_risk_factor DECIMAL(5, 2) NOT NULL DEFAULT 1.0, -- humidity & heat multiplier
    chemical_decay_factor DECIMAL(5, 2) NOT NULL DEFAULT 1.0, -- treatment half-life degradation
    seasonal_vector VARCHAR(50) NOT NULL, -- 'SPRING_EMERGENCE', 'SUMMER_PEAK', 'FALL_NESTING', 'WINTER_DORMANCY'
    recommended_treatment TEXT NOT NULL,
    upsell_recommendation TEXT,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pest_risk_property ON property_pest_risk_scores(property_id);
CREATE INDEX IF NOT EXISTS idx_pest_risk_tenant ON property_pest_risk_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pest_risk_level ON property_pest_risk_scores(risk_level);
