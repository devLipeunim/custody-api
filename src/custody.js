// Writing to the chain: sealing an item and appending custody events.
//
// One rule governs everything here. The server never trusts a hash supplied
// by a client. It recomputes every event hash from the event's own fields,
// and if the client sent a hash that disagrees, the whole batch is rejected
// and flagged. A field device is a device in someone's hand; its arithmetic
// is not evidence.

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
 * Append one custody event to an item's chain.
 *
 * The item row is locked for the duration so that two devices syncing at the
 * same moment cannot both claim the same sequence number and fork the chain.
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

  // The client may send its own computed hash. We do not use it; we compare
  // against ours and reject on disagreement.
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
 * Seal a new evidence item.
 *
 * Note what is NOT here: the file itself. The field app hashes on device and
 * sends only metadata — root hash, ordered chunk hashes, size, description,
 * collector, timestamps. This sidesteps request body limits entirely and is
 * closer to how real evidence handling works, where the exhibit goes to the
 * store and the paperwork goes to the registry.
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

  // Recompute the Merkle root from the chunk hashes the device sent. If the
  // device's root disagrees with the tree its own chunks produce, the record
  // is internally inconsistent and we refuse it.
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

  // A device that syncs the same item twice must not create it twice.
  // This must run on the transaction's client, not the pool: within a sync
  // batch the item may have been created moments ago and not yet committed,
  // and a pool connection cannot see that.
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

  // Open the custody chain with the collection itself.
  //
  // An evidence item whose handling record does not begin at collection has a
  // gap at the only point that cannot be reconstructed later, and a report
  // whose first line is "examined" invites the obvious question of what
  // happened before that. Sealing and collecting are the same act, so the
  // event is written here rather than left to the caller to remember.
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
 * Batch sync from a field device.
 *
 * The whole batch is one transaction. Either the device's queue lands
 * completely or not at all, so a dropped connection halfway through cannot
 * leave a half written chain that then fails verification for no good reason.
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
        if (err.code === "ROOT_MISMATCH") throw err; // poison the batch on purpose
        rejected.push({ reference: payload.reference, error: err.message });
      }
    }

    // References sealed in THIS batch already carry a collected event,
    // written by sealItem. The device queues one too, because offline it has
    // no way to know the server will write it. Recording both would put the
    // same act in the record twice, so the duplicate is dropped here and
    // reported, rather than silently ignored.
    const sealedHere = new Set(sealed.map((s) => s.reference));

    for (const ev of events) {
      // On the client, not the pool. A field device sends an item and the
      // events for that item in one batch, so the item it refers to was
      // created earlier in THIS transaction and is not yet visible to any
      // other connection.
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
 * Record that the exhibit itself has reached the evidence store.
 *
 * Sealing records the fingerprint; this records the file. They are separate
 * acts performed by different people at different times, which is how
 * physical evidence handling already works, and an item between the two is
 * neither intact nor missing. Depositing appends a custody event, so the
 * moment the exhibit arrived is part of the record rather than a silent
 * column update.
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
