// Builds the twelve slide deck as a PDF.
//
// Specification, from the handoff: twelve slides, 16:9, Times New Roman
// throughout, no em dashes or en dashes anywhere, dark text on a light
// background, one idea per slide, minimal text, no bullet walls. The slides
// support the speaker; they are not the submission.
//
// Generated with pdfkit rather than a browser based tool for the same reason
// the report is: the presenting laptop should not need Chromium, and Times is
// one of the fourteen PDF base fonts so nothing has to be embedded.
//
// Usage: node scripts/make-deck.js [outfile]

import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = process.argv[2] ?? new URL("../deck/custody-deck.pdf", import.meta.url).pathname;

// 16:9
const W = 960, H = 540;
const M = 72;
const INK = "#16160f";
const MUTED = "#6b6b60";
const RULE = "#c9c9bf";
const PAPER = "#fbfbf8";
const GREEN = "#1a7f37";
const RED = "#b42318";

// Every string that reaches the page passes through here, so the no dashes
// rule is enforced by the build rather than by proofreading.
const BANNED = /[—–]/;
const collected = [];
const T = (s) => { collected.push(s); return s; };

await mkdir(path.dirname(OUT), { recursive: true });
const doc = new PDFDocument({ size: [W, H], margin: 0, info: {
  Title: "Custody: proving digital evidence has not been changed",
  Author: "Custody, ICSC 2026 Track H",
} });
doc.pipe(createWriteStream(OUT));

// Each slide is a function so that a single one can be emitted on its own
// with DECK_ONLY=7, which is how the layout gets proof read without rendering
// the whole deck every time.
const SLIDES = [];
const ONLY = process.env.DECK_ONLY ? process.env.DECK_ONLY.split(",").map(Number) : null;

let slideNo = 0;
let emitted = 0;
function slide(kicker) {
  if (emitted > 0) doc.addPage({ size: [W, H], margin: 0 });
  emitted += 1;   // slideNo is set by the emit loop, so the printed number is
                  // the slide's real position even when rendering one alone
  doc.rect(0, 0, W, H).fill(PAPER);
  if (kicker) {
    doc.font("Times-Roman").fontSize(13).fillColor(MUTED)
       .text(T(kicker), M, M - 26, { width: W - M * 2, characterSpacing: 1 });
  }
  doc.font("Times-Roman").fontSize(11).fillColor(RULE)
     .text(String(slideNo), W - M - 20, H - M + 14, { width: 20, align: "right" });
  return doc;
}
const title = (s, size = 44, y = null) => {
  doc.font("Times-Bold").fontSize(size).fillColor(INK)
     .text(T(s), M, y ?? doc.y, { width: W - M * 2, lineGap: 4 });
};
const lead = (s, size = 22) => {
  doc.moveDown(0.5);
  doc.font("Times-Roman").fontSize(size).fillColor(INK)
     .text(T(s), M, doc.y, { width: W - M * 2, lineGap: 7 });
};
const note = (s, size = 15) => {
  doc.moveDown(0.6);
  doc.font("Times-Italic").fontSize(size).fillColor(MUTED)
     .text(T(s), M, doc.y, { width: W - M * 2, lineGap: 5 });
};

