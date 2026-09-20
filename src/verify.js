// Verification: recompute, compare, localise.
//
// Two independent questions, reported separately because they fail for
// different reasons and carry different consequences:
//
//   fileIntegrity  are the bytes on disk the bytes that were fingerprinted?
//   chainIntegrity has the handling record itself been edited?

import path from "node:path";
import { stat } from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import { query, one, many } from "./db.js";
import { fingerprintFile, compareChunks } from "./hash.js";
import { verifyChain, verifyCaseChain } from "./chain.js";

// Defaults to the pack vendored in this repository, so a deployed service can
// verify without depending on anything outside its own checkout.
const EVIDENCE_ROOT =
  process.env.EVIDENCE_ROOT ||
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "../testdata");

export function resolveEvidencePath(storagePath) {
  return path.resolve(EVIDENCE_ROOT, storagePath);
}

export async function loadItem(idOrReference) {
  return one(
    `SELECT i.*, c.reference AS case_reference, c.title AS case_title, c.forum,
            a.full_name AS collector_name, a.rank_title AS collector_rank,
            a.badge_no AS collector_badge
       FROM items i
       JOIN cases c  ON c.id = i.case_id
       JOIN actors a ON a.id = i.collected_by
      WHERE i.id::text = $1 OR i.reference = $1`,
    [idOrReference]
  );
}

export async function loadChain(itemId) {
  return many(
    `SELECT e.*, a.full_name AS actor_name, a.rank_title AS actor_rank,
            a.badge_no AS actor_badge,
            ce.seq AS corrects_seq
       FROM custody_events e
       JOIN actors a ON a.id = e.actor_id
       LEFT JOIN custody_events ce ON ce.id = e.corrects_event
      WHERE e.item_id = $1
      ORDER BY e.seq ASC`,
    [itemId]
  );
}

/** Recomputes the file fingerprint from disk and every link in the chain. */
export async function verifyItem(idOrReference, { runBy = null, record = true } = {}) {
  const item = await loadItem(idOrReference);
  if (!item) return null;

  const events = await loadChain(item.id);
  const chain = verifyChain(events);

  const expectedChunks = item.chunk_hashes;

  let fileIntegrity = "intact";
  let actualRootHash = null;
  let alteredChunks = null;
  let alteredByteRange = null;
  let fileSizeNow = null;

  try {
    if (!item.storage_path) {
      // Sealed in the field, exhibit not yet deposited. Distinct from missing,
      // which would assert that evidence had been lost.
      throw Object.assign(new Error("not deposited"), { code: "NOT_DEPOSITED" });
    }
    const filePath = resolveEvidencePath(item.storage_path);
    const info = await stat(filePath);
    fileSizeNow = info.size;
    const fp = await fingerprintFile(filePath, item.chunk_size_bytes);
    actualRootHash = fp.rootHash;
    if (fp.rootHash !== item.root_hash) {
      fileIntegrity = "altered";
      const cmp = compareChunks(expectedChunks, fp.chunkHashes, item.chunk_size_bytes);
      alteredChunks = cmp.altered;
      alteredByteRange = cmp.byteRange;
      // The final chunk is short, so the range never runs past the file end.
      if (alteredByteRange) {
        alteredByteRange.end = Math.min(alteredByteRange.end, Math.max(info.size, item.file_size_bytes) - 1);
      }
    }
  } catch (err) {
    if (err.code === "NOT_DEPOSITED") fileIntegrity = "awaiting_file";
    else if (err.code === "ENOENT") fileIntegrity = "missing";
    else throw err;
  }

  const result = {
    itemId: item.id,
    itemReference: item.reference,
    description: item.description,
    fileName: item.file_name,
    fileIntegrity,
    expectedRootHash: item.root_hash,
    actualRootHash,
    chunkCount: expectedChunks.length,
    chunkSizeBytes: item.chunk_size_bytes,
    alteredChunks,
    alteredByteRange,
    fileSizeBytes: item.file_size_bytes,
    fileSizeNow,
    depositedAt: item.deposited_at,
    storagePath: item.storage_path,
    chainIntegrity: chain.integrity,
    chainBreakAtSeq: chain.breakAtSeq,
    chainBreakReason: chain.reason,
    eventCount: events.length,
    verifiedAt: new Date().toISOString(),
  };

  if (record) {
    await query(
      `INSERT INTO verifications (id, item_id, run_at, run_by, result, altered_chunks, chain_result)
       VALUES ($1,$2,now(),$3,$4,$5,$6)`,
      [uuidv4(), item.id, runBy, fileIntegrity,
       alteredChunks ? JSON.stringify(alteredChunks) : null, chain.integrity]
    );
  }

  return result;
}

/**
 * Verify a case level chain. Catches outright deletion: the item_added event
 * survives in case_events while the item it names no longer exists.
 */
export async function verifyCase(idOrReference) {
  const kase = await one(
    `SELECT * FROM cases WHERE id::text = $1 OR reference = $2`,
    [idOrReference, idOrReference]
  );
  if (!kase) return null;

  const caseEvents = await many(
    `SELECT * FROM case_events WHERE case_id = $1 ORDER BY seq ASC`,
    [kase.id]
  );
  const present = await many(`SELECT reference FROM items WHERE case_id = $1`, [kase.id]);
  const chain = verifyCaseChain(caseEvents, present.map((r) => r.reference));

  return {
    caseId: kase.id,
    caseReference: kase.reference,
    title: kase.title,
    chainIntegrity: chain.integrity,
    chainBreakAtSeq: chain.breakAtSeq,
    chainBreakReason: chain.reason,
    missingItems: chain.missingItems,
    recordedItems: caseEvents.length,
    presentItems: present.length,
    verifiedAt: new Date().toISOString(),
  };
}
