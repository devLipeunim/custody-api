import { Router } from "express";
import { tx } from "../db.js";
import { appendEvent, syncBatch } from "../custody.js";

export const custody = Router();

custody.post("/events", async (req, res, next) => {
  try {
    const { itemId, itemRef, actorRef, action, note, deviceTime, correctsEvent, eventHash } = req.body ?? {};
    const row = await tx(async (client) => {
      const { rows } = await client.query(
        `SELECT id FROM items WHERE id::text = $1 OR reference = $1`, [itemId ?? itemRef]
      );
      if (!rows[0]) throw Object.assign(new Error("item not found"), { status: 404 });
      return appendEvent(client, {
        itemId: rows[0].id, actorRef, action, note, deviceTime,
        correctsEvent, clientEventHash: eventHash,
      });
    });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// Batch upload of a field device's queue. One transaction for the whole
// batch, so a dropped connection cannot leave a half written chain.
custody.post("/sync", async (req, res, next) => {
  try {
    res.json(await syncBatch(req.body ?? {}));
  } catch (err) { next(err); }
});
