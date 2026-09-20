// The custody chain.
//
// Every custody event stores the hash of the event before it, so altering an
// event invalidates every hash after it and the first failure locates the
// change.

import { sha256, ZERO_HASH } from "./hash.js";

export { ZERO_HASH };

/** Timestamps must hash identically however Postgres hands them back. */
function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Field order and separator are part of the format. Changing either
 * invalidates every chain already written.
 */
export function eventHash({ prevHash, itemId, actorId, action, deviceTime, fileHash }) {
  return sha256(
    [prevHash, itemId, actorId, action, iso(deviceTime), fileHash ?? ""].join("|")
  );
}

/** Case level equivalent, which makes deletion of an entire item detectable. */
export function caseEventHash({ prevHash, caseId, action, itemReference, itemRootHash, deviceTime }) {
  return sha256(
    [prevHash, caseId, action, itemReference, itemRootHash, iso(deviceTime)].join("|")
  );
}

/**
 * Recompute a chain from its events and report the first break.
 *
 * Stored event hashes are not trusted. Each is recomputed from the event's own
 * fields, and two conditions are checked at every step: the recorded hash
 * matches what the contents produce, and prev_hash matches the previous
 * event's hash.
 *
 * Pass the item's current root hash to check a third: every event carries the
 * fingerprint the item held when it was appended, so one that disagrees with
 * the item's stored root means the root was edited after the fact. Without
 * this, altering a file and updating items.root_hash to match would verify
 * clean, because nothing else compares the two records of the fingerprint.
 */
export function verifyChain(events, rootHash = null) {
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
        reason: "link_mismatch",
      };
    }
    if (event.event_hash !== expected) {
      return {
        integrity: "broken",
        breakAtSeq: event.seq,
        reason: "content_modified",
      };
    }
    if (rootHash && event.file_hash && event.file_hash !== rootHash) {
      return {
        integrity: "broken",
        breakAtSeq: event.seq,
        reason: "fingerprint_contradicted",
      };
    }
    prev = event.event_hash;
  }
  return { integrity: "intact", breakAtSeq: null, reason: null, head: prev };
}

/**
 * Verify a case level chain, additionally reporting items the chain records
 * that no longer exist in the items table.
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
