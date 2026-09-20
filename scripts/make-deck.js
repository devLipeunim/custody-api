// Builds the presentation deck as a PDF.
//
// 16:9, Times throughout, dark text on light. Content comes from
// deck-content.js, which the PowerPoint build also uses.
//
// Layout: each slide is a stack of blocks whose heights are known before
// anything is drawn, so the stack is centred in the frame rather than
// stranded at the top. Text carries explicit line breaks and never wraps,
// which keeps this build and the PowerPoint build identical.
//
// Usage: node scripts/make-deck.js [outfile]
//        DECK_ONLY=7 node scripts/make-deck.js one.pdf

import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK, allText } from "./deck-content.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? path.join(here, "../deck/custody-deck.pdf");
const ONLY = process.env.DECK_ONLY ? process.env.DECK_ONLY.split(",").map(Number) : null;

const W = 960, H = 540;
const ML = 84;                       // left margin
const COL = W - ML * 2;              // full text column
const BAND_TOP = 128, BAND_BOTTOM = 470;

const INK = "#14140e";
const MUTED = "#6e6e63";
const FAINT = "#9a9a90";
const RULE = "#d2d2c8";
const PAPER = "#fcfcf9";
const GREEN = "#1a7f37", GREEN_BG = "#e9f5ec", GREEN_LINE = "#c2e3cb";
const RED = "#b42318";
const AMBER_BG = "#f3e5bd", AMBER_INK = "#7a5c00";

// type scale
const T = {
  kicker:    { font: "Times-Roman", size: 11.5, lead: 16, color: MUTED, track: 1.1 },
  statement: { font: "Times-Bold",  size: 44,   lead: 54, color: INK },
  title:     { font: "Times-Bold",  size: 36,   lead: 45, color: INK },
  lead:      { font: "Times-Roman", size: 20,   lead: 29, color: INK },
  rowLabel:  { font: "Times-Bold",  size: 20,   lead: 29, color: INK },
  rowValue:  { font: "Times-Roman", size: 17,   lead: 29, color: MUTED },
  quote:     { font: "Times-Italic",size: 18,   lead: 26, color: INK },
  attrib:    { font: "Times-Roman", size: 12,   lead: 18, color: FAINT },
};

const GAP = { afterTitle: 30, afterStatement: 26, afterLead: 20, afterRows: 28, afterDiagram: 30 };

await mkdir(path.dirname(OUT), { recursive: true });
const doc = new PDFDocument({ size: [W, H], margin: 0, info: {
  Title: "Custody: proving digital evidence has not been changed",
  Author: "Team Captain",
} });
doc.pipe(createWriteStream(OUT));

const text = (s, style, x, y, opts = {}) => {
  doc.font(style.font).fontSize(style.size).fillColor(opts.color ?? style.color);
  doc.text(s, x, y, { lineBreak: false, characterSpacing: style.track ?? 0, ...opts });
};

// ---------------------------------------------------------------- measuring
function blockHeight(b) {
  switch (b.type) {
    case "statement": return b.lines.length * T.statement.lead;
    case "title":     return b.lines.length * T.title.lead;
    case "lead":      return b.lines.length * T.lead.lead;
    case "quote":     return b.lines.length * T.quote.lead + (b.attribution ? T.attrib.lead : 0);
    case "rows":      return b.rows.length * (b.compact ? 34 : 42);
    case "qa":        return b.rows.length * 32;
    case "diagram":   return b.height;
    default:          return 0;
  }
}
function gapAfter(b) {
  switch (b.type) {
    case "statement": return GAP.afterStatement;
    case "title":     return GAP.afterTitle;
    case "lead":      return GAP.afterLead;
    case "rows":
    case "qa":        return GAP.afterRows;
    case "diagram":   return GAP.afterDiagram;
    default:          return 18;
  }
}
const stackHeight = (blocks) =>
  blocks.reduce((h, b, i) => h + blockHeight(b) + (i < blocks.length - 1 ? gapAfter(b) : 0), 0);

