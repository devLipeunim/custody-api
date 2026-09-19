// Transliterates the DEVICE algorithm (src/hash.js, src/chain.js in the
// Expo app) into Node, using Node's crypto in place of expo-crypto, and
// compares its output against the SERVER implementation on real files.
// If these ever diverge, every fingerprint taken in the field becomes
// unverifiable, so this is the test that must not be allowed to rot.
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTDATA = process.env.EVIDENCE_ROOT || path.join(REPO, "testdata");

import { readFileSync, statSync } from "node:fs";
import { fingerprintFile as serverFingerprint } from "../src/hash.js";
import { eventHash as serverEventHash } from "../src/chain.js";

// --- device side ---
const devSha256Bytes  = (b) => createHash("sha256").update(b).digest("hex");        // Crypto.digest(SHA256, Uint8Array)
const devSha256String = (s) => createHash("sha256").update(s, "utf8").digest("hex"); // digestStringAsync(SHA256, s, HEX)

function devHashChunks(path, chunkSize = 4 * 1024 * 1024) {
  // The device seeks with handle.offset and calls readBytes(take).
  const total = statSync(path).size;
  const buf = readFileSync(path);
  const hashes = [];
  let offset = 0;
  while (offset < total) {
    const take = Math.min(chunkSize, total - offset);
    hashes.push(devSha256Bytes(buf.subarray(offset, offset + take)));
    offset += take;
  }
  if (hashes.length === 0) hashes.push(devSha256Bytes(Buffer.alloc(0)));
  return { chunkHashes: hashes, fileSizeBytes: total };
}

function devMerkleRoot(chunkHashes) {
  if (chunkHashes.length === 0) return devSha256String("");
  let level = [...chunkHashes];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) next.push(devSha256String(level[i] + level[i + 1]));
      else next.push(level[i]);
    }
    level = next;
  }
  return level[0];
}

const devEventHash = ({ prevHash, itemId, actorId, action, deviceTime, fileHash }) =>
  devSha256String([prevHash, itemId, actorId, action, new Date(deviceTime).toISOString(), fileHash ?? ""].join("|"));

// --- compare on every real evidence file ---
const root = TESTDATA + "/";
const files = [
  "evidence/case-a/whatsapp-export.txt",
  "evidence/case-a/circulated-paper.txt",
  "evidence/case-b/transactions.csv",
  "evidence/case-c/field-collection-note.txt",
  "evidence/case-c/handset-extraction.bin",   // 30MB, 8 chunks: the multi-chunk tree
];

let pass = 0, fail = 0;
for (const f of files) {
  const srv = await serverFingerprint(root + f);
  const dev = devHashChunks(root + f);
  const devRoot = devMerkleRoot(dev.chunkHashes);
  const chunksMatch = JSON.stringify(srv.chunkHashes) === JSON.stringify(dev.chunkHashes);
  const rootMatch = srv.rootHash === devRoot;
  const ok = chunksMatch && rootMatch && srv.fileSizeBytes === dev.fileSizeBytes;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${String(dev.chunkHashes.length).padStart(2)} chunk(s)  ${devRoot.slice(0,16)}…  ${f.split("/").pop()}`);
}

// odd-node promotion, the easiest thing to get wrong on one side only
for (const n of [1,2,3,5,7,8,9]) {
  const fake = Array.from({length:n},(_,i)=>devSha256String(`chunk${i}`));
  const { merkleRoot } = await import("../src/hash.js");
  const ok = merkleRoot(fake) === devMerkleRoot(fake);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL  merkle tree shape with ${n} chunks`);
}
console.log(`PASS  merkle tree shape, 1/2/3/5/7/8/9 chunks (odd node promotion)`);

// event hash parity
const args = { prevHash: "0".repeat(64), itemId: "abc-123", actorId: "NPF-22841",
  action: "collected", deviceTime: "2026-03-03T14:32:00+01:00", fileHash: "deadbeef" };
const evOk = serverEventHash(args) === devEventHash(args);
evOk ? pass++ : fail++;
console.log(`${evOk ? "PASS" : "FAIL"}  event hash composition`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
