// The nine tests named in the test data pack's README, run end to end.
//
// This resets the demo, runs every check the pack specifies, and leaves the
// system in the clean demo state. Run it before every rehearsal and once more
// before presenting. Test 8 is the phone and cannot be automated from here;
// it is listed as a manual step at the end.
//
// Usage: node test/acceptance.test.mjs     (the API must be running)

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.API_BASE || "http://localhost:4000";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTDATA = process.env.EVIDENCE_ROOT || path.join(REPO, "testdata");
const PSQL = process.env.PSQL || "/opt/homebrew/opt/postgresql@16/bin/psql";

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const get = async (path) => (await fetch(`${API}${path}`, { cache: "no-store" })).json();
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, PGPASSWORD: "custody" } });
const psql = (file) =>
  sh(PSQL, ["-U", "custody", "-d", "custody", "-h", "localhost", "-q", "-f", file], TESTDATA);

console.log("\nResetting the demo to a clean state\n");
sh("./scripts/reset-demo.sh", [], REPO);

console.log("\nTest 1  verify EX-2026-0007");
{
  const v = await get("/api/items/EX-2026-0007/verify");
  check(v.fileIntegrity === "intact", "file intact", v.fileIntegrity);
  check(v.chainIntegrity === "intact", "chain intact", v.chainIntegrity);
}

console.log("\nTest 2  verify EX-2026-0010, the item left altered for the demo");
{
  const v = await get("/api/items/EX-2026-0010/verify");
  check(v.fileIntegrity === "altered", "file altered", v.fileIntegrity);
  check(JSON.stringify(v.alteredChunks) === "[0]", "chunk 0 named", JSON.stringify(v.alteredChunks));
  check(v.chainIntegrity === "intact", "chain still intact", v.chainIntegrity);
}

console.log("\nTest 3  tamper the 30MB extraction at byte 21,000,000, verify EX-2026-0041");
{
  sh("node", ["scripts/tamper-file.js", "evidence/case-c/handset-extraction.bin", "21000000"], TESTDATA);
  const v = await get("/api/items/EX-2026-0041/verify");
  check(v.fileIntegrity === "altered", "file altered", v.fileIntegrity);
  check(v.chunkCount === 8, "8 chunks", String(v.chunkCount));
  check(JSON.stringify(v.alteredChunks) === "[5]", "chunk 5 of 8 named", JSON.stringify(v.alteredChunks));
  check(v.alteredByteRange?.start === 20971520 && v.alteredByteRange?.end === 25165823,
    "byte range named", `${v.alteredByteRange?.start} to ${v.alteredByteRange?.end}`);
  check(v.chainIntegrity === "intact", "chain unaffected by a file change", v.chainIntegrity);
  // put it back so the demo starts clean
  sh("node", ["scripts/tamper-file.js", "evidence/case-c/handset-extraction.bin", "21000000"], TESTDATA);
}

console.log("\nTest 4  edit a custody event directly in the database");
{
  // the guard must bite before we deliberately disable it
  let blocked = false;
  try {
    sh(PSQL, ["-U", "custody", "-d", "custody", "-h", "localhost", "-c",
      "UPDATE custody_events SET note='edited' WHERE seq=0;"], TESTDATA);
  } catch { blocked = true; }
  check(blocked, "append only trigger refuses a normal UPDATE");

  psql("scripts/tamper-event.sql");
  const c = await get("/api/items/EX-2026-0007/chain");
  check(c.chainIntegrity === "broken", "chain broken", c.chainIntegrity);
  check(c.chainBreakAtSeq === 2, "break located at seq 2", String(c.chainBreakAtSeq));
  const v = await get("/api/items/EX-2026-0007/verify");
  check(v.fileIntegrity === "intact", "file still intact while the record is not", v.fileIntegrity);
}

console.log("\nTest 5  delete an item outright");
{
  psql("scripts/delete-item.sql");
  const c = await get("/api/cases/UI-DISC-2026-014/verify");
  check(c.chainIntegrity === "broken", "case chain broken", c.chainIntegrity);
  check(c.missingItems?.includes("EX-2026-0009"), "the deleted item is named",
    JSON.stringify(c.missingItems));
  check(c.recordedItems === 4 && c.presentItems === 3, "4 recorded, 3 present",
    `${c.recordedItems}/${c.presentItems}`);
}

console.log("\nTest 6 and 7  reports");
{
  sh("./scripts/reset-demo.sh", [], REPO);
  for (const [ref, label] of [["EX-2026-0007", "intact item"], ["EX-2026-0041", "offline collected item"]]) {
    const res = await fetch(`${API}/api/items/${ref}/report`);
    const buf = Buffer.from(await res.arrayBuffer());
    check(res.ok && buf.subarray(0, 5).toString() === "%PDF-",
      `${label} report is a PDF`, `${buf.length} bytes`);
  }
  // the offline gap must reach the page, not be quietly dropped
  const item = await get("/api/items/EX-2026-0041");
  const gap = (new Date(item.sealed_at) - new Date(item.collected_at)) / 3600000;
  check(gap > 4.5 && gap < 5, "EX-2026-0041 carries the five hour offline gap", `${gap.toFixed(2)}h`);
}

console.log("\nTest 9  reset is repeatable");
{
  const before = await get("/api/items/EX-2026-0010/verify");
  sh("./scripts/reset-demo.sh", [], REPO);
  const after = await get("/api/items/EX-2026-0010/verify");
  check(before.fileIntegrity === "altered" && after.fileIntegrity === "altered",
    "EX-2026-0010 is altered before and after a reset");
  check(before.expectedRootHash === after.expectedRootHash,
    "the stored fingerprint is identical after a reset");
  const v7 = await get("/api/items/EX-2026-0007/verify");
  check(v7.fileIntegrity === "intact" && v7.chainIntegrity === "intact",
    "EX-2026-0007 is back to intact after the chain tamper");
}

console.log(`\n${pass} passed, ${fail} failed`);
console.log("\nTest 8 is manual: seal an item in the field app with airplane mode on,");
console.log("confirm the pending badge, then turn the network on and watch it sync.\n");
process.exit(fail ? 1 : 0);
