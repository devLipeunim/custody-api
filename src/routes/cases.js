import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { many, one } from "../db.js";
import { verifyCase } from "../verify.js";

export const cases = Router();

cases.get("/", async (_req, res) => {
  // Summarised from each item's most recent verification rather than a fresh
  // rehash, which would make the list slow. Live checks run per item.
  res.json(await many(`
    SELECT c.*,
           COUNT(i.id)::int AS item_count,
           COALESCE(SUM(i.file_size_bytes), 0) AS total_bytes,
           COUNT(*) FILTER (WHERE v.result = 'altered')::int AS altered_count,
           COUNT(*) FILTER (WHERE v.chain_result = 'broken')::int AS broken_chain_count,
           MAX(v.run_at) AS last_verified_at
      FROM cases c
      LEFT JOIN items i ON i.case_id = c.id
      LEFT JOIN LATERAL (
        SELECT result, chain_result, run_at FROM verifications
         WHERE item_id = i.id ORDER BY run_at DESC LIMIT 1
      ) v ON true
     GROUP BY c.id
     ORDER BY c.opened_at DESC
  `));
});

cases.post("/", async (req, res) => {
  const { reference, title, forum, openedAt } = req.body ?? {};
  if (!reference || !title || !forum) {
    return res.status(400).json({ error: "reference, title and forum are required" });
  }
  const row = await one(
    `INSERT INTO cases (id, reference, title, forum, opened_at)
     VALUES ($1,$2,$3,$4,COALESCE($5, now())) RETURNING *`,
    [uuidv4(), reference, title, forum, openedAt ?? null]
  );
  res.status(201).json(row);
});

cases.get("/:id", async (req, res) => {
  const kase = await one(
    `SELECT * FROM cases WHERE id::text = $1 OR reference = $1`, [req.params.id]
  );
  if (!kase) return res.status(404).json({ error: "case not found" });

  const items = await many(`
    SELECT i.id, i.reference, i.description, i.file_name, i.file_size_bytes,
           i.mime_type, i.root_hash, i.chunk_size_bytes,
           jsonb_array_length(i.chunk_hashes) AS chunk_count,
           i.collected_at, i.sealed_at, i.chain_head,
           i.collection_lat, i.collection_lng,
           a.full_name AS collector_name, a.badge_no AS collector_badge,
           (SELECT COUNT(*)::int FROM custody_events e WHERE e.item_id = i.id) AS event_count,
           v.result AS last_result, v.chain_result AS last_chain_result, v.run_at AS last_verified_at
      FROM items i
      JOIN actors a ON a.id = i.collected_by
      LEFT JOIN LATERAL (
        SELECT result, chain_result, run_at FROM verifications
         WHERE item_id = i.id ORDER BY run_at DESC LIMIT 1
      ) v ON true
     WHERE i.case_id = $1
     ORDER BY i.reference
  `, [kase.id]);

  res.json({ ...kase, items });
});

// Case level chain, which detects an item deleted outright.
cases.get("/:id/verify", async (req, res) => {
  const result = await verifyCase(req.params.id);
  if (!result) return res.status(404).json({ error: "case not found" });
  res.json(result);
});
