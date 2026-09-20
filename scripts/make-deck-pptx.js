// Builds the presentation deck as an editable PowerPoint file.
//
// Same content and specification as make-deck.js, which produces the PDF:
// 16:9, Times New Roman throughout, dark text on light, one idea per slide.
// Diagrams are real shapes rather than images, so they can be edited in
// PowerPoint like anything else on the slide.
//
// Usage: node scripts/make-deck-pptx.js [outfile]

import PptxGenJS from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? path.join(here, "../deck/custody-deck.pptx");

// LAYOUT_16x9 is 10in x 5.625in. Coordinates beyond that are written rather
// than clamped, so the shape silently lands off the slide.
const W = 10;
const H = 5.625;
const M = 0.7;
const COL = W - M * 2;

const FONT = "Times New Roman";
const INK = "16160F";
const MUTED = "6B6B60";
const RULE = "C9C9BF";
const PAPER = "FBFBF8";
const GREEN = "1A7F37";
const GREEN_BG = "E8F5EC";
const GREEN_LINE = "BFE3CA";
const RED = "B42318";
const AMBER_BG = "F2E3B8";
const AMBER_INK = "7A5C00";

// Every string on a slide passes through T(), so the no dashes rule is
// enforced by the build rather than by proofreading.
const seen = [];
const T = (s) => { seen.push(s); return s; };

const pres = new PptxGenJS();
pres.layout = "LAYOUT_16x9";
pres.author = "Custody";
pres.title = "Custody: proving digital evidence has not been changed";

let n = 0;
function slide(kicker, notes) {
  n += 1;
  const s = pres.addSlide();
  s.background = { color: PAPER };
  if (kicker) {
    s.addText(T(kicker), {
      x: M, y: 0.34, w: COL, h: 0.3, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 12, color: MUTED, charSpacing: 1,
    });
  }
  s.addText(String(n), {
    x: W - M - 0.4, y: H - 0.62, w: 0.4, h: 0.28, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 10, color: RULE, align: "right",
  });
  if (notes) s.addNotes(notes);
  return s;
}

const title = (s, text, opts = {}) =>
  s.addText(T(text), {
    x: M, y: opts.y ?? 1.05, w: opts.w ?? COL, h: opts.h ?? 1.15, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: opts.size ?? 30, bold: true, color: INK,
    lineSpacingMultiple: 1.12, valign: "top",
  });

const lead = (s, text, opts = {}) =>
  s.addText(T(text), {
    x: M, y: opts.y, w: opts.w ?? COL, h: opts.h ?? 0.9, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: opts.size ?? 17, color: opts.color ?? INK,
    lineSpacingMultiple: 1.25, valign: "top",
  });

const note = (s, text, opts = {}) =>
  s.addText(T(text), {
    x: M, y: opts.y, w: opts.w ?? COL, h: opts.h ?? 0.8, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: opts.size ?? 12, italic: true, color: MUTED,
    lineSpacingMultiple: 1.25, valign: "top",
  });

// --- 1. Title --------------------------------------------------------------
{
  const s = slide(null, "Ten seconds. Do not read the slide.");
  s.addText(T("Custody"), {
    x: M, y: 1.55, w: COL, h: 1.0, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 54, bold: true, color: INK,
  });
  s.addText(T("Proving digital evidence has not been changed"), {
    x: M, y: 2.6, w: COL, h: 0.5, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 20, color: INK,
  });
  s.addText(T("ICSC 2026 Universities Hackathon, Track H"), {
    x: M, y: 4.16, w: COL, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12, color: MUTED,
  });
  s.addText(T("[Team name], five members, University of Ibadan"), {
    x: M, y: 4.45, w: COL, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12, color: MUTED,
  });
}

// --- 2. The problem --------------------------------------------------------
{
  const s = slide("The problem",
    "Tell it as a story. Evidence goes onto a flash drive, gets emailed, sits on a shared machine, and arrives at a hearing a year later.");
  title(s, "Cases collapse because nobody can prove\nthe evidence was not changed.", { y: 1.15, size: 28, h: 1.4 });
  lead(s, "Not because anyone changed it.", { y: 2.62, size: 19 });
  note(s, "Evidence goes onto a flash drive, gets emailed between officers, sits on a shared machine, and arrives at a hearing a year later. Maybe nobody touched it. Nobody can prove that either.",
    { y: 3.45, h: 1.1 });
}

