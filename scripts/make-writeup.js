// Builds the technical write-up as a PDF for submission.
//
// A4, Times, four pages at most.
//
// Usage: node scripts/make-writeup.js [outfile]

import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? path.join(here, "../deck/custody-technical-writeup.pdf");
const MAX_PAGES = 4;

const M = 58;
const INK = "#16160f";
const MUTED = "#5a5a52";
const RULE = "#c9c9bf";

await mkdir(path.dirname(OUT), { recursive: true });
const doc = new PDFDocument({
  size: "A4", margin: M, bufferPages: true,
  info: { Title: "Custody: technical write-up", Author: "Team Captain" },
});
doc.pipe(createWriteStream(OUT));
const W = doc.page.width - M * 2;

// A heading is moved to the next page rather than left stranded at the foot
// of one with nothing beneath it.
const h1 = (t) => {
  doc.moveDown(0.75);
  if (doc.y + 64 > doc.page.maxY()) doc.addPage();
  doc.font("Times-Bold").fontSize(12).fillColor(INK).text(t, { width: W });
  doc.moveDown(0.3);
};
const body = (t, o = {}) =>
  doc.font("Times-Roman").fontSize(10).fillColor(o.color ?? INK)
     .text(t, { width: W, align: o.align ?? "justify", lineGap: o.lineGap ?? 1.6, ...o });
const item = (t) =>
  doc.font("Times-Roman").fontSize(10).fillColor(INK)
     .text(t, { width: W - 14, indent: 12, lineGap: 1.4, align: "justify" });
const code = (t) => {
  doc.moveDown(0.16);
  doc.font("Courier").fontSize(8.4).fillColor("#2a2a24").text(t, { width: W - 10, indent: 8, lineGap: 1 });
  doc.moveDown(0.16);
};
// Label and value are written at the same captured y. If a row will not fit
// in the space left, the page is broken first: otherwise the label write
// paginates, the value is then written at the previous y on the new page,
// and that paginates in turn, consuming a page per row.
const kv = (label, value, labelW = 120) => {
  doc.font("Times-Bold").fontSize(10);
  const labelHeight = doc.heightOfString(label, { width: labelW - 10, lineGap: 1.4 });
  doc.font("Times-Roman").fontSize(10);
  const valueHeight = doc.heightOfString(value, { width: W - labelW, lineGap: 1.4, align: "justify" });
  if (doc.y + Math.max(labelHeight, valueHeight) > doc.page.maxY()) doc.addPage();

  const y = doc.y;
  doc.font("Times-Bold").fontSize(10).fillColor(INK).text(label, M, y, { width: labelW - 10, lineGap: 1.4 });
  const after = doc.y;
  doc.font("Times-Roman").fontSize(10).fillColor(INK)
     .text(value, M + labelW, y, { width: W - labelW, lineGap: 1.4, align: "justify" });
  doc.y = Math.max(after, doc.y);
  doc.x = M;
  doc.moveDown(0.28);
};

doc.font("Times-Bold").fontSize(19).fillColor(INK).text("Custody");
doc.font("Times-Roman").fontSize(11).text("Proving digital evidence has not been changed");
doc.moveDown(0.22);
doc.font("Times-Roman").fontSize(9).fillColor(MUTED)
   .text("Technical write-up.  Team Captain.  ICSC 2026 Universities Hackathon, Track H.");
doc.moveDown(0.3);
doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
doc.moveDown(0.3);

h1("1.  Overview");
body(
  "Custody is a chain of custody system for digital evidence. It records a cryptographic " +
  "fingerprint of an evidence file at the point of collection, maintains an append only log of " +
  "every subsequent transfer, and verifies on demand whether the file or its handling record has " +
  "changed. Verification results are presented as a single page report intended for a reader " +
  "without a technical background."
);
doc.moveDown(0.25);
body(
  "The system operates without network access during collection, runs on a single machine, and " +
  "uses only open source components. It comprises three deployable units."
);
doc.moveDown(0.25);
kv("Field application", "React Native and Expo SDK 57. Collection, on device chunked hashing, a " +
  "local SQLite queue and deferred synchronisation.", 110);
kv("Backend service", "Express 5 and PostgreSQL 16. Custody chain storage, verification, and " +
  "report generation.", 110);
kv("Dashboard", "Next.js 15 and TypeScript. Case and item views, custody timeline, chunk map " +
  "and verification controls.", 110);
doc.moveDown(0.1);
body(
  "The field application communicates with the backend over the local network. The service binds " +
  "to all interfaces to permit this."
);

