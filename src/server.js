// Binds 0.0.0.0: the field app reaches this process by LAN address, not by
// localhost.

import cors from "cors";
import "dotenv/config";
import express from "express";
import os from "node:os";
import { autoProvision } from "./bootstrap.js";
import { pool } from "./db.js";
import { actors } from "./routes/actors.js";
import { cases } from "./routes/cases.js";
import { custody } from "./routes/custody.js";
import { items } from "./routes/items.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
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

// Provision before accepting traffic, so the first request does not arrive at
// an empty database. Failure is logged rather than fatal: a running service
// reporting its state is more useful than one that refuses to start.
try {
  await autoProvision();
} catch (err) {
  console.error("Provisioning failed:", err.message);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Custody API listening on port ${PORT}`);
  console.log(`  dashboard : http://localhost:${PORT}/api/health`);
  console.log(`  field app : http://${lanAddress()}:${PORT}`);
});
