// The one page report.
//
// This is the deliverable the track is really about. The brief's final
// audience is a magistrate or panel member who is not a technologist, so:
// one page, Times New Roman, no jargon, no hash values on the front page.
// Technical detail goes to Appendix A on page two, where it can be ignored.
//
// Times-Roman, Times-Bold and Times-Italic are three of the fourteen PDF
// base fonts. They need no font file and no embedding, which is exactly what
// this report calls for. Do not load a font.

import PDFDocument from "pdfkit";
import { plainAction, formatPlain, formatDay, formatSize, formatNumber, offlineGapSentence } from "./plain.js";

const MARGIN = 64;

export function buildReport({ item, events, verification, caseInfo }) {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title: `Evidence Integrity Report ${item.reference}`,
      Author: "Custody",
      Subject: `Chain of custody and integrity verification for ${item.reference}`,
    },
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", resolve));

  const width = doc.page.width - MARGIN * 2;
  const heading = (text) => {
    doc.moveDown(0.8);
    doc.font("Times-Bold").fontSize(12).fillColor("#000").text(text);
    doc.moveDown(0.25);
  };
  const body = (text, opts = {}) =>
    doc.font("Times-Roman").fontSize(11).fillColor("#000").text(text, { width, ...opts });

  // --- Title block -------------------------------------------------------
  doc.font("Times-Bold").fontSize(16).text(`Evidence Item: ${item.reference}`);
  doc.moveDown(0.3);
  doc.font("Times-Roman").fontSize(11).text(
    `${item.description}, recorded in ${caseInfo.reference} on ${formatDay(item.collected_at)}.`,
    { width }
  );

  doc.moveDown(0.5);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).strokeColor("#000").lineWidth(0.5).stroke();

  // --- Is it unchanged? --------------------------------------------------
  heading("Is it unchanged?");
  if (verification.fileIntegrity === "intact") {
    body("Yes. The item is identical to what was collected.");
  } else if (verification.fileIntegrity === "altered") {
    body("No. The item has been changed since it was collected.");
  } else if (verification.fileIntegrity === "awaiting_file") {
    body(
      "Not yet checked. The fingerprint was taken at the scene and is recorded, but the " +
      "item itself has not yet been deposited in the evidence store, so there is nothing " +
      "here to compare it against. The handling record below is unaffected."
    );
  } else {
    body(
      "The item was held in the evidence store and is no longer there, so it could not be " +
      "checked. This report does not say what became of it. The handling record below is " +
      "unaffected and remains readable."
    );
  }

  // --- How do we know? ---------------------------------------------------
  heading("How do we know?");
  body(
    `A digital fingerprint was taken at the moment of collection, on the collecting ` +
    `officer's own device, before the item was handled by anyone else. A fingerprint is a ` +
    `short code produced from the contents of a file. The same file always produces the ` +
    `same code, and changing a single character anywhere inside produces a completely ` +
    `different one.`
  );
  doc.moveDown(0.4);
  if (verification.fileIntegrity === "intact") {
    body(
      `That fingerprint was taken again on ${formatDay(verification.verifiedAt)} and it matched ` +
      `exactly. If a single character had been altered at any point, the two fingerprints ` +
      `would differ.`
    );
  } else if (verification.fileIntegrity === "altered") {
    const r = verification.alteredByteRange;
    const single = verification.chunkCount === 1;
    if (single) {
      // A small item is one chunk, and "part 1 of 1 differs" reads as
      // nonsense to a reader who has not been told what a chunk is. For
      // these, say plainly that the fingerprint differs.
      body(
        `That fingerprint was taken again on ${formatDay(verification.verifiedAt)} and it did not ` +
        `match. The item held in storage is not the item that was collected. Because the two ` +
        `fingerprints differ at all, at least one character of the contents has changed.`
      );
    } else {
      const many = verification.alteredChunks.length > 1;
      body(
        `That fingerprint was taken again on ${formatDay(verification.verifiedAt)} and it did not ` +
        `match. The item is divided into ${verification.chunkCount} numbered parts and each part ` +
        `is fingerprinted separately, so the change can be located rather than merely detected. ` +
        (many
          ? `Parts ${verification.alteredChunks.map((c) => c + 1).join(", ")} of ${verification.chunkCount} differ from what was collected.`
          : `Part ${verification.alteredChunks[0] + 1} of ${verification.chunkCount} differs from what was collected, and the other ` +
            `${verification.chunkCount - 1} parts are unchanged.`) +
        (r ? ` The change lies between byte ${formatNumber(r.start)} and byte ${formatNumber(r.end)} of the file.` : "")
      );
    }
    doc.moveDown(0.4);
    doc.font("Times-Italic").fontSize(11).text(
      `This report does not say who made the change or why. It says only that the item ` +
      `is not the item that was collected.`,
      { width }
    );
    doc.font("Times-Roman");
  }

  // --- Who has handled it? -----------------------------------------------
  heading("Who has handled it?");
  // Two columns: the timestamp in a fixed left column and the description
  // in its own block, so that a long entry wraps under the name rather than
  // back to the page margin. A ragged left edge here reads as sloppiness on
  // a document that is meant to be handed to a panel.
  const TIME_COL = 8;
  const TEXT_COL = 112;
  doc.font("Times-Roman").fontSize(11);
  for (const e of events) {
    const who = e.actor_rank ? `${e.actor_name}, ${e.actor_rank}` : e.actor_name;
    const y = doc.y;
    doc.text(formatPlain(e.device_time), MARGIN + TIME_COL, y, { lineBreak: false });
    doc.text(`${who}, ${plainAction(e.action)}`, MARGIN + TEXT_COL, y, {
      width: width - TEXT_COL,
    });
    if (e.action === "correction" && e.corrects_seq !== null && e.corrects_seq !== undefined) {
      doc.font("Times-Italic").fontSize(10).text(
        `This entry corrects entry ${e.corrects_seq + 1} above. The original entry was not ` +
        `removed or edited, because entries can only be added.`,
        MARGIN + TEXT_COL, doc.y, { width: width - TEXT_COL }
      );
      doc.font("Times-Roman").fontSize(11);
    }
    doc.moveDown(0.15);
  }
  doc.x = MARGIN;

  // --- The offline gap, if there is one ----------------------------------
  const firstEvent = events[0];
  const gap = firstEvent && offlineGapSentence(firstEvent.device_time, firstEvent.server_time);
  if (gap) {
    heading("A note on the times shown");
    body(gap);
  }

  // --- Can this list have been edited? -----------------------------------
  heading("Can this list have been edited?");
  if (verification.chainIntegrity === "intact") {
    body(
      `No. Each entry is locked to the one before it, in the way beads are knotted onto a ` +
      `string. Removing or changing any entry breaks the sequence, and the break is visible ` +
      `at the exact point it occurs. This sequence was checked on ` +
      `${formatDay(verification.verifiedAt)} and is unbroken from the first entry to the last.`
    );
  } else {
    const at = verification.chainBreakAtSeq;
    body(
      `The sequence is broken. Each entry is locked to the one before it, and that lock ` +
      `fails at entry ${at + 1}. ` +
      (verification.chainBreakReason === "content_modified"
        ? `Entry ${at + 1} no longer matches the record made when it was first written, which ` +
          `means its contents were changed after the fact.`
        : `Entry ${at + 1} does not follow from the entry before it, which means an entry was ` +
          `removed or inserted.`) +
      ` Everything recorded before that point remains verified. Nothing after it can be relied upon.`
    );
  }

  // --- Footer ------------------------------------------------------------
  doc.moveDown(1);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).strokeColor("#000").lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  doc.font("Times-Italic").fontSize(9).text(
    `Technical detail is in Appendix A. Report generated ${formatPlain(verification.verifiedAt)}. ` +
    `All data in this system is synthetic and was generated for demonstration.`,
    { width }
  );

  // --- Appendix A --------------------------------------------------------
  doc.addPage();
  doc.font("Times-Bold").fontSize(14).text("Appendix A: technical detail");
  doc.moveDown(0.5);
  doc.font("Times-Roman").fontSize(10);

  const row = (label, value) => {
    doc.font("Times-Bold").fontSize(10).text(label, { continued: false });
    doc.font("Times-Roman").fontSize(10).text(String(value), { indent: 12, width });
    doc.moveDown(0.2);
  };

  row("Case", `${caseInfo.reference} — ${caseInfo.title}`);
  row("Item reference", item.reference);
  row("File name", item.file_name);
  row("File size at collection", `${formatSize(item.file_size_bytes)} (${formatNumber(item.file_size_bytes)} bytes)`);
  row("Hash algorithm", "SHA-256");
  row("Chunk size", `${formatSize(item.chunk_size_bytes)} (${formatNumber(item.chunk_size_bytes)} bytes)`);
  row("Chunk count", verification.chunkCount);
  row("Merkle root at collection", item.root_hash);
  row("Merkle root at verification", verification.actualRootHash ?? "file not found");
  row("File integrity", verification.fileIntegrity);
  row("Deposited in the evidence store",
    verification.depositedAt ? new Date(verification.depositedAt).toISOString() : "not yet deposited");
  if (verification.alteredChunks?.length) {
    row("Altered chunk indices", verification.alteredChunks.join(", "));
    row("Altered byte range",
      `${formatNumber(verification.alteredByteRange.start)} to ${formatNumber(verification.alteredByteRange.end)}`);
  }
  row("Collected at (device clock)", new Date(item.collected_at).toISOString());
  row("Sealed at (server clock)", item.sealed_at ? new Date(item.sealed_at).toISOString() : "not sealed");
  if (item.collection_lat != null) row("Collection location", `${item.collection_lat}, ${item.collection_lng}`);
  row("Custody chain integrity", verification.chainIntegrity);
  if (verification.chainBreakAtSeq !== null) {
    row("Chain break at sequence", `${verification.chainBreakAtSeq} (${verification.chainBreakReason})`);
  }
  row("Custody chain head", item.chain_head ?? "none");

  doc.moveDown(0.6);
  doc.font("Times-Bold").fontSize(11).text("Custody chain, event by event");
  doc.moveDown(0.3);
  doc.font("Times-Roman").fontSize(8.5);
  for (const e of events) {
    doc.font("Times-Bold").fontSize(8.5).text(
      `[${e.seq}] ${e.action} — ${e.actor_name} (${e.actor_badge})`);
    doc.font("Times-Roman").fontSize(8.5).text(
      `device ${new Date(e.device_time).toISOString()}  server ${new Date(e.server_time).toISOString()}`,
      { indent: 10 });
    if (e.note) doc.text(`note: ${e.note}`, { indent: 10, width: width - 10 });
    doc.text(`prev  ${e.prev_hash}`, { indent: 10 });
    doc.text(`event ${e.event_hash}`, { indent: 10 });
    doc.moveDown(0.25);
  }

  doc.moveDown(0.5);
  doc.font("Times-Bold").fontSize(11).text("Method");
  doc.font("Times-Roman").fontSize(9).text(
    `The file is read in ${formatSize(item.chunk_size_bytes)} chunks and each chunk is hashed with ` +
    `SHA-256. A binary Merkle tree is built over the ordered chunk hashes, with an unpaired node ` +
    `promoted unchanged to the next level, and the root of that tree is the item fingerprint. ` +
    `Memory use is constant regardless of file size, because the whole file is never held at once. ` +
    `Each custody event stores the SHA-256 hash of the event before it, computed over the previous ` +
    `hash, item id, actor id, action, device timestamp and file hash joined by a separator. ` +
    `Verification recomputes every event hash from its stored fields rather than trusting the ` +
    `stored hash, and reports the first position at which either the recomputed hash or the ` +
    `backward link fails.`,
    { width, align: "justify" }
  );

  doc.end();
  return done.then(() => Buffer.concat(chunks));
}