// --- 3. Three settings -----------------------------------------------------
{
  const s = slide("Where this happens",
    "Name the university panel explicitly. The room has sat on one.");
  title(s, "Three settings", { y: 0.95, size: 28, h: 0.6 });
  const rows = [
    ["Cybercrime cases", "phone extractions, server logs"],
    ["Fraud investigations", "transaction records, audit logs"],
    ["Disciplinary panels", "message exports, access logs"],
  ];
  rows.forEach(([head, sub], i) => {
    const y = 1.85 + i * 0.62;
    s.addText(T(head), {
      x: M, y, w: 3.4, h: 0.4, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 19, bold: true, color: INK,
    });
    s.addText(T(sub), {
      x: M + 3.5, y: y + 0.06, w: COL - 3.5, h: 0.4, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 13, color: MUTED,
    });
  });
  lead(s, "In each one, the handling record is on paper, if it exists at all.", { y: 4.1, size: 15 });
}

// --- 4. The fingerprint ----------------------------------------------------
{
  const s = slide("The idea", "No hashes on this slide. Words only.");
  title(s, "A computer can read a file and produce\na short code from its contents.", { y: 1.05, size: 27, h: 1.35 });
  lead(s, "Same file, same code, every time.", { y: 2.5, size: 19 });
  lead(s, "Change one letter anywhere inside, and the code comes out\ncompletely different.", { y: 3.0, size: 19, h: 0.8 });
  note(s, "The code is taken at the scene, on the collecting officer's own phone, before the file goes anywhere else. It is taken again months later and compared. Match means untouched.",
    { y: 4.18, h: 0.9 });
}

// --- 5. The chain ----------------------------------------------------------
{
  const s = slide("The idea, part two",
    "This metaphor is the one they will remember. Use it twice in the talk.");
  title(s, "Every entry is knotted to the one before it,\nlike beads on a string.", { y: 1.0, size: 27, h: 1.3 });

  const bx = M + 0.3, by = 3.05, gap = 1.28, r = 0.19;
  for (let i = 0; i < 5; i += 1) {
    const x = bx + i * gap;
    if (i < 4) {
      const broken = i === 2;
      s.addShape(pres.ShapeType.line, {
        x: x + r, y: by + r, w: gap - r * 2, h: 0,
        line: {
          color: broken ? RED : INK,
          width: broken ? 2 : 2.25,
          dashType: broken ? "dash" : "solid",
        },
      });
    }
    s.addShape(pres.ShapeType.ellipse, {
      x, y: by, w: r * 2, h: r * 2,
      fill: { color: PAPER },
      line: { color: i === 3 ? RED : INK, width: 2.25 },
    });
  }
  s.addText(T("pull one out, and the string breaks here"), {
    x: bx + gap * 1.55, y: by + 0.52, w: 3.6, h: 0.35, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 13, italic: true, color: RED,
  });
  lead(s, "You cannot quietly remove a bead from the middle.", { y: 4.42, size: 17 });
}

// --- 6. Architecture -------------------------------------------------------
{
  const s = slide("How it fits together", "Twenty seconds. Do not walk through every box.");
  title(s, "Architecture", { y: 0.85, size: 28, h: 0.6 });

  const box = (x, y, w, h, head, lines) => {
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.05,
      fill: { color: PAPER }, line: { color: RULE, width: 1 },
    });
    s.addText(T(head), {
      x: x + 0.16, y: y + 0.12, w: w - 0.32, h: 0.3, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 14, bold: true, color: INK,
    });
    s.addText(T(lines.join("\n")), {
      x: x + 0.16, y: y + 0.45, w: w - 0.32, h: h - 0.55, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 10.5, color: MUTED, lineSpacingMultiple: 1.2,
    });
  };

  box(M, 1.6, 2.5, 1.25, "Field app",
    ["offline capture", "hashing on the device", "local queue", "deferred sync"]);
  box(W - M - 2.5, 1.6, 2.5, 1.25, "Dashboard",
    ["case and item views", "custody timeline", "chunk map", "verify"]);
  box(W / 2 - 1.6, 3.42, 3.2, 1.05, "API and database",
    ["append only custody events", "verification", "one page report"]);

  s.addShape(pres.ShapeType.line, {
    x: M + 1.25, y: 2.87, w: W / 2 - 1.75 - M - 1.25 + 1.0, h: 0.52,
    line: { color: MUTED, width: 1.1, endArrowType: "triangle" },
  });
  s.addShape(pres.ShapeType.line, {
    x: W / 2 + 1.6, y: 3.39, w: W - M - 1.25 - (W / 2 + 1.6), h: -0.52,
    line: { color: MUTED, width: 1.1, beginArrowType: "triangle" },
  });

  s.addText(T("Everything runs on one laptop. No cloud. Nothing paid for."), {
    x: M, y: 4.72, w: COL, h: 0.35, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 12.5, color: MUTED, align: "center",
  });
}