// ---------------------------------------------------------------- diagrams
const DIAGRAMS = {
  // Five beads with the third link severed.
  beads(x, y, width) {
    const n = 5, r = 17, span = Math.min(width, 620);
    const gap = (span - r * 2) / (n - 1);
    const cy = y + 40;
    for (let i = 0; i < n; i += 1) {
      const cx = x + r + i * gap;
      if (i < n - 1) {
        const broken = i === 2;
        doc.strokeColor(broken ? RED : INK).lineWidth(broken ? 2 : 2.4);
        if (broken) doc.dash(6, { space: 5 });
        doc.moveTo(cx + r, cy).lineTo(cx + gap - r, cy).stroke();
        doc.undash();
      }
      const bad = i === 3;
      doc.circle(cx, cy, r).lineWidth(2.4)
         .fillAndStroke(PAPER, bad ? RED : INK);
    }
    text("the string breaks here", T.attrib, x + r + 2 * gap - 24, cy + 34, { color: RED });
  },

  architecture(x, y, width) {
    const bw = 244, bh = 108, bottomW = 300, bottomH = 92;
    const box = (bx, by, w, h, head, lines) => {
      doc.roundedRect(bx, by, w, h, 5).lineWidth(1).strokeColor(RULE).stroke();
      text(head, { ...T.lead, size: 16, font: "Times-Bold" }, bx + 16, by + 13);
      doc.font("Times-Roman").fontSize(12.5).fillColor(MUTED)
         .text(lines.join("\n"), bx + 16, by + 37, { width: w - 32, lineGap: 2.5 });
    };
    const arrow = (x1, y1, x2, y2) => {
      doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(1.1).strokeColor(FAINT).stroke();
      const a = Math.atan2(y2 - y1, x2 - x1);
      doc.moveTo(x2, y2)
         .lineTo(x2 - 8 * Math.cos(a - 0.38), y2 - 8 * Math.sin(a - 0.38))
         .lineTo(x2 - 8 * Math.cos(a + 0.38), y2 - 8 * Math.sin(a + 0.38))
         .fill(FAINT);
    };
    const leftX = x, rightX = x + width - bw, midX = x + (width - bottomW) / 2;
    box(leftX, y, bw, bh, "Field app",
      ["offline capture", "hashing on the device", "queue and deferred sync"]);
    box(rightX, y, bw, bh, "Dashboard",
      ["case and item views", "custody timeline", "chunk map and verify"]);
    box(midX, y + 132, bottomW, bottomH, "API and database",
      ["append only custody events", "verification, one page report"]);
    arrow(leftX + bw / 2, y + bh + 4, midX + bottomW / 2 - 56, y + 128);
    arrow(rightX + bw / 2, y + bh + 4, midX + bottomW / 2 + 56, y + 128);
  },

  chunks(x, y, width) {
    const n = 8, gap = 9;
    const cw = Math.min(88, (width - gap * (n - 1)) / n), ch = 60;
    for (let i = 0; i < n; i += 1) {
      const bad = i === 5;
      const bx = x + i * (cw + gap);
      doc.roundedRect(bx, y, cw, ch, 4)
         .fillAndStroke(bad ? RED : GREEN_BG, bad ? RED : GREEN_LINE);
      doc.font("Times-Bold").fontSize(17).fillColor(bad ? "#ffffff" : GREEN)
         .text(String(i + 1), bx, y + 19, { width: cw, align: "center", lineBreak: false });
    }
  },

  // The same document before and after a single character changes.
  fingerprints(x, y, width) {
    const rows = [
      ["statement.pdf", "A3F1 9C22 7E04 6B8D 1C55 E210 44AF 9D31", false],
      ["statement.pdf  (one character changed)",
       "8B02 41DE C5A7 F014 92E6 3B7C D885 07A2", true],
    ];
    const boxW = Math.min(width, 700), boxH = 54, gap = 14;
    rows.forEach(([label, code, bad], i) => {
      const by = y + i * (boxH + gap);
      doc.roundedRect(x, by, boxW, boxH, 5)
         .fillAndStroke(bad ? "#fdeceb" : GREEN_BG, bad ? "#f0c8c4" : GREEN_LINE);
      text(label, { ...T.attrib, size: 12.5 }, x + 18, by + 10, { color: MUTED });
      doc.font("Courier-Bold").fontSize(15).fillColor(bad ? RED : GREEN)
         .text(code, x + 18, by + 28, { lineBreak: false, characterSpacing: 0.4 });
    });
  },

  // The handset, used on the split layout only.
  phone(x, y, w, h) {
    doc.roundedRect(x, y, w, h, 22).lineWidth(1.4).strokeColor(RULE).stroke();
    text("Custody", { ...T.lead, size: 13, font: "Times-Bold" }, x + 20, y + 24);
    doc.roundedRect(x + w - 92, y + 20, 72, 20, 10).fill(AMBER_BG);
    doc.font("Times-Bold").fontSize(10).fillColor(AMBER_INK)
       .text("1 pending", x + w - 92, y + 25, { width: 72, align: "center", lineBreak: false });

    doc.roundedRect(x + 18, y + 60, w - 36, 108, 6).lineWidth(1).strokeColor(RULE).stroke();
    text("EX-FIELD-004821", { ...T.lead, size: 12, font: "Times-Bold" }, x + 32, y + 74);
    text("handset extraction", { ...T.attrib, size: 10.5 }, x + 32, y + 92, { color: MUTED });
    text("A3F1 9C22 7E04", { ...T.lead, size: 12, font: "Times-Bold" }, x + 32, y + 112,
      { color: GREEN, characterSpacing: 0.6 });
    doc.roundedRect(x + 32, y + 134, 122, 20, 10).fill(AMBER_BG);
    doc.font("Times-Bold").fontSize(9.5).fillColor(AMBER_INK)
       .text("Sealed, not synced", x + 32, y + 139, { width: 122, align: "center", lineBreak: false });

    doc.font("Times-Roman").fontSize(11).fillColor(MUTED)
       .text("Airplane mode.\nNo network at the scene.", x + 18, y + 192,
             { width: w - 36, align: "center", lineGap: 3 });
  },
};

