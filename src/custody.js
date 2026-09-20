// Write path: sealing items and appending custody events.
//
// Hashes supplied by a client are never trusted. Every event hash is
// recomputed from the event's own fields, and a client hash that disagrees
// rejects the batch.

import { v4 as uuidv4 } from "uuid";
import { many, tx } from "./db.js";
import { merkleRoot, ZERO_HASH } from "./hash.js";
import { eventHash, caseEventHash } from "./chain.js";

export const ACTIONS = new Set([
  "collected", "sealed", "transferred", "accessed",
  "analysed", "returned", "exported", "correction",
]);

async function resolveActor(client, ref) {
  const { rows } = await client.query(
    `SELECT id FROM actors WHERE id::text = $1 OR badge_no = $1`, [ref]
  );
  return rows[0]?.id ?? null;
}

/**
 * Append one custody event to an item's chain. The item row is locked so that
 * concurrent syncs cannot claim the same sequence number and fork the chain.
 */
export async function appendEvent(client, { itemId, actorRef, action, note, deviceTime, correctsEvent, clientEventHash }) {
  if (!ACTIONS.has(action)) throw Object.assign(new Error(`unknown action '${action}'`), { status: 400 });

  const { rows: itemRows } = await client.query(
    `SELECT id, root_hash, chain_head FROM items WHERE id = $1 FOR UPDATE`, [itemId]
  );
  const item = itemRows[0];
  if (!item) throw Object.assign(new Error("item not found"), { status: 404 });

  const actorId = await resolveActor(client, actorRef);
  if (!actorId) throw Object.assign(new Error(`unknown actor '${actorRef}'`), { status: 400 });

  const { rows: seqRows } = await client.query(
    `SELECT COALESCE(MAX(seq) + 1, 0) AS next FROM custody_events WHERE item_id = $1`, [itemId]
  );
  const seq = Number(seqRows[0].next);
  const prevHash = item.chain_head ?? ZERO_HASH;
  const device = deviceTime ? new Date(deviceTime) : new Date();

  const hash = eventHash({
    prevHash, itemId, actorId, action, deviceTime: device, fileHash: item.root_hash,
  });

  // A client supplied hash is compared against the server's, never used.
  if (clientEventHash && clientEventHash !== hash) {
    throw Object.assign(
      new Error(`event hash mismatch for item ${itemId} seq ${seq}: client and server disagree`),
      { status: 409, code: "HASH_MISMATCH" }
    );
  }

  const id = uuidv4();
  const { rows } = await client.query(
    `INSERT INTO custody_events (id, item_id, seq, action, actor_id, note,
       device_time, server_time, file_hash, prev_hash, event_hash, corrects_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10,$11)
     RETURNING *`,
    [id, itemId, seq, action, actorId, note ?? null, device,
     item.root_hash, prevHash, hash, correctsEvent ?? null]
  );
  await client.query(`UPDATE items SET chain_head = $1 WHERE id = $2`, [hash, itemId]);
  return rows[0];
}

/**
 * Seal a new evidence item from metadata alone.
 *
 * The file is not uploaded. The device hashes on collection and sends the root
 * hash, ordered chunk hashes, size, collector and timestamps, which avoids
 * request body limits and mirrors evidence handling, where the exhibit and the
 * paperwork travel separately.
 */