// --- 7. Offline first ------------------------------------------------------
{
  const s = slide("Power cuts and dead networks",
    "The requirement to work through power and network cuts is answered by the architecture, not by a policy.");
  // Narrower column than the other slides, because the handset sits beside
  // it. Sized with slack: Times sets wider in some renderers and an
  // overflowing title would run into the body text below.
  title(s, "The fingerprint is taken at the scene,\non the officer's device, before the file\ngoes anywhere.", { y: 1.0, size: 21, w: 5.95, h: 1.75 });

  const px = W - M - 2.35, py = 0.95, pw = 2.15, ph = 3.3;
  s.addShape(pres.ShapeType.roundRect, {
    x: px, y: py, w: pw, h: ph, rectRadius: 0.16,
    fill: { color: PAPER }, line: { color: RULE, width: 1.2 },
  });
  s.addText(T("Custody"), {
    x: px + 0.18, y: py + 0.22, w: 1.0, h: 0.25, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 11, bold: true, color: INK,
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: px + 1.24, y: py + 0.2, w: 0.72, h: 0.22, rectRadius: 0.11,
    fill: { color: AMBER_BG }, line: { color: AMBER_BG, width: 0.5 },
  });
  s.addText(T("1 pending"), {
    x: px + 1.24, y: py + 0.215, w: 0.72, h: 0.2, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 8, bold: true, color: AMBER_INK, align: "center",
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: px + 0.16, y: py + 0.62, w: pw - 0.32, h: 1.15, rectRadius: 0.05,
    fill: { color: PAPER }, line: { color: RULE, width: 0.8 },
  });
  s.addText(T("EX-FIELD-004821"), {
    x: px + 0.3, y: py + 0.74, w: 1.6, h: 0.2, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 10, bold: true, color: INK,
  });
  s.addText(T("handset extraction"), {
    x: px + 0.3, y: py + 0.94, w: 1.6, h: 0.2, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 8.5, color: MUTED,
  });
  s.addText(T("A3F1 9C22 7E04"), {
    x: px + 0.3, y: py + 1.14, w: 1.6, h: 0.2, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 9.5, bold: true, color: GREEN,
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: px + 0.3, y: py + 1.4, w: 1.28, h: 0.22, rectRadius: 0.11,
    fill: { color: AMBER_BG }, line: { color: AMBER_BG, width: 0.5 },
  });
  s.addText(T("Sealed, not synced"), {
    x: px + 0.3, y: py + 1.415, w: 1.28, h: 0.2, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 8, bold: true, color: AMBER_INK, align: "center",
  });
  s.addText(T("Airplane mode. No network at the scene."), {
    x: px + 0.16, y: py + 2.0, w: pw - 0.32, h: 0.5, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 9, color: MUTED, align: "center",
  });

  lead(s, "Nothing between the scene and the server can alter the file\nwithout it being detectable.",
    { y: 3.15, size: 15, w: 5.95, h: 0.8 });
  note(s, "A question about power cuts and dead networks, answered by architecture rather than by a paragraph.",
    { y: 4.25, w: 5.95, h: 0.7 });
}

// --- 8. Large files --------------------------------------------------------
{
  const s = slide("One extraction can exceed 100GB",
    "Do not overclaim. The honesty is worth more than the number.");
  title(s, "We say which part changed,\nnot just that something did.", { y: 0.95, size: 27, h: 1.25 });

  const cw = 0.92, ch = 0.62, gapx = 0.1;
  const total = 8 * cw + 7 * gapx;
  const cx = M, cy = 2.55;
  for (let i = 0; i < 8; i += 1) {
    const altered = i === 5;
    s.addShape(pres.ShapeType.roundRect, {
      x: cx + i * (cw + gapx), y: cy, w: cw, h: ch, rectRadius: 0.04,
      fill: { color: altered ? RED : GREEN_BG },
      line: { color: altered ? RED : GREEN_LINE, width: 1 },
    });
    s.addText(T(String(i + 1)), {
      x: cx + i * (cw + gapx), y: cy + 0.16, w: cw, h: 0.3, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 14, bold: true,
      color: altered ? "FFFFFF" : GREEN, align: "center",
    });
  }
  lead(s, "The file is hashed in 4MB pieces. Part 6 of 8 differs, so the change lies\nbetween byte 20,971,520 and byte 25,165,823.",
    { y: 3.4, size: 14, h: 0.75 });
  note(s, "Tested at 30MB and extrapolated. Memory use stays flat as the file grows, because the whole file is never held at once. That is what makes the claim reasonable, not the size of the test file.",
    { y: 4.25, h: 0.85, size: 11.5 });
  if (total > COL) throw new Error("chunk strip is wider than the text column");
}

