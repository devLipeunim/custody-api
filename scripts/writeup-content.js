// The technical write-up's text, separate from any renderer.
//
// The PDF build (make-writeup.js) and the Word build (make-docx.js) both read
// this, so the two cannot drift apart.

const BLOCKS = [];

const h1 = (text) => BLOCKS.push({ type: "h1", text });
const body = (text) => BLOCKS.push({ type: "body", text });
const item = (text) => BLOCKS.push({ type: "item", text });
const code = (text) => BLOCKS.push({ type: "code", text });
const kv = (label, value, labelW = 120) => BLOCKS.push({ type: "kv", label, value, labelW });
const gap = (amount = 0.25) => BLOCKS.push({ type: "gap", amount });

export const TITLE = "Custody";
export const SUBTITLE = "Proving digital evidence has not been changed";
export const BYLINE =
  "Technical write-up.  Team Captain.  ICSC 2026 Universities Hackathon, Track H.";

h1("1.  Overview");
body(
  "Custody is a chain of custody system for digital evidence. It records a cryptographic " +
  "fingerprint of an evidence file at the point of collection, maintains an append only log of " +
  "every subsequent transfer, and verifies on demand whether the file or its handling record has " +
  "changed. Verification results are presented as a single page report intended for a reader " +
  "without a technical background."
);
gap(0.25);
body(
  "The system operates without network access during collection, runs on a single machine, and " +
  "uses only open source components. It comprises three deployable units."
);
gap(0.25);
kv("Field application", "React Native and Expo SDK 57. Collection, on device chunked hashing, a " +
  "local SQLite queue and deferred synchronisation.", 110);
kv("Backend service", "Express 5 and PostgreSQL 16. Custody chain storage, verification, and " +
  "report generation.", 110);
kv("Dashboard", "Next.js 15 and TypeScript. Case and item views, custody timeline, chunk map " +
  "and verification controls.", 110);
gap(0.1);
body(
  "The three units are deployable together on a single machine, where the field application " +
  "reaches the service over the local network and the service binds to all interfaces to permit " +
  "this. The same code runs hosted: the service and its database on a managed platform, the " +
  "dashboard on a static host, with the field application configured at build time to address " +
  "the deployed service. Neither arrangement changes the integrity model, because the device " +
  "records the fingerprint before any network operation occurs."
);

h1("2.  Integrity model");
body(
  "Two properties are verified independently: whether the evidence file matches the fingerprint " +
  "recorded at collection, and whether the custody record itself has been modified. The two are " +
  "reported as separate results throughout the system."
);
gap(0.25);
kv("File integrity", "A SHA-256 Merkle root computed over the file contents at collection, " +
  "recomputed from storage on each verification and compared.", 106);
kv("Item chain", "Each custody event stores the SHA-256 hash of the preceding event. Modifying an " +
  "event invalidates all subsequent hashes; verification reports the sequence number of the first " +
  "failure.", 106);
kv("Case chain", "One event per item creation, holding the item reference as text rather than as " +
  "a foreign key. Deleting an item therefore leaves the creation record intact and the absence " +
  "detectable.", 106);
gap(0.1);
body("Event hashes are computed over a fixed field order and separator:");
code(
  "eventHash      = sha256( prevHash | itemId | actorId | action | deviceTime | fileHash )\n" +
  "caseEventHash  = sha256( prevHash | caseId | action | itemRef | itemRootHash | deviceTime )"
);
body(
  "Verification recomputes every hash from the stored field values of each event. Stored hash " +
  "values are compared against the recomputed result and are not used as inputs. Three conditions " +
  "are evaluated at each position: the recomputed hash matches the stored hash, the stored " +
  "predecessor hash matches the preceding event's hash, and the fingerprint the event records " +
  "matches the fingerprint currently held against the item. The first position at which any " +
  "condition fails is returned with a reason code, which the dashboard uses to render the break " +
  "at the corresponding entry."
);
gap(0.25);
body(
  "Custody events are append only. UPDATE and DELETE on the events table are rejected by a " +
  "database trigger rather than by application logic, so the constraint also applies to direct " +
  "database connections. Corrections are recorded as additional events referencing the corrected " +
  "event."
);
gap(0.25);
body(
  "The third condition exists because that protection is not uniform. The events table cannot be " +
  "modified, but the items table can, and it holds the fingerprint against which a file is " +
  "checked. Altering a file and updating the stored fingerprint to match would otherwise verify " +
  "as intact. Every event carries the fingerprint the item held when the event was appended, so " +
  "the protected table witnesses the unprotected one: a fingerprint edited after collection " +
  "contradicts the events, and bringing the events into agreement requires modifications the " +
  "trigger rejects."
);

