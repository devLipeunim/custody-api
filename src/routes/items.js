import { Router } from "express";
import { many, one, tx } from "../db.js";
import { loadItem, loadChain, verifyItem } from "../verify.js";
import { sealItem, depositItem } from "../custody.js";
import { buildReport } from "../report.js";
import { verifyChain } from "../chain.js";

export const items = Router();

items.post("/", async (req, res, next) => {
  try {
    const result = await tx((client) => sealItem(client, req.body ?? {}));
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) { next(err); }
});

items.post("/:id/deposit", async (req, res, next) => {
  try {
    const { storagePath, actorRef, note } = req.body ?? {};
    const result = await tx((client) =>
      depositItem(client, { itemRef: req.params.id, storagePath, actorRef, note }));
    res.status(201).json(result);
  } catch (err) { next(err); }
});

items.get("/:id", async (req, res) => {
  const item = await loadItem(req.params.id);
  if (!item) return res.status(404).json({ error: "item not found" });
  const lastVerification = await one(
    `SELECT * FROM verifications WHERE item_id = $1 ORDER BY run_at DESC LIMIT 1`, [item.id]
  );
  // The full chunk hash list is large and the client needs only the count.
  const { chunk_hashes, ...rest } = item;
  res.json({ ...rest, chunk_count: chunk_hashes.length, last_verification: lastVerification });
});

items.get("/:id/chain", async (req, res) => {
  const item = await loadItem(req.params.id);
  if (!item) return res.status(404).json({ error: "item not found" });
  const events = await loadChain(item.id);
  const chain = verifyChain(events, item.root_hash);
  res.json({
    itemId: item.id,
    itemReference: item.reference,
    chainIntegrity: chain.integrity,
    chainBreakAtSeq: chain.breakAtSeq,
    chainBreakReason: chain.reason,
    events: events.map((e) => ({
      id: e.id, seq: e.seq, action: e.action, note: e.note,
      actorName: e.actor_name, actorRank: e.actor_rank, actorBadge: e.actor_badge,
      deviceTime: e.device_time, serverTime: e.server_time,
      fileHash: e.file_hash, prevHash: e.prev_hash, eventHash: e.event_hash,
      correctsEvent: e.corrects_event, correctsSeq: e.corrects_seq,
      // The timeline draws a broken link at and after this point.
      linkBroken: chain.integrity === "broken" && e.seq >= chain.breakAtSeq,
    })),
  });
});

items.get("/:id/verify", async (req, res) => {
  const result = await verifyItem(req.params.id, { runBy: req.query.actor ?? null });
  if (!result) return res.status(404).json({ error: "item not found" });
  res.json(result);
});

items.get("/:id/chunks", async (req, res) => {
  const item = await loadItem(req.params.id);
  if (!item) return res.status(404).json({ error: "item not found" });
  const v = await verifyItem(item.id, { record: false });
  const altered = new Set(v.alteredChunks ?? []);
  res.json({
    itemReference: item.reference,
    chunkSizeBytes: item.chunk_size_bytes,
    fileIntegrity: v.fileIntegrity,
    chunks: item.chunk_hashes.map((hash, i) => ({
      index: i,
      hash,
      altered: altered.has(i),
      byteStart: i * item.chunk_size_bytes,
      byteEnd: Math.min((i + 1) * item.chunk_size_bytes - 1, item.file_size_bytes - 1),
    })),
  });
});

items.get("/:id/report", async (req, res, next) => {
  try {
    const item = await loadItem(req.params.id);
    if (!item) return res.status(404).json({ error: "item not found" });
    const events = await loadChain(item.id);
    const verification = await verifyItem(item.id, { record: false });
    const pdf = await buildReport({
      item, events, verification,
      caseInfo: { reference: item.case_reference, title: item.case_title, forum: item.forum },
    });
    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition":
        `${req.query.download === "1" ? "attachment" : "inline"}; filename="${item.reference}.pdf"`,
    });
    res.send(pdf);
  } catch (err) { next(err); }
});