h1("2.  Integrity model");
body(
  "Two properties are verified independently: whether the evidence file matches the fingerprint " +
  "recorded at collection, and whether the custody record itself has been modified. The two are " +
  "reported as separate results throughout the system."
);
doc.moveDown(0.25);
kv("File integrity", "A SHA-256 Merkle root computed over the file contents at collection, " +
  "recomputed from storage on each verification and compared.", 106);
kv("Item chain", "Each custody event stores the SHA-256 hash of the preceding event. Modifying an " +
  "event invalidates all subsequent hashes; verification reports the sequence number of the first " +
  "failure.", 106);
kv("Case chain", "One event per item creation, holding the item reference as text rather than as " +
  "a foreign key. Deleting an item therefore leaves the creation record intact and the absence " +
  "detectable.", 106);
doc.moveDown(0.1);
body("Event hashes are computed over a fixed field order and separator:");
code(
  "eventHash      = sha256( prevHash | itemId | actorId | action | deviceTime | fileHash )\n" +
  "caseEventHash  = sha256( prevHash | caseId | action | itemRef | itemRootHash | deviceTime )"
);
body(
  "Verification recomputes every hash from the stored field values of each event. Stored hash " +
  "values are compared against the recomputed result and are not used as inputs. Two conditions " +
  "are evaluated at each position: the recomputed hash matches the stored hash, and the stored " +
  "predecessor hash matches the preceding event's hash. The first position at which either " +
  "condition fails is returned with a reason code, which the dashboard uses to render the break " +
  "at the corresponding entry."
);
doc.moveDown(0.25);
body(
  "Custody events are append only. UPDATE and DELETE on the events table are rejected by a " +
  "database trigger rather than by application logic, so the constraint also applies to direct " +
  "database connections. Corrections are recorded as additional events referencing the corrected " +
  "event."
);

h1("3.  Chunked hashing");
body(
  "Files are processed in fixed 4 MB chunks. Each chunk is hashed independently and a binary " +
  "Merkle tree is constructed over the ordered chunk hashes, with unpaired nodes promoted " +
  "unchanged to the next level. The tree root is stored as the item fingerprint and the ordered " +
  "chunk hashes are retained alongside it. The design yields three properties."
);
doc.moveDown(0.25);
item("Constant memory. The complete file is never resident. Measured peak heap growth while " +
  "hashing a 30 MB input was below 1 MB.");
item("Change localisation. A single byte modification at offset 21,000,000 of a 30 MB file " +
  "resolves to chunk 6 of 8, byte range 20,971,520 to 25,165,823. Verification returns the " +
  "affected chunk indices and the corresponding byte range rather than a boolean result.");
item("Resumability. Chunk hashes are independent, so verification of a partially processed file " +
  "can be resumed.");
doc.moveDown(0.25);
body(
  "Testing was performed at 30 MB. Behaviour at larger sizes is inferred from the memory profile " +
  "rather than measured; a 100 GB input was not processed."
);
doc.moveDown(0.25);
body(
  "The field application and the backend implement the same scheme and must produce identical " +
  "output. Two rules define the format: a chunk hash is SHA-256 over the raw chunk bytes, and " +
  "every other hash is SHA-256 over a UTF-8 string of hexadecimal digits. On device, chunks are " +
  "read through a seekable file handle; on the server, through a read stream with the running " +
  "hash carried across buffer boundaries. Equivalence is asserted by a dedicated test suite."
);

h1("4.  Collection and synchronisation");
body(
  "Collection executes entirely on the device: the file is hashed, the record is written to local " +
  "SQLite storage, and a collection event is queued. No network operation occurs in this path. " +
  "Synchronisation runs separately, is batched, and resumes automatically when the service " +
  "becomes reachable."
);
doc.moveDown(0.25);
body(
  "Evidence files are not transmitted. The client sends the Merkle root, the ordered chunk hashes, " +
  "file size, collector identity and timestamps. This removes any dependency on request size " +
  "limits and reflects the separation between an exhibit and its documentation."
);
doc.moveDown(0.25);
body(
  "Two timestamps are recorded for each item: the device clock at collection and the server clock " +
  "at receipt. Both are stored and both appear in the report, including the interval between " +
  "them. Device clocks are not independently verifiable and are not presented as authoritative."
);
doc.moveDown(0.25);
body(
  "A device cannot determine the storage layout of the evidence store, so a synchronised item " +
  "carries no storage path until the exhibit is deposited through a separate endpoint, which " +
  "records the path and appends a custody event. Verification distinguishes four states."
);
doc.moveDown(0.2);
kv("intact", "The stored file matches the fingerprint recorded at collection.", 92);
kv("altered", "It does not. Affected chunk indices and byte range are returned.", 92);
kv("awaiting_file", "Fingerprint recorded, exhibit not yet deposited.", 92);
kv("missing", "The exhibit was deposited and is no longer present in storage.", 92);