// ---------------------------------------------------------------- rendering
function drawBlock(b, x, y, width) {
  switch (b.type) {
    case "statement":
      b.lines.forEach((l, i) => text(l, T.statement, x, y + i * T.statement.lead));
      break;
    case "title":
      b.lines.forEach((l, i) => text(l, T.title, x, y + i * T.title.lead));
      break;
    case "lead":
      b.lines.forEach((l, i) => text(l, T.lead, x, y + i * T.lead.lead));
      break;
    case "quote":
      b.lines.forEach((l, i) => text(l, T.quote, x, y + i * T.quote.lead));
      if (b.attribution) text(b.attribution, T.attrib, x, y + b.lines.length * T.quote.lead + 4);
      break;
    case "rows": {
      // A fixed gutter, so every value starts on the same axis however long
      // its label is.
      const step = b.compact ? 34 : 42;
      const gutter = b.compact ? 300 : 340;
      b.rows.forEach(([label, value], i) => {
        text(label, b.compact ? { ...T.rowLabel, size: 17 } : T.rowLabel, x, y + i * step);
        text(value, T.rowValue, x + gutter, y + i * step + 2);
      });
      break;
    }
    case "qa":
      b.rows.forEach(([q, a], i) => {
        text(q, { ...T.rowLabel, size: 17 }, x, y + i * 32);
        text(a, { ...T.rowValue, size: 16, color: INK }, x + 250, y + i * 32);
      });
      break;
    case "diagram":
      DIAGRAMS[b.name](x, y, width);
      break;
  }
}

function renderSlide(slide, number, total) {
  doc.rect(0, 0, W, H).fill(PAPER);

  if (slide.kicker) text(slide.kicker, T.kicker, ML, 60);
  text(String(number), { ...T.attrib, size: 10.5 }, W - ML - 40, H - 52,
    { width: 40, align: "right", color: FAINT, lineBreak: true });

  if (slide.layout === "title") {
    text(slide.title, { ...T.statement, size: 62 }, ML, 168);
    text(slide.subtitle, { ...T.lead, size: 23 }, ML, 256);
    doc.moveTo(ML, 352).lineTo(ML + 340, 352).lineWidth(1).strokeColor(RULE).stroke();
    slide.meta.forEach((m, i) => text(m, { ...T.attrib, size: 13 }, ML, 376 + i * 22, { color: MUTED }));
    return;
  }

  if (slide.layout === "word") {
    doc.font("Times-Bold").fontSize(76).fillColor(INK)
       .text(slide.word, 0, H / 2 - 52, { width: W, align: "center", lineBreak: false });
    return;
  }

  if (slide.layout === "split") {
    // Text left, handset right, each optically centred in its own column.
    const textW = 520;
    const h = stackHeight(slide.blocks);
    let y = BAND_TOP + (BAND_BOTTOM - BAND_TOP - h) / 2;
    for (const b of slide.blocks) {
      drawBlock(b, ML, y, textW);
      y += blockHeight(b) + gapAfter(b);
    }
    const pw = 214, ph = 268;
    DIAGRAMS.phone(W - ML - pw, BAND_TOP + (BAND_BOTTOM - BAND_TOP - ph) / 2, pw, ph);
    return;
  }

  const h = stackHeight(slide.blocks);
  let y = BAND_TOP + (BAND_BOTTOM - BAND_TOP - h) / 2;
  for (const b of slide.blocks) {
    drawBlock(b, ML, y, COL);
    y += blockHeight(b) + gapAfter(b);
  }
}

let emitted = 0;
DECK.forEach((slide, i) => {
  const number = i + 1;
  if (ONLY && !ONLY.includes(number)) return;
  if (emitted > 0) doc.addPage({ size: [W, H], margin: 0 });
  emitted += 1;
  renderSlide(slide, number, DECK.length);
});

const offenders = allText().filter((s) => /[—–]/.test(s));
if (offenders.length) {
  console.error("Em or en dash found in deck copy:");
  for (const o of offenders) console.error(`  ${o.slice(0, 80)}`);
  process.exit(1);
}

doc.end();
console.log(`Deck written to ${OUT}`);
console.log(`  ${emitted} of ${DECK.length} slides, 16:9 (${W}x${H}pt), Times, no em or en dashes`);
