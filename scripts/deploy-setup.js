// One time setup for a hosted deployment.
//
// Render and similar platforms give a fresh, empty filesystem and an empty
// database. This generates the large file stand-in, loads the schema and
// seeds the synthetic data, in that order, because the seeder fingerprints
// each evidence file as it finds it and the 30MB file must therefore exist
// before seeding rather than after.
//
// Safe to run more than once: the schema drops and recreates, and the seeder
// clears before inserting.
//
// Usage: node scripts/deploy-setup.js

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const evidenceRoot = process.env.EVIDENCE_ROOT || path.join(root, "testdata");

const big = path.join(evidenceRoot, "evidence/case-c/handset-extraction.bin");
if (!existsSync(big)) {
  // 30MB of random bytes, written in 4MB pieces so this process never holds
  // more than one piece, exactly as the hasher does not.
  console.log("Generating the 30MB stand-in extraction...");
  const fd = await import("node:fs").then((m) => m.openSync(big, "w"));
  const fs = await import("node:fs");
  for (let i = 0; i < 8; i += 1) {
    const size = i === 7 ? 2 * 1024 * 1024 : 4 * 1024 * 1024;
    fs.writeSync(fd, randomBytes(size));
  }
  fs.closeSync(fd);
  console.log("  done");
} else {
  console.log("Large file already present");
}

console.log("Loading schema...");
const schema = await readFile(path.join(root, "schema.sql"), "utf8");
await pool.query(schema);
console.log("  done");

await pool.end();

console.log("Seeding...");
const { spawnSync } = await import("node:child_process");
const seed = spawnSync(process.execPath,
  [path.join(root, "scripts/seed.js"), path.join(evidenceRoot, "seed.json")],
  { stdio: "inherit" });
if (seed.status) process.exit(seed.status);

// Put EX-2026-0010 into its altered state, so a hosted instance shows the
// same thing the demo does. The seeder fingerprints the file as it finds it,
// so this must happen after seeding and never before.
console.log("\nSetting the altered demo item...");
const tamper = spawnSync(process.execPath,
  [path.join(evidenceRoot, "scripts/tamper-file.js"),
   path.join(evidenceRoot, "evidence/case-a/circulated-paper.txt"), "900"],
  { stdio: "inherit" });
process.exit(tamper.status ?? 0);
