// Custody API.
//
// Binds 0.0.0.0 on purpose. The field app is a phone on the same wifi and it
// reaches this process by the laptop's LAN address, not by localhost. A
// server bound to loopback is the single most common way this demo dies.

import "dotenv/config";
import express from "express";
import cors from "cors";
import os from "node:os";
import { pool } from "./db.js";
import { cases } from "./routes/cases.js";
import { items } from "./routes/items.js";
import { custody } from "./routes/custody.js";
import { actors } from "./routes/actors.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());                       // local throwaway, synthetic data only
app.use(express.json({ limit: "8mb" })); // chunk hash arrays, never files

app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT now() AS server_time");
    res.json({ ok: true, serverTime: rows[0].server_time });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.use("/api/cases", cases);
app.use("/api/items", items);
app.use("/api/custody", custody);
app.use("/api/actors", actors);

app.use((_req, res) => res.status(404).json({ error: "not found" }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message, code: err.code ?? null });
});

function lanAddress() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "127.0.0.1";
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Custody API listening on port ${PORT}`);
  console.log(`  dashboard : http://localhost:${PORT}/api/health`);
  console.log(`  field app : http://${lanAddress()}:${PORT}   <- put this in the phone`);
});
