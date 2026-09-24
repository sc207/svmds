-- Indexes for the lookups that grow with the register (found by EXPLAIN QUERY
-- PLAN over every read the app makes, and timed on 2,000 devotees / 4,000
-- payments / 6,000 audit rows).
--
-- 1. payments(kind) is a two-value column, and SQLite chose it for
--    "WHERE booking_id = b.id AND kind = 'payment'" (last paid, payment count,
--    refunded) — walking every payment of that kind once per booking. The
--    bookings list took ~600ms on the test register; with (booking_id, kind)
--    it takes ~20ms. The composite also covers booking_id-only lookups, so the
--    single-column booking index is dropped as redundant.
DROP INDEX IF EXISTS idx_payments_kind;
CREATE INDEX IF NOT EXISTS idx_payments_booking_kind ON payments(booking_id, kind);
DROP INDEX IF EXISTS idx_payments_booking;

-- 2. One record's change history (the ledger on every sevarthi row) filters
--    the audit log — the fastest-growing table — by entity + id.
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);

-- 3. The devotee register and profile total each devotee's donations and
--    padhramni with a correlated subquery; without these, one scan of each
--    table per devotee.
CREATE INDEX IF NOT EXISTS idx_donations_devotee ON donations(devotee_id);
CREATE INDEX IF NOT EXISTS idx_visits_devotee ON visits(devotee_id);

-- 4. Register filters by samaj / category.
CREATE INDEX IF NOT EXISTS idx_devotees_samaj ON devotees(samaj_id);
CREATE INDEX IF NOT EXISTS idx_devotees_category ON devotees(category_id);
