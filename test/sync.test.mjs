// Simulates a field device that collected an item with no network and then
// synced when the connection returned. Exercises POST /api/custody/sync the
// way the Expo app does, including the deliberate rejection paths.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTDATA = process.env.EVIDENCE_ROOT || path.join(REPO, "testdata");


const API = process.env.API_BASE || "http://localhost:4000";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const shaBytes = (b) => createHash("sha256").update(b).digest("hex");

function merkleRoot(hashes) {
  let level = [...hashes];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2)
      next.push(i + 1 < level.length ? sha(level[i] + level[i + 1]) : level[i]);
    level = next;
  }
  return level[0];
}

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

// --- the device fingerprints a file at the scene, offline ---
const FILE = path.join(TESTDATA, "evidence/case-c/field-collection-note.txt");
const bytes = readFileSync(FILE);
const chunkHashes = [shaBytes(bytes)];
const rootHash = merkleRoot(chunkHashes);
const reference = `EX-FIELD-TEST-${Date.now().toString().slice(-6)}`;
const collectedAt = new Date(Date.now() - 5 * 3600 * 1000).toISOString(); // 5 hours ago, offline

const item = {
  caseRef: "CID-2026-0041", reference,
  description: "Field collected note, sync test",
  fileName: "field-collection-note.txt", fileSizeBytes: bytes.length,
  mimeType: "text/plain", rootHash, chunkSizeBytes: 4 * 1024 * 1024,
  chunkHashes, collectedAt, collectedBy: "NPF-22841",
  collectionLat: 7.4306, collectionLng: 3.8912,
  storagePath: "evidence/case-c/field-collection-note.txt",
};

// --- sync the queue ---
const r1 = await post("/api/custody/sync", {
  deviceId: "field-phone-07",
  items: [item],
  events: [
    { itemRef: reference, actorRef: "NPF-22841", action: "collected",
      note: "Collected offline, no network at scene", deviceTime: collectedAt },
    { itemRef: reference, actorRef: "NPF-22841", action: "sealed",
      note: "Synced on return to station", deviceTime: new Date().toISOString() },
  ],
});
check(r1.status === 200, "sync accepted", `HTTP ${r1.status}`);
check(r1.body.sealed?.length === 1, "item sealed on the server");
// The device queues a collected event because, offline, it cannot know the
// server will write one when the item is sealed. The server records the
// collection once and reports the duplicate rather than dropping it silently.
check(r1.body.appended?.length === 1, "the sealed event was appended", `${r1.body.appended?.length} appended`);
check(r1.body.deduped?.length === 1 && r1.body.deduped[0].action === "collected",
  "the device's duplicate collected event was recognised, not recorded twice",
  JSON.stringify(r1.body.deduped));

// --- the server stamps its own clock, and the gap is visible ---
const detail = await (await fetch(`${API}/api/items/${reference}`)).json();
const gapHours = (new Date(detail.sealed_at) - new Date(detail.collected_at)) / 3600000;
check(gapHours > 4.5 && gapHours < 5.5, "server time differs from device time", `${gapHours.toFixed(2)}h gap recorded`);

// --- the chain the server built verifies ---
const chain = await (await fetch(`${API}/api/items/${reference}/chain`)).json();
check(chain.chainIntegrity === "intact", "server built a verifiable chain");
check(chain.events.length === 2, "the chain holds collected then sealed, once each",
  chain.events.map((e) => e.action).join(" then "));
check(chain.events[0].action === "collected" && chain.events[0].prevHash === "0".repeat(64),
  "the chain opens at the collection, with 64 zeroes");
check(chain.events[1].prevHash === chain.events[0].eventHash, "second event is knotted to the first");

const verify = await (await fetch(`${API}/api/items/${reference}/verify`)).json();
check(verify.fileIntegrity === "intact", "file verifies against the device's fingerprint");

// --- syncing the same queue twice must not duplicate the item ---
const r2 = await post("/api/custody/sync", { deviceId: "field-phone-07", items: [item], events: [] });
check(r2.body.sealed?.[0]?.created === false, "re-syncing the same item does not duplicate it");

// --- a device whose root disagrees with its own chunks is refused ---
const r3 = await post("/api/custody/sync", {
  deviceId: "field-phone-07",
  items: [{ ...item, reference: `${reference}-BAD`, rootHash: "f".repeat(64) }],
  events: [],
});
check(r3.status === 409 && r3.body.code === "ROOT_MISMATCH",
  "inconsistent fingerprint is rejected", `HTTP ${r3.status}`);

// --- an unknown actor is refused rather than silently attributed ---
const r4 = await post("/api/custody/events", {
  itemRef: reference, actorRef: "NOT-A-BADGE", action: "accessed",
  deviceTime: new Date().toISOString(),
});
check(r4.status === 400, "unknown officer is refused", `HTTP ${r4.status}`);

// --- an unknown action is refused ---
const r5 = await post("/api/custody/events", {
  itemRef: reference, actorRef: "NPF-22841", action: "shredded",
  deviceTime: new Date().toISOString(),
});
check(r5.status === 400, "unknown action is refused", `HTTP ${r5.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
