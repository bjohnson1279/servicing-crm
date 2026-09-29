-- 014_chemical_inventory_link.sql

ALTER TABLE chemical_application_logs
ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS epa_registration_no VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_chem_logs_item ON chemical_application_logs(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_chem_logs_job ON chemical_application_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_chem_logs_applied ON chemical_application_logs(applied_at);
