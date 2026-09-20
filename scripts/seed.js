// Seeds the database from the synthetic test data pack.
//
// Every evidence file is fingerprinted from its bytes as they are at seed
// time, so any deliberate alteration must be applied after seeding.
//
// Usage: node scripts/seed.js [path/to/seed.json]

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { v5 as uuidv5 } from "uuid";
import { pool, tx } from "../src/db.js";
import { fingerprintFile, CHUNK_SIZE } from "../src/hash.js";
import { eventHash, caseEventHash, ZERO_HASH } from "../src/chain.js";

// Fixed namespace: seeding is reproducible, so ids are stable across resets
// and the SQL fixtures continue to resolve.
const NS = "3f2b9c1a-5d4e-4a7b-9c6f-8e1d2a3b4c5d";
const id = (kind, key) => uuidv5(`${kind}:${key}`, NS);

const MIME = {
  ".txt": "text/plain",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".bin": "application/octet-stream",
};

const seedPath = path.resolve(process.argv[2] ?? "../custody-testdata/seed.json");
const root = path.dirname(seedPath);

const data = JSON.parse(await readFile(seedPath, "utf8"));

await tx(async (client) => {
  // Cleared in dependency order. The append only trigger fires on DELETE and
  // is disabled for this transaction alone; no request can reach this path.
  await client.query("ALTER TABLE custody_events DISABLE TRIGGER no_update");
  await client.query("DELETE FROM verifications");
  await client.query("DELETE FROM custody_events");
  await client.query("DELETE FROM case_events");
  await client.query("DELETE FROM items");
  await client.query("DELETE FROM actors");
  await client.query("DELETE FROM cases");
  await client.query("ALTER TABLE custody_events ENABLE TRIGGER no_update");

  const actorByBadge = new Map();
  for (const a of data.actors) {
    const actorId = id("actor", a.badge_no);
    actorByBadge.set(a.badge_no, actorId);
    await client.query(
      `INSERT INTO actors (id, full_name, rank_title, badge_no, active)
       VALUES ($1,$2,$3,$4,$5)`,
      [actorId, a.full_name, a.rank_title ?? null, a.badge_no, a.active ?? true]
    );
  }
  console.log(`actors  : ${data.actors.length}`);

  for (const c of data.cases) {
    const caseId = id("case", c.reference);
    await client.query(
      `INSERT INTO cases (id, reference, title, forum, opened_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [caseId, c.reference, c.title, c.forum, c.opened_at]
    );

    let casePrev = ZERO_HASH;
    let caseSeq = 0;

    for (const item of c.items) {
      const filePath = path.resolve(root, item.file);
      const fp = await fingerprintFile(filePath, CHUNK_SIZE);
      const itemId = id("item", item.reference);
      const collectedBy = actorByBadge.get(item.collected_by);
      if (!collectedBy) throw new Error(`unknown collector badge ${item.collected_by}`);

      // An item collected offline is sealed when the device regains network,
      // so events before that moment carry that server time.
      const sealedAt = item._sealed_at ?? item.collected_at;
      const serverTimeFor = (deviceTime) =>
        new Date(Math.max(Date.parse(deviceTime), Date.parse(sealedAt))).toISOString();

      await client.query(
        `INSERT INTO items (id, case_id, reference, description, file_name,
           file_size_bytes, mime_type, root_hash, chunk_size_bytes, chunk_hashes,
           collected_at, sealed_at, collected_by, collection_lat, collection_lng,
           storage_path, deposited_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$12)`,
        [
          itemId, caseId, item.reference, item.description,
          path.basename(item.file), fp.fileSizeBytes,
          MIME[path.extname(item.file)] ?? "application/octet-stream",
          fp.rootHash, fp.chunkSizeBytes, JSON.stringify(fp.chunkHashes),
          item.collected_at, sealedAt, collectedBy,
          item.collection_lat ?? null, item.collection_lng ?? null,
          item.file,
        ]
      );

      let prev = ZERO_HASH;
      const seqToEventId = new Map();
      const pendingCorrections = [];

      for (const [seq, ev] of item.events.entries()) {
        const actorId = actorByBadge.get(ev.actor);
        if (!actorId) throw new Error(`unknown actor badge ${ev.actor}`);
        const evId = id("event", `${item.reference}:${seq}`);
        const hash = eventHash({
          prevHash: prev,
          itemId,
          actorId,
          action: ev.action,
          deviceTime: ev.device_time,
          fileHash: fp.rootHash,
        });
        await client.query(
          `INSERT INTO custody_events (id, item_id, seq, action, actor_id, note,
             device_time, server_time, file_hash, prev_hash, event_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [evId, itemId, seq, ev.action, actorId, ev.note ?? null,
           ev.device_time, serverTimeFor(ev.device_time), fp.rootHash, prev, hash]
        );
        seqToEventId.set(seq, evId);
        if (ev.corrects_seq !== undefined) pendingCorrections.push([evId, ev.corrects_seq]);
        prev = hash;
      }

      // corrects_seq is a position within this item's chain. Resolved once
      // every event exists. Not a hashed field, so the chain is unaffected.
      for (const [evId, correctsSeq] of pendingCorrections) {
        await client.query("ALTER TABLE custody_events DISABLE TRIGGER no_update");
        await client.query("UPDATE custody_events SET corrects_event = $1 WHERE id = $2", [
          seqToEventId.get(correctsSeq), evId,
        ]);
        await client.query("ALTER TABLE custody_events ENABLE TRIGGER no_update");
      }

      await client.query("UPDATE items SET chain_head = $1 WHERE id = $2", [prev, itemId]);

      const ceHash = caseEventHash({
        prevHash: casePrev,
        caseId,
        action: "item_added",
        itemReference: item.reference,
        itemRootHash: fp.rootHash,
        deviceTime: item.collected_at,
      });
      await client.query(
        `INSERT INTO case_events (id, case_id, seq, action, item_reference,
           item_root_hash, device_time, server_time, prev_hash, event_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id("caseevent", `${c.reference}:${caseSeq}`), caseId, caseSeq, "item_added",
         item.reference, fp.rootHash, item.collected_at, sealedAt, casePrev, ceHash]
      );
      casePrev = ceHash;
      caseSeq += 1;

      const flag = item._demo_flag ? `  [${item._demo_flag}]` : "";
      console.log(
        `  ${item.reference}  ${String(fp.fileSizeBytes).padStart(9)} bytes  ` +
        `${String(fp.chunkHashes.length).padStart(2)} chunk(s)  ` +
        `${item.events.length} events  root ${fp.rootHash.slice(0, 12)}...${flag}`
      );
    }

    await client.query("UPDATE cases SET chain_head = $1 WHERE id = $2", [casePrev, caseId]);
    console.log(`case    : ${c.reference}  ${c.items.length} items`);
  }
});

await pool.end();
console.log("\nseed complete. All data is synthetic.");
