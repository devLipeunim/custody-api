// Chunked hashing and the Merkle tree.
//
// We never hash a large evidence file as one blob. The file is read in 4MB
// pieces, each piece is hashed, and a binary tree is built over those chunk
// hashes. Three things follow from this and each one is a claim we make in
// the pitch:
//
//   1. Memory use stays flat as the file grows, because we never hold the
//      whole file at once. A 100GB extraction takes longer, not more memory.
//   2. When a file changes we can say WHICH chunk changed, and therefore
//      which byte range. "Bytes 4,194,304 to 8,388,607 were altered" is far
//      more useful in a hearing than "the hash does not match".
//   3. Verification can be paused and resumed, because chunk hashes are
//      independent of each other.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";

export const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
export const ZERO_HASH = "0".repeat(64);

export function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Hash a file in fixed size chunks, streaming.
 *
 * The stream's highWaterMark is a hint, not a guarantee, so we cannot assume
 * one buffer equals one chunk. We carry a running hash across buffer
 * boundaries and only close it off when exactly chunkSize bytes have gone in.
 * This is the part that makes the memory claim true.
 */
export async function hashChunks(path, chunkSize = CHUNK_SIZE, onProgress) {
  const hashes = [];
  let current = createHash("sha256");
  let filled = 0;
  let total = 0;

  for await (const buf of createReadStream(path, { highWaterMark: chunkSize })) {
    let offset = 0;
    while (offset < buf.length) {
      const take = Math.min(chunkSize - filled, buf.length - offset);
      current.update(buf.subarray(offset, offset + take));
      filled += take;
      offset += take;
      total += take;
      if (filled === chunkSize) {
        hashes.push(current.digest("hex"));
        current = createHash("sha256");
        filled = 0;
        if (onProgress) onProgress({ chunks: hashes.length, bytes: total });
      }
    }
  }
  // The final chunk is short unless the file divides exactly.
  if (filled > 0) {
    hashes.push(current.digest("hex"));
    if (onProgress) onProgress({ chunks: hashes.length, bytes: total });
  }
  return hashes;
}

/**
 * Build a binary Merkle tree over the chunk hashes and return the root.
 * A node with no sibling is promoted unchanged to the next level.
 */
export function merkleRoot(chunkHashes) {
  if (chunkHashes.length === 0) return sha256("");
  let level = [...chunkHashes];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(sha256(level[i] + level[i + 1]));
      } else {
        next.push(level[i]); // odd node promoted
      }
    }
    level = next;
  }
  return level[0];
}

/** Fingerprint a file: root hash plus the ordered chunk hashes behind it. */
export async function fingerprintFile(path, chunkSize = CHUNK_SIZE, onProgress) {
  const info = await stat(path);
  const chunkHashes = await hashChunks(path, chunkSize, onProgress);
  return {
    rootHash: merkleRoot(chunkHashes),
    chunkHashes,
    chunkSizeBytes: chunkSize,
    fileSizeBytes: info.size,
  };
}

/**
 * Compare the chunk hashes recorded at collection against the chunk hashes
 * observed now, and localise the change.
 *
 * A file that grew or shrank shows up as added or removed chunk indices,
 * which is why we compare over the longer of the two lists.
 */
export function compareChunks(expected, actual, chunkSize = CHUNK_SIZE) {
  const altered = [];
  const length = Math.max(expected.length, actual.length);
  for (let i = 0; i < length; i += 1) {
    if (expected[i] !== actual[i]) altered.push(i);
  }
  if (altered.length === 0) return { altered: [], byteRange: null };
  const first = altered[0];
  const last = altered[altered.length - 1];
  return {
    altered,
    byteRange: { start: first * chunkSize, end: (last + 1) * chunkSize - 1 },
  };
}
