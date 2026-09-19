// Every endpoint, every consumer contract.
//
// The point of this suite is not only that each route answers. It is that it
// answers with the exact field names the dashboard and the field app read.
// A renamed field is invisible to a route test and fatal on stage, so each
// contract block below lists the keys its consumer actually destructures.
//
// Usage: node test/api.test.mjs      (the API must be running)

const API = process.env.API_BASE || "http://localhost:4000";

let pass = 0, fail = 0;
const results = [];
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  results.push({ ok, label, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const has = (obj, keys, label) => {
  const missing = keys.filter((k) => obj == null || !(k in obj));
  check(missing.length === 0, label, missing.length ? `missing: ${missing.join(", ")}` : `${keys.length} fields`);
};
const req = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") || "";
  return {
    status: res.status,
    type,
    body: type.includes("json") ? await res.json() : await res.arrayBuffer(),
  };
};
const get = (p) => req("GET", p);
const post = (p, b) => req("POST", p, b);
const section = (t) => console.log(`\n${t}`);

const stamp = Date.now().toString().slice(-6);

// ===========================================================================
section("GET /api/health");
{
  const r = await get("/api/health");
  check(r.status === 200, "200");
  check(r.body.ok === true, "reports ok");
  has(r.body, ["ok", "serverTime"], "contract: field app status dot");
}

// ===========================================================================
section("GET /api/actors");
{
  const r = await get("/api/actors");
  check(r.status === 200, "200");
  check(Array.isArray(r.body) && r.body.length === 8, "8 seeded officers", `${r.body.length}`);
  has(r.body[0], ["id", "full_name", "rank_title", "badge_no", "active"], "contract: actor row");
  check(!JSON.stringify(r.body).includes("password"), "no credentials leak in the actor list");
}

section("POST /api/actors");
{
  const r = await post("/api/actors", {
    fullName: "Test Officer", rankTitle: "Constable, Test Unit", badgeNo: `TEST-${stamp}`,
  });
  check(r.status === 201, "201 created", `${r.status}`);
  has(r.body, ["id", "full_name", "rank_title", "badge_no", "active"], "contract: created actor");
  check(r.body.active === true, "defaults to active");

  const dup = await post("/api/actors", { fullName: "Dup", badgeNo: `TEST-${stamp}` });
  check(dup.status >= 400, "duplicate badge number refused", `${dup.status}`);

  const bad = await post("/api/actors", { fullName: "No Badge" });
  check(bad.status === 400, "missing badge refused", `${bad.status}`);
}

// ===========================================================================
section("GET /api/cases  (dashboard case list)");
{
  const r = await get("/api/cases");
  check(r.status === 200, "200");
  check(r.body.length === 3, "3 seeded cases", `${r.body.length}`);
  has(r.body[0], [
    "id", "reference", "title", "forum", "opened_at", "chain_head",
    "item_count", "total_bytes", "altered_count", "broken_chain_count", "last_verified_at",
  ], "contract: dashboard case list row");
  check(typeof r.body[0].item_count === "number", "item_count is a number, not a string",
    typeof r.body[0].item_count);
  check(r.body.every((c) => ["disciplinary_panel", "fraud_investigation", "criminal"].includes(c.forum)),
    "every forum value has a plain language label in the dashboard");
}

section("POST /api/cases");
{
  const r = await post("/api/cases", {
    reference: `TEST-CASE-${stamp}`, title: "Endpoint test case", forum: "criminal",
  });
  check(r.status === 201, "201 created", `${r.status}`);
  has(r.body, ["id", "reference", "title", "forum", "opened_at"], "contract: created case");
  const bad = await post("/api/cases", { reference: "x" });
  check(bad.status === 400, "missing title and forum refused", `${bad.status}`);
}

section("GET /api/cases/:id  (dashboard case detail)");
{
  const byRef = await get("/api/cases/UI-DISC-2026-014");
  check(byRef.status === 200, "200 by reference");
  const byId = await get(`/api/cases/${byRef.body.id}`);
  check(byId.status === 200 && byId.body.reference === "UI-DISC-2026-014", "200 by uuid");

  has(byRef.body, ["id", "reference", "title", "forum", "opened_at", "items"], "contract: case detail");
  check(byRef.body.items.length === 4, "4 items", `${byRef.body.items.length}`);
  has(byRef.body.items[0], [
    "id", "reference", "description", "file_name", "file_size_bytes", "chunk_count",
    "collected_at", "sealed_at", "collector_name", "collector_badge", "event_count",
    "last_result", "last_chain_result", "last_verified_at",
  ], "contract: case detail item row");
  check(typeof byRef.body.items[0].chunk_count === "number", "chunk_count is a number");
  check(byRef.body.items.every((i) => i.event_count > 0), "every item has custody events");

  const missing = await get("/api/cases/NO-SUCH-CASE");
  check(missing.status === 404, "404 for an unknown case", `${missing.status}`);
}

section("GET /api/cases/:id/verify  (case level chain)");
{
  const r = await get("/api/cases/UI-DISC-2026-014/verify");
  check(r.status === 200, "200");
  has(r.body, [
    "caseId", "caseReference", "title", "chainIntegrity", "chainBreakAtSeq",
    "chainBreakReason", "missingItems", "recordedItems", "presentItems", "verifiedAt",
  ], "contract: CaseChainCheck component");
  check(r.body.chainIntegrity === "intact", "clean state is intact", r.body.chainIntegrity);
  check(Array.isArray(r.body.missingItems), "missingItems is always an array");
  const missing = await get("/api/cases/NOPE/verify");
  check(missing.status === 404, "404 for an unknown case", `${missing.status}`);
}

// ===========================================================================
section("GET /api/items/:id  (dashboard item detail)");
{
  const r = await get("/api/items/EX-2026-0041");
  check(r.status === 200, "200 by reference");
  has(r.body, [
    "id", "reference", "description", "file_name", "file_size_bytes", "mime_type",
    "root_hash", "chunk_size_bytes", "chunk_count", "collected_at", "sealed_at",
    "collected_by", "collection_lat", "collection_lng", "storage_path", "chain_head",
    "case_reference", "case_title", "forum", "collector_name", "collector_rank",
    "collector_badge", "last_verification",
  ], "contract: item detail page");
  check(!("chunk_hashes" in r.body), "the full chunk hash array is NOT sent to the page");
  check(r.body.chunk_count === 8, "chunk_count is 8 for the 30MB item", `${r.body.chunk_count}`);
  check(typeof r.body.file_size_bytes === "number", "file_size_bytes is a number, not a bigint string");

  const byId = await get(`/api/items/${r.body.id}`);
  check(byId.status === 200, "200 by uuid");
  const missing = await get("/api/items/EX-NOPE");
  check(missing.status === 404, "404 for an unknown item", `${missing.status}`);
}

section("GET /api/items/:id/chain  (custody timeline)");
{
  const r = await get("/api/items/EX-2026-0007/chain");
  check(r.status === 200, "200");
  has(r.body, ["itemId", "itemReference", "chainIntegrity", "chainBreakAtSeq",
    "chainBreakReason", "events"], "contract: chain response");
  has(r.body.events[0], [
    "id", "seq", "action", "note", "actorName", "actorRank", "actorBadge",
    "deviceTime", "serverTime", "fileHash", "prevHash", "eventHash",
    "correctsEvent", "correctsSeq", "linkBroken",
  ], "contract: timeline event row");
  check(r.body.events[0].prevHash === "0".repeat(64), "seq 0 prevHash is 64 zeroes");
  check(r.body.events.every((e, i) => e.seq === i), "events are ordered by seq");
  check(r.body.events.every((e) => e.linkBroken === false), "no broken links in clean state");
  check(r.body.events.slice(1).every((e, i) => e.prevHash === r.body.events[i].eventHash),
    "every event is knotted to the one before it");

  const corr = await get("/api/items/EX-2026-0009/chain");
  const c = corr.body.events.find((e) => e.action === "correction");
  check(c && c.correctsSeq === 1, "correction event resolves to the seq it corrects",
    `correctsSeq=${c?.correctsSeq}`);
}

section("GET /api/items/:id/verify");
{
  const r = await get("/api/items/EX-2026-0010/verify");
  check(r.status === 200, "200");
  has(r.body, [
    "itemId", "itemReference", "description", "fileName", "fileIntegrity",
    "expectedRootHash", "actualRootHash", "chunkCount", "chunkSizeBytes",
    "alteredChunks", "alteredByteRange", "fileSizeBytes", "fileSizeNow",
    "chainIntegrity", "chainBreakAtSeq", "chainBreakReason", "eventCount", "verifiedAt",
  ], "contract: VerifyPanel component");
  check(r.body.fileIntegrity === "altered", "the demo item reads as altered");
  check(r.body.alteredByteRange.end < r.body.fileSizeBytes,
    "the byte range never runs past the end of the file",
    `end=${r.body.alteredByteRange.end} size=${r.body.fileSizeBytes}`);

  const intact = await get("/api/items/EX-2026-0007/verify");
  check(intact.body.alteredChunks === null, "alteredChunks is null when intact");
  check(intact.body.alteredByteRange === null, "alteredByteRange is null when intact");
  check(intact.body.expectedRootHash === intact.body.actualRootHash, "roots match when intact");

  const missing = await get("/api/items/EX-NOPE/verify");
  check(missing.status === 404, "404 for an unknown item", `${missing.status}`);
}

section("GET /api/items/:id/chunks  (chunk map)");
{
  const r = await get("/api/items/EX-2026-0041/chunks");
  check(r.status === 200, "200");
  has(r.body, ["itemReference", "chunkSizeBytes", "fileIntegrity", "chunks"], "contract: chunk map");
  check(r.body.chunks.length === 8, "8 chunks", `${r.body.chunks.length}`);
  has(r.body.chunks[0], ["index", "hash", "altered", "byteStart", "byteEnd"], "contract: chunk row");
  // The final chunk is short unless the file divides exactly, so contiguity
  // is checked link by link rather than by multiplying out the chunk size.
  const item = (await get("/api/items/EX-2026-0041")).body;
  const contiguous = r.body.chunks.every((c, i) =>
    i === 0 ? c.byteStart === 0 : c.byteStart === r.body.chunks[i - 1].byteEnd + 1);
  check(contiguous, "chunk byte ranges are contiguous");
  check(r.body.chunks.at(-1).byteEnd === item.file_size_bytes - 1,
    "the last chunk ends exactly at the end of the file",
    `${r.body.chunks.at(-1).byteEnd} vs ${item.file_size_bytes - 1}`);
  check(r.body.chunks.every((c) => c.byteEnd > c.byteStart), "every range is well formed");
  check(r.body.chunks.every((c) => c.altered === false), "no altered chunks in clean state");
}

section("GET /api/items/:id/report");
{
  const res = await fetch(`${API}/api/items/EX-2026-0007/report`);
  const buf = Buffer.from(await res.arrayBuffer());
  check(res.status === 200, "200");
  check(res.headers.get("content-type") === "application/pdf", "content-type is application/pdf");
  check(buf.subarray(0, 5).toString() === "%PDF-", "body really is a PDF", `${buf.length} bytes`);
  check(res.headers.get("content-disposition")?.includes('inline; filename="EX-2026-0007.pdf"'),
    "inline disposition with the item reference as the filename");
  check(Number(res.headers.get("content-length")) === buf.length, "content-length is correct");

  const dl = await fetch(`${API}/api/items/EX-2026-0007/report?download=1`);
  check(dl.headers.get("content-disposition")?.startsWith("attachment"),
    "download=1 switches to attachment");

  const missing = await fetch(`${API}/api/items/EX-NOPE/report`);
  check(missing.status === 404, "404 for an unknown item", `${missing.status}`);

  // A report must never be generated for an item whose chain is unverified:
  // the wording on the page is driven by the verification, so it must run.
  const pdf = buf.toString("latin1");
  check(!pdf.includes("undefined") && !pdf.includes("[object Object]"),
    "no undefined or [object Object] leaked into the document");
}

// ===========================================================================
section("POST /api/items  (seal directly, metadata only)");
{
  const { createHash } = await import("node:crypto");
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  const chunkHashes = [sha("alpha"), sha("beta"), sha("gamma")];
  const merkle = sha(sha(chunkHashes[0] + chunkHashes[1]) + chunkHashes[2]); // odd promoted

  const r = await post("/api/items", {
    caseRef: "CID-2026-0041",
    reference: `EX-API-${stamp}`,
    description: "Sealed through the API directly",
    fileName: "field-collection-note.txt",
    fileSizeBytes: 854,
    mimeType: "text/plain",
    chunkHashes,
    chunkSizeBytes: 4 * 1024 * 1024,
    rootHash: merkle,
    collectedAt: new Date().toISOString(),
    collectedBy: "NPF-22841",
    storagePath: "evidence/case-c/field-collection-note.txt",
  });
  check(r.status === 201, "201 created", `${r.status}`);
  check(r.body.created === true, "created flag is true");
  check(r.body.item.root_hash === merkle, "server recomputed the same Merkle root");

  // Sealing opens the custody chain. An item whose handling record does not
  // begin at collection has a gap at the one point nobody can reconstruct.
  const sealedChain = (await get(`/api/items/EX-API-${stamp}/chain`)).body;
  check(sealedChain.events.length === 1, "sealing wrote exactly one event", `${sealedChain.events.length}`);
  check(sealedChain.events[0].action === "collected", "and that event is the collection",
    sealedChain.events[0].action);
  check(sealedChain.events[0].prevHash === "0".repeat(64), "it opens the chain at 64 zeroes");
  check(sealedChain.chainIntegrity === "intact", "the new chain verifies");

  const badRoot = await post("/api/items", {
    caseRef: "CID-2026-0041", reference: `EX-API-BAD-${stamp}`,
    description: "x", fileName: "x", fileSizeBytes: 1,
    chunkHashes, chunkSizeBytes: 4 * 1024 * 1024, rootHash: "f".repeat(64),
    collectedAt: new Date().toISOString(), collectedBy: "NPF-22841", storagePath: "x",
  });
  check(badRoot.status === 409 && badRoot.body.code === "ROOT_MISMATCH",
    "a root that disagrees with its own chunks is refused", `${badRoot.status}`);

  const noChunks = await post("/api/items", {
    caseRef: "CID-2026-0041", reference: `EX-API-NC-${stamp}`, description: "x",
    fileName: "x", fileSizeBytes: 1, chunkHashes: [], chunkSizeBytes: 4194304,
    collectedAt: new Date().toISOString(), collectedBy: "NPF-22841", storagePath: "x",
  });
  check(noChunks.status === 400, "empty chunk list refused", `${noChunks.status}`);

  const badCase = await post("/api/items", {
    caseRef: "NO-SUCH-CASE", reference: `EX-API-BC-${stamp}`, description: "x",
    fileName: "x", fileSizeBytes: 1, chunkHashes, chunkSizeBytes: 4194304,
    collectedAt: new Date().toISOString(), collectedBy: "NPF-22841", storagePath: "x",
  });
  check(badCase.status === 400, "unknown case refused", `${badCase.status}`);

  // sealing must extend the case chain, or a later deletion goes unnoticed
  const cv = await get("/api/cases/CID-2026-0041/verify");
  check(cv.body.recordedItems >= 4 && cv.body.chainIntegrity === "intact",
    "case chain extended and still intact after sealing",
    `${cv.body.recordedItems} recorded`);
}

section("POST /api/custody/events");
{
  const ref = `EX-API-${stamp}`;
  const r = await post("/api/custody/events", {
    itemRef: ref, actorRef: "NPF-19003", action: "analysed",
    note: "Examined in the laboratory", deviceTime: new Date().toISOString(),
  });
  check(r.status === 201, "201 created", `${r.status}`);
  has(r.body, ["id", "item_id", "seq", "action", "actor_id", "note", "device_time",
    "server_time", "file_hash", "prev_hash", "event_hash"], "contract: created event");
  check(r.body.seq === 1, "seq follows the collected event", `${r.body.seq}`);
  // Not "the two strings differ": a device clock set to this instant would
  // make that flaky. The point is that the server uses its OWN clock, so
  // record an event dated last year and check the server did not adopt it.
  const backdated = await post("/api/custody/events", {
    itemRef: ref, actorRef: "NPF-19003", action: "accessed",
    deviceTime: "2025-01-01T00:00:00.000Z",
  });
  const skew = Math.abs(new Date(backdated.body.server_time) - Date.now());
  check(new Date(backdated.body.device_time).getUTCFullYear() === 2025,
    "the device's own time is preserved as stated");
  check(skew < 60000, "but the server stamps its own clock, not the device's",
    `${(skew / 1000).toFixed(1)}s from now`);

  const chain = await get(`/api/items/${ref}/chain`);
  check(chain.body.chainIntegrity === "intact", "appending kept the chain verifiable");

  const badActor = await post("/api/custody/events", {
    itemRef: ref, actorRef: "NOBODY", action: "accessed", deviceTime: new Date().toISOString(),
  });
  check(badActor.status === 400, "unknown officer refused", `${badActor.status}`);

  const badAction = await post("/api/custody/events", {
    itemRef: ref, actorRef: "NPF-19003", action: "incinerated", deviceTime: new Date().toISOString(),
  });
  check(badAction.status === 400, "action outside the agreed list refused", `${badAction.status}`);

  const badItem = await post("/api/custody/events", {
    itemRef: "EX-NOPE", actorRef: "NPF-19003", action: "accessed", deviceTime: new Date().toISOString(),
  });
  check(badItem.status === 404, "unknown item refused", `${badItem.status}`);

  const badHash = await post("/api/custody/events", {
    itemRef: ref, actorRef: "NPF-19003", action: "accessed",
    deviceTime: new Date().toISOString(), eventHash: "f".repeat(64),
  });
  check(badHash.status === 409 && badHash.body.code === "HASH_MISMATCH",
    "a client supplied hash that disagrees is refused", `${badHash.status}`);
}

section("POST /api/custody/sync  (the field app's only write path)");
{
  const r = await post("/api/custody/sync", { deviceId: "field-phone-07", items: [], events: [] });
  check(r.status === 200, "an empty queue is accepted, not an error", `${r.status}`);
  has(r.body, ["deviceId", "sealed", "appended", "rejected", "syncedAt"], "contract: sync response");
  check(Array.isArray(r.body.sealed) && Array.isArray(r.body.appended) && Array.isArray(r.body.rejected),
    "sealed, appended and rejected are always arrays");

  const noBody = await fetch(`${API}/api/custody/sync`, { method: "POST" });
  check(noBody.status < 500, "a request with no body does not 500", `${noBody.status}`);
}

// ===========================================================================
section("Errors and edges");
{
  const r = await get("/api/nonsense");
  check(r.status === 404 && r.body.error === "not found", "unknown route returns a JSON 404");

  const m = await req("DELETE", "/api/items/EX-2026-0007");
  check(m.status === 404, "custody events cannot be deleted over HTTP: no such route", `${m.status}`);
  const p = await req("PUT", "/api/items/EX-2026-0007");
  check(p.status === 404, "no update route exists either", `${p.status}`);

  const bad = await fetch(`${API}/api/cases`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json",
  });
  check(bad.status >= 400 && bad.status < 500, "malformed JSON is a client error, not a crash", `${bad.status}`);

  const sqli = await get(`/api/items/${encodeURIComponent("'; DROP TABLE items; --")}`);
  check(sqli.status === 404, "injection attempt in a path parameter is just a miss", `${sqli.status}`);
  const still = await get("/api/items/EX-2026-0007");
  check(still.status === 200, "the items table is still there afterwards");

  check((await get("/api/health")).body.ok === true, "server is still healthy at the end");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFailures:");
  for (const r of results.filter((r) => !r.ok)) console.log(`  ${r.label}  ${r.detail}`);
}
process.exit(fail ? 1 : 0);
