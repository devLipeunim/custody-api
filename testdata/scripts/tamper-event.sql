-- DEMO ONLY. Deliberately breaks the append only guard so we can show
-- the custody chain detecting an edited event.
--
-- Run as superuser:  psql -d custody -f scripts/tamper-event.sql
-- Then re-run chain verification on item EX-2026-0007.
-- Expected result: chainIntegrity = broken, chainBreakAtSeq = 2.

ALTER TABLE custody_events DISABLE TRIGGER no_update;

-- Rewrite the actor on the third event of EX-2026-0007,
-- exactly as a dishonest clerk would try to do.
UPDATE custody_events
SET actor_id = (SELECT id FROM actors WHERE badge_no = 'UI-REG-009'),
    note     = 'Panel review, first sitting'
WHERE seq = 2
  AND item_id = (SELECT id FROM items WHERE reference = 'EX-2026-0007');

ALTER TABLE custody_events ENABLE TRIGGER no_update;

-- Note for the pitch: the event_hash column was NOT updated, because a real
-- attacker with table access would have to recompute every subsequent hash.
-- Our verifier recomputes the whole chain and reports the first break.
