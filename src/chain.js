// The custody chain: beads knotted onto a string.
//
// Every custody event stores the hash of the event before it. Change any
// event in the middle and every hash after it breaks, and we can point at
// exactly where. This is the entire cryptographic content of the custody
// trail and it is about fifteen lines.

import { sha256, ZERO_HASH } from "./hash.js";

export { ZERO_HASH };

/** Timestamps must hash identically however Postgres hands them back. */
function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * The link. Order and separator are fixed forever: change either one and
 * every chain ever written becomes unverifiable.
 */
export function eventHash({ prevHash, itemId, actorId, action, deviceTime, fileHash }) {
  return sha256(
    [prevHash, itemId, actorId, action, iso(deviceTime), fileHash ?? ""].join("|")
  );
}

/** The case level equivalent, so that deleting a whole item is detectable. */
export function caseEventHash({ prevHash, caseId, action, itemReference, itemRootHash, deviceTime }) {
  return sha256(
    [prevHash, caseId, action, itemReference, itemRootHash, iso(deviceTime)].join("|")
  );
}

/**
 * Recompute a chain from scratch and report the first break.
 *
 * We deliberately do not trust any stored event_hash. We recompute every one
 * of them from the event's own fields and check two things at each step:
 * that the recorded hash matches what the contents produce, and that the
 * event's prev_hash matches the previous event's hash. The first failure is
 * reported with the reason, because "broken at seq 2" is what makes the
 * timeline render a visible break at the right link.
 */
export function verifyChain(events) {
  let prev = ZERO_HASH;
  for (const event of events) {
    const expected = eventHash({
      prevHash: event.prev_hash,
      itemId: event.item_id,
      actorId: event.actor_id,
      action: event.action,
      deviceTime: event.device_time,
      fileHash: event.file_hash,
    });
    if (event.prev_hash !== prev) {
      return {
        integrity: "broken",
        breakAtSeq: event.seq,
        reason: "link_mismatch", // this event does not point at the one before it
      };
    }
    if (event.event_hash !== expected) {
      return {
        integrity: "broken",
        breakAtSeq: event.seq,
        reason: "content_modified", // the event's contents no longer produce its hash
      };
    }
    prev = event.event_hash;
  }
  return { integrity: "intact", breakAtSeq: null, reason: null, head: prev };
}

/**
 * Verify a case level chain and additionally report items the chain records
 * but which no longer exist in the items table. That is how an outright
 * deletion is caught: the bead is gone, but the knot it was tied into
 * remains.
 */
export function verifyCaseChain(caseEvents, existingItemReferences) {
  let prev = ZERO_HASH;
  const present = new Set(existingItemReferences);
  const missingItems = [];

  for (const event of caseEvents) {
    const expected = caseEventHash({
      prevHash: event.prev_hash,
      caseId: event.case_id,
      action: event.action,
      itemReference: event.item_reference,
      itemRootHash: event.item_root_hash,
      deviceTime: event.device_time,
    });
    if (event.prev_hash !== prev) {
      return { integrity: "broken", breakAtSeq: event.seq, reason: "link_mismatch", missingItems };
    }
    if (event.event_hash !== expected) {
      return { integrity: "broken", breakAtSeq: event.seq, reason: "content_modified", missingItems };
    }
    if (!present.has(event.item_reference)) missingItems.push(event.item_reference);
    prev = event.event_hash;
  }

  return {
    integrity: missingItems.length > 0 ? "broken" : "intact",
    breakAtSeq: null,
    reason: missingItems.length > 0 ? "item_deleted" : null,
    missingItems,
    head: prev,
  };
}
