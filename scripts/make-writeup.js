// Builds the technical write-up as a PDF, for submission.
//
// A4, Times, four pages at most. The audience is a Track H reviewer, so the
// document argues and evidences the claims rather than describing where files
// live. The build fails if it runs past the limit.
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

const h1 = (t) => {
  doc.moveDown(0.75);
  doc.font("Times-Bold").fontSize(12).fillColor(INK).text(t, { width: W });
  doc.moveDown(0.3);
};
const body = (t, o = {}) =>
  doc.font("Times-Roman").fontSize(10).fillColor(o.color ?? INK)
     .text(t, { width: W, align: o.align ?? "justify", lineGap: o.lineGap ?? 1.6, ...o });
const bullet = (t) =>
  doc.font("Times-Roman").fontSize(10).fillColor(INK)
     .text(t, { width: W - 14, indent: 12, lineGap: 1.4, align: "justify" });
const code = (t) => {
  doc.moveDown(0.16);
  doc.font("Courier").fontSize(8.4).fillColor("#2a2a24").text(t, { width: W - 10, indent: 8, lineGap: 1 });
  doc.moveDown(0.16);
};
const kv = (label, value, labelW = 120) => {
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

h1("1.  The problem, and what we built");
body(
  "Cybercrime cases, fraud investigations and disciplinary panels increasingly turn on digital " +
  "evidence. That evidence is only useful if it can be shown to be genuine and unchanged since " +
  "collection. In practice it is copied onto flash drives, emailed between officers, saved on " +
  "shared machines and handed over as a folder. Whether the copy matches the original, who " +
  "touched it, and whether anything changed are unanswerable. Cases are lost on integrity " +
  "grounds, not because anyone tampered with the evidence but because nobody can prove they did not."
);
doc.moveDown(0.25);
body(
  "Custody is a working chain of custody system. Evidence is fingerprinted at the moment of " +
  "collection, on the collecting officer's own device, before the file goes anywhere else. Every " +
  "hand it passes through is recorded in a tamper evident log. Any later change is provable and " +
  "localisable to a byte range. The output is a one page document a panel member with no " +
  "technical background can read and act on. It runs on one laptop, uses only free and open " +
  "source software, and depends on no network."
);
doc.moveDown(0.25);
body(
  "There are three surfaces: a React Native field app for offline collection, an Express and " +
  "PostgreSQL backend holding the chain, and a Next.js dashboard for case officers. All of it " +
  "is built and running."
);

h1("2.  How integrity is proven");
body(
  "Two questions are answered separately throughout, because they fail for different reasons and " +
  "carry different consequences: has the file changed, and has the handling record itself been " +
  "edited? A file can be intact while its custody trail has been tampered with, and the reverse. " +
  "Collapsing them into a single indicator would conceal exactly the distinction a panel needs."
);
doc.moveDown(0.25);
kv("The fingerprint", "SHA-256 over the file's contents, taken on the collecting device before the " +
  "file is handled by anyone else, and recomputed on demand. Nothing between the scene and the " +
  "server can alter the file undetectably.", 100);
kv("The item chain", "Every custody event stores the hash of the event before it. Altering an event " +
  "invalidates every hash after it, and the first failure locates the change to an exact entry.", 100);
kv("The case chain", "One event per item creation. Its reference to the item is deliberately not a " +
  "foreign key, so the record survives the item's deletion and the gap becomes visible. Without " +
  "this, deleting an entire item would leave no trace.", 100);
doc.moveDown(0.25);
body(
  "Verification never trusts a stored hash. It recomputes every event hash from that event's own " +
  "fields and checks two conditions at each step: that the recorded hash matches what the contents " +
  "produce, and that the backward link matches the previous event's hash. The first failure is " +
  "reported with its position, which is what lets the dashboard render a visibly severed link at " +
  "the exact point the record was edited, with everything above it still verified."
);
doc.moveDown(0.25);
body(
  "Custody events are append only, enforced by a database trigger rather than by application code, " +
  "because a guard written only in the application is one a direct database connection walks past. " +
  "A mistake is corrected by appending a correction event that references the erroneous one. " +
  "Nothing is ever edited or deleted, which mirrors how physical evidence handling already works."
);

h1("3.  Large files: chunked hashing and a Merkle tree");
body(
  "A single phone extraction can exceed 100GB, so files are never hashed as one blob. A file is " +
  "read in 4MB chunks, each chunk is hashed, and a binary Merkle tree is built over the ordered " +
  "chunk hashes, with an unpaired node promoted unchanged to the next level. The root is the item " +
  "fingerprint; the chunk list is stored beside it. Three consequences follow, and each is measured " +
  "rather than asserted."
);
doc.moveDown(0.25);
bullet("Memory use stays flat as the file grows, because the whole file is never held at once. " +
  "Measured heap growth while hashing the 30MB test file was under one megabyte.");
bullet("A change is located, not merely detected. Altering a single byte at offset 21,000,000 of " +
  "the 30MB file reports chunk 6 of 8 and the range 20,971,520 to 25,165,823. In a hearing, naming " +
  "the affected part of a file is a materially different claim from reporting a mismatch.");
bullet("Verification can be paused and resumed after a power cut, because chunk hashes are " +
  "independent of one another.");
doc.moveDown(0.25);
body(
  "We tested at 30MB and extrapolated. We did not test a 100GB extraction. What is defensible is " +
  "that memory use is constant regardless of file size, and that is measured, not claimed."
);

h1("4.  Collection when there is no network");
body(
  "The requirement to work through power and network cuts is answered by the architecture rather " +
  "than by a policy. At a scene the officer taps once, the file is fingerprinted on the device, and " +
  "the record is written to local storage. No network call is anywhere on that path. Sync is a " +
  "separate, deferred, interruptible activity, and the evidence file itself is never uploaded: only " +
  "the fingerprint and metadata travel, which avoids request size limits entirely and mirrors " +
  "evidence handling, where the exhibit and the paperwork move separately."
);
doc.moveDown(0.25);
body(
  "Offline events carry the device clock, which a defence could challenge. We do not hide this. The " +
  "server stamps its own time on arrival and the report states both in words, naming the gap: " +
  "recorded on the device at 14:32, confirmed by the server four hours and thirty five minutes " +
  "later, once the connection was restored. This is a deliberate design decision, not an oversight."
);
doc.moveDown(0.25);
body(
  "The same honesty produced a distinction we did not originally have. A device seals an item at " +
  "the scene and can know nothing about the evidence store's layout, so a freshly synced item is " +
  "reported as awaiting its exhibit rather than as missing. Reporting it as missing would assert " +
  "that evidence had been lost, when in fact the paperwork had simply arrived before the exhibit."
);

h1("5.  The report");
body(
  "The brief's final audience is a magistrate or panel member who is not a technologist, so the " +
  "report is one page, in Times, with no hashes and no jargon on it. Technical detail is confined " +
  "to an appendix that can be ignored. Two things are enforced in code: no database enum reaches " +
  "the page, and no ISO timestamp does, because those are the two things that identify a document " +
  "as machine output. The dashboard is checked for the same leaks by an automated test."
);
doc.moveDown(0.2);
code(
  "Is it unchanged?            Yes. The item is identical to what was collected.\n" +
  "How do we know?            A digital fingerprint was taken at the moment of collection...\n" +
  "Who has handled it?        14 Apr 2026, 11:20   Mr T. Okonjo, collected from the handset\n" +
  "Can this list be edited?   No. Each entry is locked to the one before it.");

h1("6.  Design decisions worth defending");
kv("No blockchain", "A blockchain solves distrust between parties with no shared authority. A court " +
  "or a university panel has one. A hash chain, append only storage and periodically published " +
  "root hashes give the same tamper evidence at a fraction of the complexity, and can be explained " +
  "to a panel member in a single sentence.", 100);
kv("Local only", "No cloud dependency and no paid service. The system is demonstrated against a " +
  "local database, because demonstrating offline first architecture against a hosted one would be " +
  "a contradiction.", 100);
kv("Server authority", "The server stamps its own time and recomputes every hash rather than " +
  "accepting the client's. A device cannot know the server's identifiers before an item exists " +
  "there, so the field app sends no event hashes at all. The handset claims; the server records.", 100);

h1("7.  What we tested");
body(
  "240 assertions across six suites, all passing. The suites are not only route checks: they assert " +
  "the exact field names each consumer reads, so a renamed field fails in testing rather than in " +
  "front of an audience.",
  { color: MUTED });
doc.moveDown(0.2);
kv("Device and server parity", "13 assertions. The field app's hashing transliterated into Node and " +
  "compared against the server's on real files, including tree shape at 1, 2, 3, 5, 7, 8 and 9 " +
  "chunks. If these two implementations ever diverge, every fingerprint taken in the field becomes " +
  "unverifiable, so this is the suite that matters most.", 126);
kv("API and contracts", "104 assertions. Every endpoint, response shapes, error paths, malformed " +
  "input and injection attempts in path parameters.", 126);
kv("Offline sync", "47 assertions across two suites, one of which imports the field app's own " +
  "payload builder rather than a copy of it and posts its output at the live API.", 126);
kv("Dashboard", "53 assertions against the served HTML: no raw enum, ISO timestamp or undefined " +
  "reaching a reader, and the broken chain rendering at the correct link.", 126);
kv("Acceptance", "23 assertions. The full demonstration end to end, including the deliberate " +
  "tampering and the reset, run before every rehearsal.", 126);

h1("8.  Where the data came from");
body(
  "Everything in this system is synthetic and was generated by the team. There are no real persons, " +
  "cases, accounts, student records, transactions or personal data of any kind. Names, badge " +
  "numbers and account numbers are invented. The stand-in for a phone extraction is 30MB of random " +
  "bytes; it is not a real extraction and does not need to be, because the system fingerprints bytes " +
  "and never interprets contents. The provenance is documented in the repository README and in the " +
  "test data pack."
);

h1("9.  Honest limits");
body("All of these are true, and we would rather state them than be asked.", { color: MUTED });
doc.moveDown(0.2);
kv("Corrupt collector", "If the officer alters the file before sealing it, the system faithfully " +
  "proves the integrity of already altered evidence. We protect the chain from collection onward, " +
  "not before it. This is real and unsolved.", 112);
kv("Device clock", "Offline timestamps come from the device and can be wrong or deliberately set. " +
  "We show both clocks rather than hiding the gap, but the device time is not independently " +
  "trustworthy.", 112);
kv("Scale", "Tested at 30MB and extrapolated. A full extraction was never hashed.", 112);
kv("Per officer signing", "Events are attributable to a login, not cryptographically to a person. " +
  "Signing each event with an officer held key is the correct upgrade. We describe it; we did not " +
  "build it.", 112);
kv("Storage", "We prove change. We do not prevent deletion of the underlying file.", 112);
kv("Bulk compromise", "An attacker with full database and server access could rebuild the entire " +
  "chain consistently. Publishing periodic root hashes to an external location is the mitigation. " +
  "We describe it; we did not build it.", 112);

h1("10.  Running it");
code(
  "brew services start postgresql@16      # or: sudo service postgresql start\n" +
  "cd hackathonBackend && npm install && npm run demo:reset && npm run dev     # API  :4000\n" +
  "cd hackathonWebApp  && npm install && npm run dev                          # web  :3000\n" +
  "npm test && npm run test:web && npm run test:acceptance                    # 240 assertions");
body(
  "Full setup, the demonstration script and the testing guide are in the repository as README.md, " +
  "DEMO.md and TESTING.md."
);

const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i += 1) {
  doc.switchToPage(i);
  doc.font("Times-Roman").fontSize(7.5).fillColor(MUTED)
     .text("Custody  .  Team Captain  .  Track H", M, doc.page.height - 34, { width: W / 2 });
  doc.font("Times-Roman").fontSize(7.5).fillColor(MUTED)
     .text(`${i + 1} of ${range.count}`, M + W / 2, doc.page.height - 34, { width: W / 2, align: "right" });
}
if (range.count > MAX_PAGES) {
  console.error(`Write-up ran to ${range.count} pages, the limit is ${MAX_PAGES}.`);
  process.exitCode = 1;
}
doc.end();
console.log(`Write-up written to ${OUT}`);
console.log(`  ${range.count} of a maximum ${MAX_PAGES} pages`);
