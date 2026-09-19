import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { many, one } from "../db.js";

export const actors = Router();

actors.get("/", async (_req, res) => {
  res.json(await many(
    `SELECT id, full_name, rank_title, badge_no, active FROM actors ORDER BY full_name`
  ));
});

actors.post("/", async (req, res) => {
  const { fullName, rankTitle, badgeNo, active = true } = req.body ?? {};
  if (!fullName || !badgeNo) {
    return res.status(400).json({ error: "fullName and badgeNo are required" });
  }
  const row = await one(
    `INSERT INTO actors (id, full_name, rank_title, badge_no, active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [uuidv4(), fullName, rankTitle ?? null, badgeNo, active]
  );
  res.status(201).json(row);
});
