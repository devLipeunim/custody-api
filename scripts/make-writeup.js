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
import { WRITEUP, TITLE, SUBTITLE, BYLINE } from "./writeup-content.js";

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

doc.font("Times-Bold").fontSize(19).fillColor(INK).text(TITLE);
doc.font("Times-Roman").fontSize(11).text(SUBTITLE);
doc.moveDown(0.22);
doc.font("Times-Roman").fontSize(9).fillColor(MUTED).text(BYLINE);
doc.moveDown(0.3);
doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.5).strokeColor(RULE).stroke();
doc.moveDown(0.3);

for (const block of WRITEUP) {
  switch (block.type) {
    case "h1":   h1(block.text); break;
    case "body": body(block.text); break;
    case "item": item(block.text); break;
    case "code": code(block.text); break;
    case "kv":   kv(block.label, block.value, block.labelW); break;
    case "gap":  doc.moveDown(block.amount); break;
  }
}


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
