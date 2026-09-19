-- DEMO ONLY. Removes an entire evidence item to show that the case level
-- chain still detects the gap.
-- Run as superuser, then verify case UI-DISC-2026-014.
-- Expected: case chain broken at the position where EX-2026-0009 was created.

ALTER TABLE custody_events DISABLE TRIGGER no_update;
DELETE FROM custody_events WHERE item_id = (SELECT id FROM items WHERE reference = 'EX-2026-0009');
DELETE FROM items WHERE reference = 'EX-2026-0009';
ALTER TABLE custody_events ENABLE TRIGGER no_update;