// ===========================================================================
// 1. Title
SLIDES.push(() => {
  slide();
  doc.font("Times-Bold").fontSize(76).fillColor(INK).text(T("Custody"), M, 168);
  doc.moveDown(0.15);
  doc.font("Times-Roman").fontSize(27).fillColor(INK)
     .text(T("Proving digital evidence has not been changed"), M, doc.y, { width: W - M * 2 });
  doc.moveTo(M, 372).lineTo(W - M, 372).lineWidth(0.75).strokeColor(RULE).stroke();
  doc.font("Times-Roman").fontSize(15).fillColor(MUTED)
     .text(T("ICSC 2026 Universities Hackathon, Track H"), M, 392);
  doc.text(T("[Team name], five members, University of Ibadan"), M, 414);


});
// ===========================================================================
// 2. The problem
SLIDES.push(() => {
  slide("The problem");
  title(T("Cases collapse because nobody can prove\nthe evidence was not changed."), 40, 150);
  lead(T("Not because anyone changed it."), 26);
  note(T("Evidence goes onto a flash drive, gets emailed between officers, sits on a shared machine, and arrives at a hearing a year later. Maybe nobody touched it. Nobody can prove that either."));


});
// ===========================================================================
// 3. Why it matters here
SLIDES.push(() => {
  slide("Where this happens");
  title(T("Three settings"), 40, 130);
  doc.moveDown(0.8);
  const settings = [
    ["Cybercrime cases", "phone extractions, server logs"],
    ["Fraud investigations", "transaction records, audit logs"],
    ["Disciplinary panels", "message exports, access logs"],
  ];
  let sy = doc.y + 6;
  for (const [h, sub] of settings) {
    doc.font("Times-Bold").fontSize(25).fillColor(INK).text(T(h), M, sy);
    doc.font("Times-Roman").fontSize(16).fillColor(MUTED).text(T(sub), M + 330, sy + 6);
    sy += 52;
  }
  doc.font("Times-Roman").fontSize(19).fillColor(INK)
     .text(T("In each one, the handling record is on paper, if it exists at all."), M, sy + 22, { width: W - M * 2 });


});
// ===========================================================================
// 4. The idea
SLIDES.push(() => {
  slide("The idea");
  title(T("A computer can read a file and produce\na short code from its contents."), 38, 140);
  lead(T("Same file, same code, every time."), 26);
  lead(T("Change one letter anywhere inside, and the code comes out\ncompletely different."), 26);
  note(T("We take that code at the scene, on the collecting officer's own phone, before the file goes anywhere else. We take it again months later and compare. Match means untouched."));


});
// ===========================================================================
// 5. The idea, part two
SLIDES.push(() => {
  slide("The idea, part two");
  title(T("Every entry is knotted to the one before it,\nlike beads on a string."), 38, 132);

  // a drawn string of beads, with one pulled out
  const bx = M + 30, by = 330, gap = 122;
  doc.lineWidth(2.5).strokeColor(INK);
  for (let i = 0; i < 5; i += 1) {
    const x = bx + i * gap;
    if (i < 4) {
      const broken = i === 2;
      doc.strokeColor(broken ? RED : INK);
      if (broken) doc.dash(6, { space: 5 });
      doc.moveTo(x + 17, by).lineTo(x + gap - 17, by).stroke();
      doc.undash();
    }
    doc.circle(x, by, 16).lineWidth(2.5)
       .strokeColor(i === 3 ? RED : INK).fillColor(PAPER).fillAndStroke(PAPER, i === 3 ? RED : INK);
  }
  doc.font("Times-Italic").fontSize(17).fillColor(RED)
     .text(T("pull one out, and the string breaks here"), bx + 2 * gap - 40, by + 42, { width: 320 });
  doc.font("Times-Roman").fontSize(21).fillColor(INK)
     .text(T("You cannot quietly remove a bead from the middle."), M, by + 96, { width: W - M * 2 });


});
// ===========================================================================
// 6. Architecture
SLIDES.push(() => {
  slide("How it fits together");
  title(T("Architecture"), 36, 108);

  const box = (x, y, w, h, heading, lines) => {
    doc.roundedRect(x, y, w, h, 5).lineWidth(1).strokeColor(RULE).stroke();
    doc.font("Times-Bold").fontSize(16).fillColor(INK).text(T(heading), x + 16, y + 14, { width: w - 32 });
    doc.font("Times-Roman").fontSize(12.5).fillColor(MUTED)
       .text(T(lines.join("\n")), x + 16, y + 38, { width: w - 32, lineGap: 2.5 });
  };
  const arrow = (x1, y1, x2, y2) => {
    doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(1.2).strokeColor(MUTED).stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    doc.moveTo(x2, y2).lineTo(x2 - 7 * Math.cos(a - 0.4), y2 - 7 * Math.sin(a - 0.4))
       .lineTo(x2 - 7 * Math.cos(a + 0.4), y2 - 7 * Math.sin(a + 0.4)).fill(MUTED);
  };
  box(M, 178, 236, 118, "Field app", ["offline capture", "hashing on the device", "local queue", "deferred sync"]);
  box(W - M - 236, 178, 236, 118, "Dashboard", ["case and item views", "custody timeline", "chunk map", "verify"]);
  box(W / 2 - 150, 336, 300, 96, "API and database", ["append only custody events", "verification", "one page report"]);
  arrow(M + 118, 300, W / 2 - 90, 334);
  arrow(W - M - 118, 300, W / 2 + 90, 334);
  doc.font("Times-Roman").fontSize(14).fillColor(MUTED)
     .text(T("Everything runs on one laptop. No cloud. Nothing paid for."), M, 452, { width: W - M * 2, align: "center" });


});
// ===========================================================================
// 7. Offline first
SLIDES.push(() => {
  slide("Power cuts and dead networks");
  title(T("The fingerprint is taken at the scene,\non the officer's device, before the file\ngoes anywhere."), 34, 118);

  // a representation of the sealed state on the handset
  const px = W - M - 230, py = 116;
  doc.roundedRect(px, py, 208, 310, 22).lineWidth(1.4).strokeColor(RULE).stroke();
  doc.font("Times-Bold").fontSize(13).fillColor(INK).text(T("Custody"), px + 20, py + 26);
  doc.roundedRect(px + 120, py + 22, 72, 19, 9).fill("#f2e3b8");
  doc.font("Times-Bold").fontSize(10).fillColor("#7a5c00").text(T("1 pending"), px + 128, py + 27);
  doc.roundedRect(px + 18, py + 62, 172, 104, 6).lineWidth(1).strokeColor(RULE).stroke();
  doc.font("Times-Bold").fontSize(11.5).fillColor(INK).text(T("EX-FIELD-004821"), px + 30, py + 76);
  doc.font("Times-Roman").fontSize(10).fillColor(MUTED).text(T("handset extraction"), px + 30, py + 92);
  doc.font("Times-Bold").fontSize(11).fillColor(GREEN).text(T("A3F1 9C22 7E04"), px + 30, py + 112, { characterSpacing: 0.5 });
  doc.roundedRect(px + 30, py + 132, 120, 17, 8).fill("#f2e3b8");
  doc.font("Times-Bold").fontSize(9.5).fillColor("#7a5c00").text(T("Sealed, not synced"), px + 37, py + 136);
  doc.font("Times-Roman").fontSize(10).fillColor(MUTED)
     .text(T("Airplane mode. No network at the scene."), px + 18, py + 186, { width: 172, align: "center" });

  doc.font("Times-Roman").fontSize(19).fillColor(INK)
     .text(T("Nothing between the scene and the server can alter the file\nwithout it being detectable."), M, 330, { width: 480, lineGap: 6 });
  note(T("This is a question about power cuts and dead networks answered by architecture, not by a paragraph."));


});
// ===========================================================================
// 8. Large files
SLIDES.push(() => {
  slide("One extraction can exceed 100GB");
  title(T("We say which part changed,\nnot just that something did."), 36, 116);

  // chunk strip, one red
  const cx = M, cy = 300, cw = 86, ch = 58;
  for (let i = 0; i < 8; i += 1) {
    const altered = i === 5;
    doc.roundedRect(cx + i * (cw + 8), cy, cw, ch, 4)
       .fillAndStroke(altered ? RED : "#e8f5ec", altered ? RED : "#bfe3ca");
    // Numbered from one, to match the words underneath. The code counts
    // chunks from zero; a panel member counts parts from one, and the slide
    // is for the panel member.
    doc.font("Times-Bold").fontSize(16).fillColor(altered ? "#fff" : GREEN)
       .text(String(i + 1), cx + i * (cw + 8), cy + 20, { width: cw, align: "center" });
  }
  doc.font("Times-Roman").fontSize(17).fillColor(INK)
     .text(T("The file is hashed in 4MB pieces. Part 6 of 8 differs, so the change lies\nbetween byte 20,971,520 and byte 25,165,823."), M, cy + 78, { width: W - M * 2, lineGap: 5 });
  doc.font("Times-Italic").fontSize(15).fillColor(MUTED)
     .text(T("We tested at 30MB and extrapolated. Memory use stays flat as the file grows, because we never hold the whole file at once. That is what makes the claim reasonable, not the size of our test file."), M, cy + 128, { width: W - M * 2, lineGap: 4 });


});
// ===========================================================================
// 9. Demo
SLIDES.push(() => {
  slide();
  doc.font("Times-Bold").fontSize(96).fillColor(INK)
     .text(T("Demo"), 0, H / 2 - 66, { width: W, align: "center" });


});
// ===========================================================================
// 10. The report
SLIDES.push(() => {
  slide("The deliverable");
  title(T("One page. No jargon. No hashes."), 36, 112);
  lead(T("Is it unchanged?  Yes.\nHow do we know?  A fingerprint was taken at collection and checked again.\nWho has handled it?  Four people, named, with dates.\nCan this list have been edited?  No, and here is why."), 19);
  doc.moveDown(0.4);
  doc.font("Times-Italic").fontSize(18).fillColor(INK)
     .text(T("\"A process that is technically perfect but cannot be explained in a hearing\nhas not solved the problem.\""), M, doc.y, { width: W - M * 2, lineGap: 5 });
  doc.font("Times-Roman").fontSize(14).fillColor(MUTED).text(T("the brief"), M, doc.y + 6);
  note(T("[Replace this slide with a photograph of the printed report in someone's hands.]"), 13);


});
// ===========================================================================
// 11. Tested on people
SLIDES.push(() => {
  slide("We tested it on people");
  title(T("We gave the report to someone\noutside computer science."), 36, 130);
  doc.moveDown(0.6);
  doc.font("Times-Roman").fontSize(19).fillColor(MUTED)
     .text(T("[What confused them.]"), M, doc.y, { width: W - M * 2, lineGap: 6 });
  doc.moveDown(0.3);
  doc.font("Times-Roman").fontSize(19).fillColor(MUTED)
     .text(T("[What we changed as a result.]"), M, doc.y, { width: W - M * 2, lineGap: 6 });
  note(T("Fill this in with the real result before presenting. Do not invent it. Almost no other team will have this slide, and it is worth more than anything we could make up."), 14);


});
// ===========================================================================
// 12. Limits
SLIDES.push(() => {
  slide("What we did not solve");
  title(T("Honest limits"), 36, 104);
  doc.moveDown(0.7);
  const limits = [
    ["A corrupt collector", "we protect the chain from collection onward, not before it"],
    ["The device clock", "we show both clocks, we do not vouch for the phone's"],
    ["Scale", "tested at 30MB, extrapolated, not a real 100GB extraction"],
    ["Per officer signing", "events are tied to a login, not to a person's key"],
    ["Storage", "we prove change, we do not prevent deletion"],
    ["Bulk compromise", "full server access could rebuild the whole chain"],
  ];
  let ly = doc.y;
  for (const [h, sub] of limits) {
    doc.font("Times-Bold").fontSize(18).fillColor(INK).text(T(h), M, ly, { width: 250 });
    doc.font("Times-Roman").fontSize(15).fillColor(MUTED).text(T(sub), M + 268, ly + 2, { width: W - M - 268 - M + 40 });
    ly += 44;
  }


});
// ===========================================================================
// 13. Optional, for questions
SLIDES.push(() => {
  slide("If asked");
  title(T("Why not a blockchain?"), 38, 150);
  lead(T("A blockchain solves distrust between parties with no shared authority.\nA court has one."), 21);
  lead(T("A hash chain, append only storage, and periodically published root hashes\ngive the same tamper evidence at a fraction of the complexity, and can be\nexplained to a panel member in a single sentence."), 21);
});

// ===========================================================================
// Emit

for (const [i, fn] of SLIDES.entries()) {
  slideNo = i + 1;
  if (ONLY && !ONLY.includes(slideNo)) continue;
  fn();
}

doc.end();

const offenders = collected.filter((s) => BANNED.test(s));
if (offenders.length) {
  console.error("Em or en dash found in deck copy:");
  for (const o of offenders) console.error(`  ${o.slice(0, 80)}`);
  process.exit(1);
}
console.log(`Deck written to ${OUT}`);
console.log(`  ${emitted} of ${SLIDES.length} slides, 16:9 (${W}x${H}pt), Times throughout, no em or en dashes`);