h1("5.  Reporting");
body(
  "The report is a single page and is generated server side as a PDF. It states whether the item " +
  "is unchanged, how that was established, who handled it and in what order, and whether the " +
  "handling record could have been altered. Hash values and technical parameters are confined to " +
  "an appendix."
);
doc.moveDown(0.25);
body(
  "Enumeration values and ISO 8601 timestamps are mapped to natural language before rendering. " +
  "Automated tests assert that neither form appears in the report or in the dashboard."
);

h1("6.  Testing");
body(
  "240 assertions across six suites. Assertions cover response field names as well as behaviour, " +
  "so an interface change between components is detected by the suite rather than at runtime."
);
doc.moveDown(0.2);
kv("Hash parity", "13 assertions. The field application's hashing implementation is reimplemented " +
  "in Node and compared against the backend across real files and tree widths of 1, 2, 3, 5, 7, 8 " +
  "and 9 chunks.", 104);
kv("API", "104 assertions. All endpoints, response contracts, error handling, malformed input and " +
  "injection attempts in path parameters.", 104);
kv("Synchronisation", "47 assertions across two suites. Offline collection and deferred sync, one " +
  "suite importing the field application's own payload construction module and exercising it " +
  "against the running service.", 104);
kv("Dashboard", "53 assertions against served markup, including the absence of enumeration values " +
  "and ISO timestamps, and correct rendering of a broken chain.", 104);
kv("Acceptance", "23 assertions. End to end execution including deliberate file and record " +
  "modification, item deletion, report generation and state reset.", 104);

h1("7.  Test data");
body(
  "All data in the system is synthetic and was generated for this project. It contains no real " +
  "persons, cases, accounts, records or personal data. Names, badge numbers and account numbers " +
  "are invented. The stand-in for a device extraction is 30 MB of random bytes; the system " +
  "operates on byte sequences and does not interpret file contents. Provenance is documented in " +
  "the repository."
);

h1("8.  Constraints");
kv("Pre-collection tampering", "Modification before the fingerprint is recorded produces a valid " +
  "chain over altered evidence. The system establishes integrity from collection onward only.", 118);
kv("Device clock", "Offline timestamps originate from the device and may be incorrect. Both " +
  "clocks are recorded; the device value is not treated as authoritative.", 118);
kv("Scale", "Verified at 30 MB. Larger inputs are inferred from the memory profile.", 118);
kv("Event attribution", "Events are attributed to an authenticated identity, not to a " +
  "cryptographic key held by an individual. Per officer signing is not implemented.", 118);
kv("File retention", "The system detects modification and deletion. It does not prevent either.", 118);
kv("Privileged access", "An actor with full database and server access could reconstruct a " +
  "consistent chain. Periodic publication of root hashes to an external location would mitigate " +
  "this and is not implemented.", 118);
doc.moveDown(0.1);
body(
  "A distributed ledger was considered and rejected. Such systems address the absence of a shared " +
  "trusted authority between parties. In the target settings that authority exists, and a hash " +
  "chain with append only storage provides equivalent tamper evidence at lower operational cost."
);

h1("9.  Running the system");
code(
  "brew services start postgresql@16      # or: sudo service postgresql start\n" +
  "cd hackathonBackend && npm install && npm run demo:reset && npm run dev     # API  :4000\n" +
  "cd hackathonWebApp  && npm install && npm run dev                          # web  :3000\n" +
  "npm test && npm run test:web && npm run test:acceptance                    # 240 assertions");
body(
  "Setup instructions, the demonstration procedure and the testing guide are included in the " +
  "repository as README.md, DEMO.md and TESTING.md."
);

const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i += 1) {
  doc.switchToPage(i);
  // The footer sits below the bottom margin. Without clearing that margin
  // pdfkit treats the write as overflow and appends a blank page for each.
  doc.page.margins.bottom = 0;
  doc.font("Times-Roman").fontSize(7.5).fillColor(MUTED)
     .text("Custody  .  Team Captain  .  Track H", M, doc.page.height - 34,
           { width: W / 2, lineBreak: false });
  doc.font("Times-Roman").fontSize(7.5).fillColor(MUTED)
     .text(`${i + 1} of ${range.count}`, M + W / 2, doc.page.height - 34,
           { width: W / 2, align: "right", lineBreak: false });
}

// Counted after the footer loop: writing a footer can itself append a page.
const pages = doc.bufferedPageRange().count;
if (pages > MAX_PAGES) {
  console.error(`Write-up ran to ${pages} pages, the limit is ${MAX_PAGES}.`);
  process.exitCode = 1;
}
doc.end();
console.log(`Write-up written to ${OUT}`);
console.log(`  ${pages} of a maximum ${MAX_PAGES} pages`);