// --- 9. Demo ---------------------------------------------------------------
{
  const s = slide(null, "Six minutes. Follow DEMO.md.");
  s.addText(T("Demo"), {
    x: 0, y: H / 2 - 0.75, w: W, h: 1.5, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 60, bold: true, color: INK, align: "center",
  });
}

// --- 10. The report --------------------------------------------------------
{
  const s = slide("The deliverable",
    "Replace this slide with a photograph of the printed report in someone's hands.");
  title(s, "One page. No jargon. No hashes.", { y: 0.95, size: 27, h: 0.6 });
  lead(s,
    "Is it unchanged?  Yes.\n" +
    "How do we know?  A fingerprint was taken at collection and checked again.\n" +
    "Who has handled it?  Four people, named, with dates.\n" +
    "Can this list have been edited?  No, and here is why.",
    { y: 1.75, size: 14.5, h: 1.5 });
  s.addText(
    T("\"A process that is technically perfect but cannot be explained in a hearing\nhas not solved the problem.\""),
    {
      x: M, y: 3.35, w: COL, h: 0.7, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 14.5, italic: true, color: INK, lineSpacingMultiple: 1.25,
    });
  s.addText(T("the brief"), {
    x: M, y: 4.02, w: COL, h: 0.3, isTextBox: true, margin: 0,
    fontFace: FONT, fontSize: 11, color: MUTED,
  });
  note(s, "[Replace with a photograph of the printed report in someone's hands.]",
    { y: 4.5, size: 11 });
}

// --- 11. Tested on people --------------------------------------------------
{
  const s = slide("We tested it on people",
    "Fill this in with the real result. Do not invent it.");
  title(s, "We gave the report to someone\noutside computer science.", { y: 1.05, size: 27, h: 1.25 });
  lead(s, "[What confused them.]", { y: 2.55, size: 16, color: MUTED, h: 0.4 });
  lead(s, "[What we changed as a result.]", { y: 3.0, size: 16, color: MUTED, h: 0.4 });
  note(s, "Complete this with the real result before presenting. An accurate account of what a reader did not understand is the only version worth reporting.",
    { y: 3.8, h: 0.8 });
}

// --- 12. Limits ------------------------------------------------------------
{
  const s = slide("What we did not solve", "Deliver this confidently, not apologetically.");
  title(s, "Honest limits", { y: 0.82, size: 28, h: 0.55 });
  const limits = [
    ["A corrupt collector", "the chain is protected from collection onward, not before it"],
    ["The device clock", "both clocks are shown, the phone's is not vouched for"],
    ["Scale", "tested at 30MB, extrapolated, not a real 100GB extraction"],
    ["Per officer signing", "events are tied to a login, not to a person's key"],
    ["Storage", "change is proven, deletion is not prevented"],
    ["Bulk compromise", "full server access could rebuild the whole chain"],
  ];
  limits.forEach(([head, sub], i) => {
    const y = 1.62 + i * 0.53;
    s.addText(T(head), {
      x: M, y, w: 2.5, h: 0.35, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 14, bold: true, color: INK,
    });
    s.addText(T(sub), {
      x: M + 2.6, y: y + 0.03, w: COL - 2.6, h: 0.35, isTextBox: true, margin: 0,
      fontFace: FONT, fontSize: 12, color: MUTED,
    });
  });
}

// --- 13. Why not a blockchain ----------------------------------------------
{
  const s = slide("If asked", "One sentence, then stop.");
  title(s, "Why not a blockchain?", { y: 1.15, size: 28, h: 0.6 });
  lead(s, "A blockchain solves distrust between parties with no shared authority.\nA court has one.",
    { y: 2.15, size: 16, h: 0.8 });
  lead(s, "A hash chain, append only storage, and periodically published root hashes\ngive the same tamper evidence at a fraction of the complexity, and can be\nexplained to a panel member in a single sentence.",
    { y: 3.1, size: 16, h: 1.1 });
}

const offenders = seen.filter((s) => /[—–]/.test(s));
if (offenders.length) {
  console.error("Em or en dash found in deck copy:");
  for (const o of offenders) console.error(`  ${o.slice(0, 80)}`);
  process.exit(1);
}

await pres.writeFile({ fileName: OUT });
console.log(`Deck written to ${OUT}`);
console.log(`  ${n} slides, 16:9, Times New Roman, no em or en dashes`);
