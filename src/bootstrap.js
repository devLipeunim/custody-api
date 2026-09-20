// Startup provisioning for hosted deployments.
//
// Render's free plan offers no shell, so the one time setup cannot be run by
// hand. The service therefore provisions itself when it starts and finds
// either no schema, no data, or no evidence file.
//
// The evidence file matters as much as the database. It is generated rather
// than committed, and a host with an ephemeral filesystem loses it on every
// restart while the database persists. Recreating it alone would produce new
// random bytes that no longer match the stored fingerprints, so its absence
// forces a full reseed and the two stay consistent.
//
// Set AUTO_PROVISION=false to disable.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pool } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const evidenceRoot = process.env.EVIDENCE_ROOT || path.join(root, "testdata");
const largeFile = path.join(evidenceRoot, "evidence/case-c/handset-extraction.bin");

async function reason() {
  if (!existsSync(largeFile)) return "evidence file absent";
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM cases");
    if (rows[0].n === 0) return "no cases present";
  } catch (err) {
    if (err.code === "42P01") return "schema absent"; // undefined_table
    throw err;
  }
  return null;
}

function runSetup() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/deploy-setup.js")], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`deploy-setup exited with ${code}`))
    );
  });
}

/**
 * Provision the instance if it is not usable. Returns true if setup ran.
 * Never runs when the database already holds cases and the evidence file is
 * present, so an instance with data is not reset by a restart.
 */
export async function autoProvision() {
  if (process.env.AUTO_PROVISION === "false") return false;

  const why = await reason();
  if (!why) return false;

  console.log(`Provisioning: ${why}`);
  await runSetup();
  console.log("Provisioning complete");
  return true;
}
