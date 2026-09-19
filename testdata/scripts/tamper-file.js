// Alters a single byte in a file, in place, at a chosen offset.
// Used in the demo to show chunk-level detection.
// Usage: node scripts/tamper-file.js <path> [byteOffset]
//
// ES module: this copy lives inside the backend package, which sets
// "type": "module". The logic is unchanged from the original pack.
import fs from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node tamper-file.js <path> [byteOffset]");
  process.exit(1);
}

const size = fs.statSync(path).size;
const offset = process.argv[3] ? Number(process.argv[3]) : Math.floor(size / 2);

const fd = fs.openSync(path, "r+");
const buf = Buffer.alloc(1);
fs.readSync(fd, buf, 0, 1, offset);
const before = buf[0];
buf[0] = before ^ 0xff;
fs.writeSync(fd, buf, 0, 1, offset);
fs.closeSync(fd);

const CHUNK = 4 * 1024 * 1024;
console.log(`altered ${path}`);
console.log(`  byte offset : ${offset}`);
console.log(`  value       : ${before} -> ${buf[0]}`);
console.log(`  chunk index : ${Math.floor(offset / CHUNK)}`);
console.log("re-run verification. expect: altered, single chunk.");
