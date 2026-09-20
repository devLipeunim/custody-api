// Chunked hashing and the Merkle tree over the chunk hashes.
//
// Files are hashed in fixed size pieces rather than whole. Memory use stays
// flat as the file grows, a change can be located to a single chunk and so to
// a byte range, and verification can be resumed because chunk hashes are
// independent of one another.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";

export const CHUNK_SIZE = 4 * 1024 * 1024;
export const ZERO_HASH = "0".repeat(64);

export function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Hash a file in fixed size chunks.
 *
 * highWaterMark is a hint, not a guarantee, so a buffer does not correspond to
 * a chunk. The running hash is carried across buffer boundaries and closed off
 * only once exactly chunkSize bytes have been written to it.
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
        next.push(level[i]);
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
 * Compare recorded chunk hashes against observed ones and localise the change.
 * Compared over the longer of the two lists, so a file that grew or shrank
 * surfaces as added or removed chunk indices.
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
