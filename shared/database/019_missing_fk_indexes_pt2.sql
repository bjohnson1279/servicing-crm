-- Missing indexes for foreign keys to optimize query performance part 2

CREATE INDEX IF NOT EXISTS idx_jobs_contract ON jobs(contract_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_assigned_csr ON chat_conversations(assigned_csr_id);
