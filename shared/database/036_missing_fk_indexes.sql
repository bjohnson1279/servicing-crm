-- ⚡ Bolt Optimization: Add missing foreign key indexes to prevent full table scans.

CREATE INDEX IF NOT EXISTS chat_messages_sender_idx ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS recurring_exceptions_contract_idx ON recurring_exceptions(contract_id);
CREATE INDEX IF NOT EXISTS recurring_exceptions_occurrence_idx ON recurring_exceptions(occurrence_id);
