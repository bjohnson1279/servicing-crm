-- Performance Indexes based on .jules/bolt.md learnings

-- 1. Tenant ID Indexes (Critical for Multi-Tenant performance)
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_routes_tenant_id ON routes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_courses_tenant_id ON training_courses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_canvass_pins_tenant_id ON canvass_pins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commissions_tenant_id ON commissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_contracts_tenant_id ON service_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_tenant_id ON contact_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_tenant_id ON internal_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_checklists_tenant_id ON onboarding_checklists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_tenant_id ON notification_queue(tenant_id);

-- 2. Customer ID Indexes (Critical for per-customer queries)
CREATE INDEX IF NOT EXISTS idx_properties_customer_id ON properties(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_contracts_customer_id ON service_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tech_restr_customer_id ON customer_technician_restrictions(customer_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_customer_id ON internal_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
-- (customer_phones and customer_emails already have indexes in 004_crm_features.sql)

-- 3. Technician/User ID Indexes (Critical for per-technician/user queries)
CREATE INDEX IF NOT EXISTS idx_technicians_user_id ON technicians(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_technician_id ON routes(technician_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_user_id ON employee_certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_course_id ON employee_certifications(course_id);
CREATE INDEX IF NOT EXISTS idx_customer_tech_restr_tech_id ON customer_technician_restrictions(technician_id);
CREATE INDEX IF NOT EXISTS idx_chemical_application_logs_tech_id ON chemical_application_logs(technician_id);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_tasks_user_id ON employee_onboarding_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_user_id ON employee_documents(user_id);

-- 4. Job/Property ID Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_property_id ON jobs(property_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_chemical_application_logs_job_id ON chemical_application_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_job_id ON notification_queue(job_id);
