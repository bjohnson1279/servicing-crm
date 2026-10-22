-- ⚡ Bolt Optimization: Add missing foreign key indexes for remaining unindexed relationships.

CREATE INDEX IF NOT EXISTS automated_followups_customer_idx ON automated_followups(customer_id);
CREATE INDEX IF NOT EXISTS automated_followups_campaign_idx ON automated_followups(campaign_id);
CREATE INDEX IF NOT EXISTS purchase_orders_item_idx ON purchase_orders(item_id);
