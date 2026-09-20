// The field app's payload builder against the live API.
//
// Imports the Expo app's own module rather than a copy, feeds it rows shaped
// as the device's SQLite tables hold them, and posts the result.
//
// Usage: node test/mobile.test.mjs      (the API must be running)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTDATA = process.env.EVIDENCE_ROOT || path.join(REPO, "testdata");

// Sibling repository. Set MOBILE_REPO if checked out elsewhere.
const MOBILE_REPO = process.env.MOBILE_REPO || path.resolve(REPO, "../hackathonMobile");
const { buildSyncPayload } = await import(
  path.join(MOBILE_REPO, "src/payload.js")
).catch(() => {
  console.error(`Cannot find the field app at ${MOBILE_REPO}.`);
  console.error("Set MOBILE_REPO to its checkout, or skip with SKIP_MOBILE=1.");
  process.exit(process.env.SKIP_MOBILE ? 0 : 1);
});

const API = process.env.API_BASE || "http://localhost:4000";

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const section = (t) => console.log(`\n${t}`);
const post = async (p, b) => {
  const res = await fetch(`${API}${p}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  });
  return { status: res.status, body: await res.json() };
};
const get = async (p) => {
  const res = await fetch(`${API}${p}`);
  return { status: res.status, body: await res.json() };
};

const sha = (s) => createHash("sha256").update(s).digest("hex");
const shaBytes = (b) => createHash("sha256").update(b).digest("hex");
const stamp = Date.now().toString().slice(-6);

// ===========================================================================
section("The three read endpoints the app calls");
{
  // checkServer()
  const h = await get("/api/health");
  check(h.status === 200 && h.body.ok === true, "GET /api/health drives the status dot");

  // fetchActors()
  const a = await get("/api/actors");
  check(a.status === 200 && Array.isArray(a.body), "GET /api/actors returns a list");
  check(a.body.every((x) => typeof x.badge_no === "string"),
    "every officer has a badge the app can put in collected_by");

  // fetchCases()
  const c = await get("/api/cases");
  check(c.status === 200 && c.body.every((x) => typeof x.reference === "string"),
    "GET /api/cases returns references the app can put in case_ref");
  check(c.body.some((x) => x.reference === "CID-2026-0041"),
    "the app's default case reference exists on the server");
}

// ===========================================================================
section("A scene with no signal, then a sync");
{
  // As the device holds them: chunk_hashes as JSON text, times as ISO.
  const FILE = path.join(TESTDATA, "evidence/case-c/cctv-clip-placeholder.txt");
  const bytes = readFileSync(FILE);
  const chunkHashes = [shaBytes(bytes)];
  const rootHash = chunkHashes[0]; // one chunk: the root is the chunk hash
  const reference = `EX-FIELD-${stamp}`;
  const collectedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString();

  const itemRow = {
    local_id: "abc123", reference, case_ref: "CID-2026-0041",
    description: "CCTV clip recovered at the scene",
    file_name: "cctv-clip-placeholder.txt", file_uri: "file:///tmp/x",
    file_size_bytes: bytes.length, mime_type: "text/plain",
    root_hash: rootHash, chunk_size_bytes: 4 * 1024 * 1024,
    chunk_hashes: JSON.stringify(chunkHashes),   // as SQLite holds it
    collected_at: collectedAt, collected_by: "NPF-22841",
    lat: 7.4306, lng: 3.8912, sync_state: "pending",
  };
  const eventRows = [
    { local_id: "e1", item_local: "abc123", item_ref: reference, action: "collected",
      actor_badge: "NPF-22841", note: "Collected in the field, position recorded",
      device_time: collectedAt, sync_state: "pending" },
    { local_id: "e2", item_local: "abc123", item_ref: reference, action: "transferred",
      actor_badge: "NPF-22841", note: "Carried to the station",
      device_time: new Date().toISOString(), sync_state: "pending" },
  ];

  const payload = buildSyncPayload("field-phone-07", [itemRow], eventRows);

  check(Array.isArray(payload.items[0].chunkHashes),
    "the builder turns the stored JSON text back into an array");
  check(!("eventHash" in payload.events[0]),
    "the device does not send an event hash it cannot compute correctly");
  check(payload.items[0].storagePath === null,
    "the device sends no store path, because it cannot know the store's layout",
    String(payload.items[0].storagePath));
  check(payload.items[0].fileName === "cctv-clip-placeholder.txt",
    "but it does send the file name, so the exhibit can be matched on deposit");

  const r = await post("/api/custody/sync", payload);
  check(r.status === 200, "the server accepts the device's payload verbatim", `${r.status}`);
  check(r.body.sealed.length === 1, "the item was sealed");
  check(r.body.rejected.length === 0, "nothing was rejected", JSON.stringify(r.body.rejected));
  check(r.body.appended.length === 1, "the transferred event was appended");
  check(r.body.deduped.length === 1, "the duplicate collected event was recognised");

  // What the app reads back to show "Synced" and the server timestamp
  const sealed = r.body.sealed[0];
  check(typeof sealed.itemId === "string" && typeof sealed.sealedAt === "string",
    "the response carries the item id and sealed time the app stores");
  const gapHours = (new Date(sealed.sealedAt) - new Date(collectedAt)) / 3600000;
  check(gapHours > 2.5, "the offline gap survives the round trip", `${gapHours.toFixed(2)}h`);

  // Sealed in the field: a fingerprint with no exhibit yet, which is distinct
  // from a file that was in the store and is gone.
  const v = await get(`/api/items/${reference}/verify`);
  check(v.body.fileIntegrity === "awaiting_file",
    "before deposit the item is awaiting its exhibit, not missing", v.body.fileIntegrity);
  check(v.body.expectedRootHash === rootHash, "and the stored root is the one the phone computed");
  check(v.body.chainIntegrity === "intact", "the custody chain stands regardless");

  // Depositing the exhibit is a separate act.
  const dep = await post(`/api/items/${reference}/deposit`, {
    storagePath: "evidence/case-c/cctv-clip-placeholder.txt",
    actorRef: "NPF-19003",
    note: "Exhibit received into the laboratory store",
  });
  check(dep.status === 201, "the exhibit can be deposited", `${dep.status}`);

  const v2 = await get(`/api/items/${reference}/verify`);
  check(v2.body.fileIntegrity === "intact",
    "and now the phone's fingerprint verifies against the real file", v2.body.fileIntegrity);
  check(v2.body.actualRootHash === rootHash,
    "the hash computed on the handset equals the hash computed on the server");


  const chainAfter = await get(`/api/items/${reference}/chain`);
  check(chainAfter.body.events.some((e) => e.note?.includes("deposited") || e.note?.includes("received")),
    "the deposit is in the custody record, not a silent column update");

  const chain = await get(`/api/items/${reference}/chain`);
  check(chain.body.chainIntegrity === "intact", "the resulting chain verifies");
  check(chain.body.events.map((e) => e.action).join(",").startsWith("collected,transferred"),
    "in the order the officer performed them", chain.body.events.map((e) => e.action).join(","));
}

// ===========================================================================
section("Re-syncing, which is what a flaky connection produces");
{
  const ref = `EX-FIELD-${stamp}`;
  const item = (await get(`/api/items/${ref}`)).body;
  const itemRow = {
    local_id: "abc123", reference: ref, case_ref: "CID-2026-0041",
    description: item.description, file_name: item.file_name, file_size_bytes: item.file_size_bytes,
    mime_type: item.mime_type, root_hash: item.root_hash, chunk_size_bytes: item.chunk_size_bytes,
    chunk_hashes: JSON.stringify([item.root_hash]), collected_at: item.collected_at,
    collected_by: "NPF-22841", lat: 7.4306, lng: 3.8912,
  };
  const before = (await get(`/api/items/${ref}/chain`)).body.events.length;
  const r = await post("/api/custody/sync", buildSyncPayload("field-phone-07", [itemRow], []));
  check(r.body.sealed[0].created === false, "the item is not created a second time");
  const after = (await get(`/api/items/${ref}/chain`)).body.events.length;
  check(before === after, "and no extra events appear in the chain", `${before} then ${after}`);
}

section("An empty queue, which is the common case");
{
  const r = await post("/api/custody/sync", buildSyncPayload("field-phone-07", [], []));
  check(r.status === 200, "an empty sync is not an error", `${r.status}`);
}

section("What the app does when things are wrong");
{
  // a root that disagrees with its own chunk hashes
  const bad = {
    local_id: "x", reference: `EX-FIELD-BAD-${stamp}`, case_ref: "CID-2026-0041",
    description: "x", file_name: "x.txt", file_size_bytes: 10, mime_type: "text/plain",
    root_hash: "f".repeat(64), chunk_size_bytes: 4194304,
    chunk_hashes: JSON.stringify([sha("a"), sha("b")]),
    collected_at: new Date().toISOString(), collected_by: "NPF-22841",
  };
  const r = await post("/api/custody/sync", buildSyncPayload("field-phone-07", [bad], []));
  check(r.status === 409, "an inconsistent fingerprint fails the whole batch", `${r.status}`);
  check(r.body.code === "ROOT_MISMATCH", "with a code the app can show", r.body.code);

  // an unknown case is rejected without failing the batch
  const unknown = { ...bad, reference: `EX-FIELD-UC-${stamp}`, case_ref: "NO-SUCH-CASE",
    root_hash: sha(sha("a") + sha("b")) };
  const r2 = await post("/api/custody/sync", buildSyncPayload("field-phone-07", [unknown], []));
  check(r2.status === 200 && r2.body.rejected.length === 1,
    "an unknown case is reported as rejected, not a crash", `${r2.status}`);
  check(typeof r2.body.rejected[0].error === "string",
    "with a message the app can put in sync_error", r2.body.rejected[0]?.error);

  // an unreachable server
  let refused = false;
  try {
    await fetch("http://127.0.0.1:9/api/health", { signal: AbortSignal.timeout(2000) });
  } catch { refused = true; }
  check(refused, "an unreachable server rejects rather than hanging, so the dot goes grey");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
