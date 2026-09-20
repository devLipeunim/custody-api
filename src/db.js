// A single pg Pool, cached on globalThis so `node --watch` does not open a
// new pool on every reload.

import "dotenv/config";
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL || "postgresql://custody:custody@localhost:5432/custody";

// BIGINT as a JS number: file_size_bytes will not approach 2^53.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

// A managed database terminates TLS with a certificate this process has no
// root for, so verification is disabled for remote hosts only. Local
// connections need no TLS and enabling it there breaks them.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
const ssl = isLocal ? false : { rejectUnauthorized: false };

export const pool =
  globalThis.__custodyPool ??
  (globalThis.__custodyPool = new pg.Pool({ connectionString, ssl, max: 10 }));

export function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

export async function many(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
