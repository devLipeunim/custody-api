// Tampering cases for verifyChain, over synthetic events so no database is
// needed. Covers the three ways a chain fails and the one way it holds.
import { eventHash, verifyChain, ZERO_HASH } from "../src/chain.js";

const ITEM = "item-1";
const ROOT = "a".repeat(64);

/** Build a well formed chain of n events over one root hash. */
function chain(n, rootHash = ROOT) {
  const events = [];
  let prev = ZERO_HASH;
  for (let seq = 0; seq < n; seq += 1) {
    const event = {
      seq,
      item_id: ITEM,
      actor_id: "actor-1",
      action: seq === 0 ? "collected" : "accessed",
      device_time: new Date(Date.UTC(2026, 2, 3, 14, seq)).toISOString(),
      file_hash: rootHash,
      prev_hash: prev,
    };
    event.event_hash = eventHash({
      prevHash: event.prev_hash,
      itemId: event.item_id,
      actorId: event.actor_id,
      action: event.action,
      deviceTime: event.device_time,
      fileHash: event.file_hash,
    });
    prev = event.event_hash;
    events.push(event);
  }
  return events;
}

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
}

const report = ({ integrity, breakAtSeq, reason }) => ({ integrity, breakAtSeq, reason });

check("an untouched chain verifies",
  report(verifyChain(chain(3), ROOT)),
  { integrity: "intact", breakAtSeq: null, reason: null });

check("a root hash edited after collection is caught",
  report(verifyChain(chain(3), "b".repeat(64))),
  { integrity: "broken", breakAtSeq: 0, reason: "fingerprint_contradicted" });

// An attacker who edits items.root_hash has to rewrite every event's file_hash
// to stay consistent, and rewriting an event changes its own hash.
const rewritten = chain(3);
rewritten[1].file_hash = "b".repeat(64);
check("rewriting one event's fingerprint breaks that event's hash",
  report(verifyChain(rewritten, ROOT)),
  { integrity: "broken", breakAtSeq: 1, reason: "content_modified" });

const edited = chain(3);
edited[2].action = "exported";
check("an edited event is caught",
  report(verifyChain(edited, ROOT)),
  { integrity: "broken", breakAtSeq: 2, reason: "content_modified" });

const removed = chain(4);
removed.splice(1, 1);
check("a removed event is caught",
  report(verifyChain(removed, ROOT)),
  { integrity: "broken", breakAtSeq: 2, reason: "link_mismatch" });

// The root hash is optional, so callers that have no item to compare against
// keep the original two checks.
check("omitting the root hash keeps the chain verifiable",
  report(verifyChain(chain(3))),
  { integrity: "intact", breakAtSeq: null, reason: null });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