export async function sealItem(client, payload) {
  const {
    caseRef, reference, description, fileName, fileSizeBytes, mimeType,
    chunkHashes, chunkSizeBytes, rootHash, collectedAt, collectedBy,
    collectionLat, collectionLng, storagePath, deviceId, collectionNote,
  } = payload;

  if (!Array.isArray(chunkHashes) || chunkHashes.length === 0) {
    throw Object.assign(new Error("chunkHashes is required and must be non-empty"), { status: 400 });
  }

  // A root that disagrees with the tree its own chunk hashes produce is
  // internally inconsistent and is refused.
  const computedRoot = merkleRoot(chunkHashes);
  if (rootHash && rootHash !== computedRoot) {
    throw Object.assign(
      new Error("root hash does not match the supplied chunk hashes"),
      { status: 409, code: "ROOT_MISMATCH" }
    );
  }

  const { rows: caseRows } = await client.query(
    `SELECT id, reference, chain_head FROM cases WHERE id::text = $1 OR reference = $1 FOR UPDATE`,
    [caseRef]
  );
  const kase = caseRows[0];
  if (!kase) throw Object.assign(new Error(`unknown case '${caseRef}'`), { status: 400 });

  const actorId = await resolveActor(client, collectedBy);
  if (!actorId) throw Object.assign(new Error(`unknown collector '${collectedBy}'`), { status: 400 });

  // Runs on the transaction client, not the pool: within a sync batch the item
  // may have been created moments ago and not yet committed.
  const { rows: dupRows } = await client.query(
    `SELECT * FROM items WHERE reference = $1`, [reference]
  );
  if (dupRows[0]) return { item: dupRows[0], created: false };

  const itemId = uuidv4();
  const device = collectedAt ? new Date(collectedAt) : new Date();

  const { rows } = await client.query(
    `INSERT INTO items (id, case_id, reference, description, file_name, file_size_bytes,
       mime_type, root_hash, chunk_size_bytes, chunk_hashes, collected_at, sealed_at,
       collected_by, collection_lat, collection_lng, storage_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12,$13,$14,$15)
     RETURNING *`,
    [itemId, kase.id, reference, description, fileName, fileSizeBytes,
     mimeType ?? null, computedRoot, chunkSizeBytes, JSON.stringify(chunkHashes),
     device, actorId, collectionLat ?? null, collectionLng ?? null,
     storagePath ?? null]
  );

  // Extend the case level chain, so that deleting this item later leaves a gap.
  const { rows: ceRows } = await client.query(
    `SELECT COALESCE(MAX(seq) + 1, 0) AS next FROM case_events WHERE case_id = $1`, [kase.id]
  );
  const caseSeq = Number(ceRows[0].next);
  const casePrev = kase.chain_head ?? ZERO_HASH;
  const ceHash = caseEventHash({
    prevHash: casePrev, caseId: kase.id, action: "item_added",
    itemReference: reference, itemRootHash: computedRoot, deviceTime: device,
  });
  await client.query(
    `INSERT INTO case_events (id, case_id, seq, action, item_reference, item_root_hash,
       device_time, server_time, prev_hash, event_hash)
     VALUES ($1,$2,$3,'item_added',$4,$5,$6,now(),$7,$8)`,
    [uuidv4(), kase.id, caseSeq, reference, computedRoot, device, casePrev, ceHash]
  );
  await client.query(`UPDATE cases SET chain_head = $1 WHERE id = $2`, [ceHash, kase.id]);

  // Sealing opens the chain with the collection itself. A handling record that
  // does not begin at collection has a gap at the one point that cannot be
  // reconstructed later.
  const collectedEvent = await appendEvent(client, {
    itemId: rows[0].id,
    actorRef: actorId,
    action: "collected",
    note: collectionNote ?? null,
    deviceTime: device,
  });

  return {
    item: { ...rows[0], chain_head: collectedEvent.event_hash },
    created: true,
    collectedEventId: collectedEvent.id,
    deviceId: deviceId ?? null,
  };
}

/**
 * Batch sync from a field device, as a single transaction. A dropped
 * connection cannot leave a partially written chain.
 */
export async function syncBatch({ deviceId, items = [], events = [] }) {
  return tx(async (client) => {
    const sealed = [];
    const appended = [];
    const rejected = [];
    const deduped = [];

    for (const payload of items) {
      try {
        const result = await sealItem(client, { ...payload, deviceId });
        sealed.push({
          reference: result.item.reference,
          itemId: result.item.id,
          created: result.created,
          sealedAt: result.item.sealed_at,
        });
      } catch (err) {
        if (err.code === "ROOT_MISMATCH") throw err; // fails the whole batch
        rejected.push({ reference: payload.reference, error: err.message });
      }
    }

    // Items sealed in this batch already carry a collected event. The device
    // queues one too, having no way offline to know the server will write it.
    // The duplicate is reported rather than silently dropped.
    const sealedHere = new Set(sealed.map((s) => s.reference));

    for (const ev of events) {
      const ref = ev.itemRef ?? ev.itemId ?? ev.itemReference;

      if (ev.action === "collected" && sealedHere.has(ref)) {
        deduped.push({ reference: ref, action: ev.action, reason: "recorded when the item was sealed" });
        continue;
      }
      const { rows: itemRows } = await client.query(
        `SELECT id FROM items WHERE id::text = $1 OR reference = $1`, [ref]
      );
      const item = itemRows[0];
      if (!item) {
        rejected.push({ event: ev, error: `unknown item '${ref}'` });
        continue;
      }
      const row = await appendEvent(client, {
        itemId: item.id,
        actorRef: ev.actorRef ?? ev.actorId ?? ev.actorBadge,
        action: ev.action,
        note: ev.note,
        deviceTime: ev.deviceTime ?? ev.device_time,
        clientEventHash: ev.eventHash,
      });
      appended.push({ id: row.id, itemId: row.item_id, seq: row.seq, serverTime: row.server_time });
    }

    return { deviceId, sealed, appended, rejected, deduped, syncedAt: new Date().toISOString() };
  });
}

/**
 * Record that the exhibit has reached the evidence store.
 *
 * Sealing records the fingerprint, this records the file. An item between the
 * two is neither intact nor missing. Appends a custody event so the arrival is
 * part of the record rather than a silent column update.
 */
export async function depositItem(client, { itemRef, storagePath, actorRef, note }) {
  const { rows } = await client.query(
    `SELECT id, storage_path FROM items WHERE id::text = $1 OR reference = $1 FOR UPDATE`,
    [itemRef]
  );
  const item = rows[0];
  if (!item) throw Object.assign(new Error("item not found"), { status: 404 });
  if (!storagePath) throw Object.assign(new Error("storagePath is required"), { status: 400 });

  await client.query(
    `UPDATE items SET storage_path = $1, deposited_at = now() WHERE id = $2`,
    [storagePath, item.id]
  );
  const event = await appendEvent(client, {
    itemId: item.id,
    actorRef,
    action: "transferred",
    note: note ?? "Exhibit deposited in the evidence store",
  });
  return { itemId: item.id, storagePath, event };
}
