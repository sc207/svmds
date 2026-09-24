-- Refunds. When money already received ends up above what a sevarthi now owes
-- (moved to a cheaper seva, contribution lowered, seva cancelled), the operator
-- chooses: keep it as excess, or give it back. Giving it back is a ledger row
-- of its own — kind 'refund', a NEGATIVE amount, payer_type = who it went back
-- to, its own R-<year>-NNNN receipt — so the original payment and its receipt
-- are never rewritten, and every "paid" figure (always SUM(payments.amount))
-- is the net the trust actually holds without any query changing.

ALTER TABLE payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment', 'refund'));
CREATE INDEX IF NOT EXISTS idx_payments_kind ON payments(kind);
