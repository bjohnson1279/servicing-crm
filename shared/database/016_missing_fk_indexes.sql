-- Missing indexes for foreign keys to optimize query performance

-- 001_initial_schema.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_technicians_user ON technicians(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_customer ON properties(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_property ON jobs(property_id);
CREATE INDEX IF NOT EXISTS idx_routes_technician ON routes(technician_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- 002_expanded_domain.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_employee_certifications_user ON employee_certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_course ON employee_certifications(course_id);
CREATE INDEX IF NOT EXISTS idx_canvass_pins_sales_rep ON canvass_pins(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_commissions_job ON commissions(job_id);
CREATE INDEX IF NOT EXISTS idx_customer_tech_restr_customer ON customer_technician_restrictions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tech_restr_technician ON customer_technician_restrictions(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_contracts_customer ON service_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_contracts_property ON service_contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_chemical_app_logs_technician ON chemical_application_logs(technician_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_user ON contact_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_customer ON internal_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_property ON internal_notes(property_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_author ON internal_notes(author_id);

-- 004_crm_features.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_tasks_user ON employee_onboarding_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_tasks_checklist ON employee_onboarding_tasks(checklist_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_user ON employee_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_task ON employee_documents(task_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_customer ON notification_queue(customer_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_job ON notification_queue(job_id);

-- 005_finance_and_revenue.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_property ON quotes(property_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

-- 006_stripe_payments.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_subscription_billing_events_customer ON subscription_billing_events(customer_id);

-- 007_customer_health.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_customer_health_scores_customer ON customer_health_scores(customer_id);

-- 008_digital_agreements.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_service_agreements_customer ON service_agreements(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_agreements_property ON service_agreements(property_id);
CREATE INDEX IF NOT EXISTS idx_service_agreements_contract ON service_agreements(contract_id);

-- 010_property_conditions.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_property_photos_property ON property_photos(property_id);
CREATE INDEX IF NOT EXISTS idx_property_photos_job ON property_photos(job_id);

-- 011_marketing_retention.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_automated_followups_customer ON automated_followups(customer_id);
CREATE INDEX IF NOT EXISTS idx_automated_followups_campaign ON automated_followups(campaign_id);

-- 012_inventory_management.sql missing indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_item ON purchase_orders(item_id);