h1("3.  Chunked hashing");
body(
  "Files are processed in fixed 4 MB chunks. Each chunk is hashed independently and a binary " +
  "Merkle tree is constructed over the ordered chunk hashes, with unpaired nodes promoted " +
  "unchanged to the next level. The tree root is stored as the item fingerprint and the ordered " +
  "chunk hashes are retained alongside it. The design yields three properties."
);
gap(0.25);
item("Constant memory. The complete file is never resident. Measured peak heap growth while " +
  "hashing a 30 MB input was below 1 MB.");
item("Change localisation. A single byte modification at offset 21,000,000 of a 30 MB file " +
  "resolves to chunk 6 of 8, byte range 20,971,520 to 25,165,823. Verification returns the " +
  "affected chunk indices and the corresponding byte range rather than a boolean result.");
item("Resumability. Chunk hashes are independent, so verification of a partially processed file " +
  "can be resumed.");
gap(0.25);
body(
  "Testing was performed at 30 MB. Behaviour at larger sizes is inferred from the memory profile " +
  "rather than measured; a 100 GB input was not processed."
);
gap(0.25);
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
gap(0.25);
body(
  "Evidence files are not transmitted. The client sends the Merkle root, the ordered chunk hashes, " +
  "file size, collector identity and timestamps. This removes any dependency on request size " +
  "limits and reflects the separation between an exhibit and its documentation."
);
gap(0.25);
body(
  "Two timestamps are recorded for each item: the device clock at collection and the server clock " +
  "at receipt. Both are stored and both appear in the report, including the interval between " +
  "them. Device clocks are not independently verifiable and are not presented as authoritative."
);
gap(0.25);
body(
  "A device cannot determine the storage layout of the evidence store, so a synchronised item " +
  "carries no storage path until the exhibit is deposited through a separate endpoint, which " +
  "records the path and appends a custody event. Verification distinguishes four states."
);
gap(0.2);
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
gap(0.25);
body(
  "Enumeration values and ISO 8601 timestamps are mapped to natural language before rendering. " +
  "Automated tests assert that neither form appears in the report or in the dashboard."
);

h1("6.  Testing");
body(
  "246 assertions across seven suites. Assertions cover response field names as well as " +
  "behaviour, so an interface change between components is detected by the suite rather than at " +
  "runtime."
);
gap(0.2);
kv("Hash parity", "13 assertions. The field application's hashing implementation is reimplemented " +
  "in Node and compared against the backend across real files and tree widths of 1, 2, 3, 5, 7, 8 " +
  "and 9 chunks.", 104);
kv("Tampering", "6 assertions over synthetic chains: an unmodified chain, an edited event, a " +
  "removed event, a fingerprint edited after collection, and the rewrite that would be needed to " +
  "conceal it.", 104);
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
kv("Privileged access", "Single record edits are detected: the events table is append only and " +
  "witnesses the item fingerprint, so altering it in isolation is reported. An actor able to " +
  "drop the trigger and rewrite every table could still reconstruct a consistent chain. Periodic " +
  "publication of root hashes to an external location would mitigate this and is not " +
  "implemented.", 118);
gap(0.1);
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
  "npm test && npm run test:web && npm run test:acceptance                    # 246 assertions");
body(
  "Setup instructions, the demonstration procedure and the testing guide are included in the " +
  "repository as README.md, DEMO.md and TESTING.md."
);

export const WRITEUP = BLOCKS;
