// Builds the presentation deck as an editable PowerPoint file.
//
// Content comes from deck-content.js, the same module the PDF build uses, and
// the layout arithmetic mirrors make-deck.js: positions are computed in the
// same 960 by 540 point space and converted to inches, so the two builds put
// everything in the same place.
//
// Diagrams are real shapes rather than images, so they remain editable.
//
// Usage: node scripts/make-deck-pptx.js [outfile]

import PptxGenJS from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DECK, allText } from "./deck-content.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? path.join(here, "../deck/custody-deck.pptx");

const W = 960, H = 540;          // the shared point space
const IN = (pt) => pt / 96;      // 960pt across a 10in slide

const ML = 84;
const COL = W - ML * 2;
const BAND_TOP = 128, BAND_BOTTOM = 470;

const FONT = "Times New Roman";
const INK = "14140E";
const MUTED = "6E6E63";
const FAINT = "9A9A90";
const RULE = "D2D2C8";
const PAPER = "FCFCF9";
const GREEN = "1A7F37", GREEN_BG = "E9F5EC", GREEN_LINE = "C2E3CB";
const RED = "B42318", RED_BG = "FDECEB", RED_LINE = "F0C8C4";
const AMBER_BG = "F3E5BD", AMBER_INK = "7A5C00";
const WHITE = "FFFFFF";

const T = {
  kicker:    { size: 11.5, lead: 16, color: MUTED, bold: false, track: 1.1 },
  statement: { size: 44,   lead: 54, color: INK,   bold: true },
  title:     { size: 36,   lead: 45, color: INK,   bold: true },
  lead:      { size: 20,   lead: 29, color: INK,   bold: false },
  rowLabel:  { size: 20,   lead: 29, color: INK,   bold: true },
  rowValue:  { size: 17,   lead: 29, color: MUTED, bold: false },
  quote:     { size: 18,   lead: 26, color: INK,   bold: false, italic: true },
  attrib:    { size: 12,   lead: 18, color: FAINT, bold: false },
};
const GAP = { afterTitle: 30, afterStatement: 26, afterLead: 20, afterRows: 28, afterDiagram: 30 };

const pres = new PptxGenJS();
pres.layout = "LAYOUT_16x9";
pres.author = "Team Captain";
pres.title = "Custody: proving digital evidence has not been changed";

let slide;
/** One line of text placed at an exact point position. */
const line = (s, style, x, y, opts = {}) =>
  slide.addText(s, {
    x: IN(x), y: IN(y), w: IN(opts.w ?? COL), h: IN(style.lead * 1.35),
    isTextBox: true, margin: 0, valign: "top",
    fontFace: FONT, fontSize: style.size, bold: style.bold, italic: style.italic ?? false,
    color: opts.color ?? style.color, charSpacing: style.track ?? 0,
    align: opts.align ?? "left",
  });

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

const rect = (x, y, w, h, r, fill, stroke, strokeW = 1) =>
  slide.addShape(r ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
    x: IN(x), y: IN(y), w: IN(w), h: IN(h), ...(r ? { rectRadius: IN(r) } : {}),
    fill: { color: fill }, line: { color: stroke, width: strokeW },
  });

const DIAGRAMS = {
  beads(x, y, width) {
    const n = 5, r = 17, span = Math.min(width, 620);
    const gap = (span - r * 2) / (n - 1);
    const cy = y + 40;
    for (let i = 0; i < n; i += 1) {
      const cx = x + r + i * gap;
      if (i < n - 1) {
        const broken = i === 2;
        slide.addShape(pres.ShapeType.line, {
          x: IN(cx + r), y: IN(cy), w: IN(gap - r * 2), h: 0,
          line: { color: broken ? RED : INK, width: broken ? 2 : 2.4,
                  dashType: broken ? "dash" : "solid" },
        });
      }
      const bad = i === 3;
      slide.addShape(pres.ShapeType.ellipse, {
        x: IN(cx - r), y: IN(cy - r), w: IN(r * 2), h: IN(r * 2),
        fill: { color: PAPER }, line: { color: bad ? RED : INK, width: 2.4 },
      });
    }
    line("the string breaks here", T.attrib, x + r + 2 * gap - 24, cy + 30, { color: RED, w: 260 });
  },

  fingerprints(x, y, width) {
    const rows = [
      ["statement.pdf", "A3F1 9C22 7E04 6B8D 1C55 E210 44AF 9D31", false],
      ["statement.pdf  (one character changed)",
       "8B02 41DE C5A7 F014 92E6 3B7C D885 07A2", true],
    ];
    const boxW = Math.min(width, 700), boxH = 54, gap = 14;
    rows.forEach(([label, code, bad], i) => {
      const by = y + i * (boxH + gap);
      rect(x, by, boxW, boxH, 5, bad ? RED_BG : GREEN_BG, bad ? RED_LINE : GREEN_LINE);
      line(label, { ...T.attrib, size: 12.5 }, x + 18, by + 8, { color: MUTED, w: boxW - 36 });
      slide.addText(code, {
        x: IN(x + 18), y: IN(by + 26), w: IN(boxW - 36), h: IN(22),
        isTextBox: true, margin: 0, valign: "top",
        fontFace: "Courier New", fontSize: 15, bold: true,
        color: bad ? RED : GREEN, charSpacing: 0.4,
      });
    });
  },

  architecture(x, y, width) {
    const bw = 244, bh = 108, bottomW = 300, bottomH = 92;
    const box = (bx, by, w, h, head, lines) => {
      rect(bx, by, w, h, 5, PAPER, RULE);
      line(head, { ...T.lead, size: 16, bold: true }, bx + 16, by + 12, { w: w - 32 });
      slide.addText(lines.join("\n"), {
        x: IN(bx + 16), y: IN(by + 36), w: IN(w - 32), h: IN(h - 46),
        isTextBox: true, margin: 0, valign: "top",
        fontFace: FONT, fontSize: 12.5, color: MUTED, lineSpacingMultiple: 1.22,
      });
    };
    const arrow = (x1, y1, x2, y2) =>
      slide.addShape(pres.ShapeType.line, {
        x: IN(Math.min(x1, x2)), y: IN(Math.min(y1, y2)),
        w: IN(Math.abs(x2 - x1)), h: IN(Math.abs(y2 - y1)),
        line: { color: FAINT, width: 1.1, endArrowType: "triangle",
                beginArrowType: "none" },
        flipH: x2 < x1, flipV: y2 < y1,
      });
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
      rect(bx, y, cw, ch, 4, bad ? RED : GREEN_BG, bad ? RED : GREEN_LINE);
      slide.addText(String(i + 1), {
        x: IN(bx), y: IN(y + 17), w: IN(cw), h: IN(26),
        isTextBox: true, margin: 0, align: "center", valign: "top",
        fontFace: FONT, fontSize: 17, bold: true, color: bad ? WHITE : GREEN,
      });
    }
  },

  phone(x, y, w, h) {
    rect(x, y, w, h, 22, PAPER, RULE, 1.4);
    line("Custody", { ...T.lead, size: 13, bold: true }, x + 20, y + 22, { w: 100 });
    rect(x + w - 92, y + 20, 72, 20, 10, AMBER_BG, AMBER_BG, 0.5);
    slide.addText("1 pending", {
      x: IN(x + w - 92), y: IN(y + 24), w: IN(72), h: IN(16),
      isTextBox: true, margin: 0, align: "center", valign: "top",
      fontFace: FONT, fontSize: 10, bold: true, color: AMBER_INK,
    });
    rect(x + 18, y + 60, w - 36, 108, 6, PAPER, RULE);
    line("EX-FIELD-004821", { ...T.lead, size: 12, bold: true }, x + 32, y + 72, { w: w - 64 });
    line("handset extraction", { ...T.attrib, size: 10.5 }, x + 32, y + 90, { color: MUTED, w: w - 64 });
    line("A3F1 9C22 7E04", { ...T.lead, size: 12, bold: true }, x + 32, y + 110,
      { color: GREEN, w: w - 64 });
    rect(x + 32, y + 134, 122, 20, 10, AMBER_BG, AMBER_BG, 0.5);
    slide.addText("Sealed, not synced", {
      x: IN(x + 32), y: IN(y + 138), w: IN(122), h: IN(16),
      isTextBox: true, margin: 0, align: "center", valign: "top",
      fontFace: FONT, fontSize: 9.5, bold: true, color: AMBER_INK,
    });
    slide.addText("Airplane mode.\nNo network at the scene.", {
      x: IN(x + 18), y: IN(y + 190), w: IN(w - 36), h: IN(48),
      isTextBox: true, margin: 0, align: "center", valign: "top",
      fontFace: FONT, fontSize: 11, color: MUTED, lineSpacingMultiple: 1.25,
    });
  },
};

function drawBlock(b, x, y, width) {
  switch (b.type) {
    case "statement":
      b.lines.forEach((l, i) => line(l, T.statement, x, y + i * T.statement.lead, { w: width }));
      break;
    case "title":
      b.lines.forEach((l, i) => line(l, T.title, x, y + i * T.title.lead, { w: width }));
      break;
    case "lead":
      b.lines.forEach((l, i) => line(l, T.lead, x, y + i * T.lead.lead, { w: width }));
      break;
    case "quote":
      b.lines.forEach((l, i) => line(l, T.quote, x, y + i * T.quote.lead, { w: width }));
      if (b.attribution)
        line(b.attribution, T.attrib, x, y + b.lines.length * T.quote.lead + 4, { w: width });
      break;
    case "rows": {
      const step = b.compact ? 34 : 42;
      const gutter = b.compact ? 300 : 340;
      b.rows.forEach(([label, value], i) => {
        line(label, b.compact ? { ...T.rowLabel, size: 17 } : T.rowLabel, x, y + i * step,
          { w: gutter - 16 });
        line(value, T.rowValue, x + gutter, y + i * step + 2, { w: width - gutter });
      });
      break;
    }
    case "qa":
      b.rows.forEach(([q, a], i) => {
        line(q, { ...T.rowLabel, size: 17 }, x, y + i * 32, { w: 240 });
        line(a, { ...T.rowValue, size: 16, color: INK }, x + 250, y + i * 32, { w: width - 250 });
      });
      break;
    case "diagram":
      DIAGRAMS[b.name](x, y, width);
      break;
  }
}

DECK.forEach((s, i) => {
  slide = pres.addSlide();
  slide.background = { color: PAPER };
  if (s.notes) slide.addNotes(s.notes);

  if (s.kicker) line(s.kicker, T.kicker, ML, 60);
  slide.addText(String(i + 1), {
    x: IN(W - ML - 40), y: IN(H - 52), w: IN(40), h: IN(18),
    isTextBox: true, margin: 0, align: "right", valign: "top",
    fontFace: FONT, fontSize: 10.5, color: FAINT,
  });

  if (s.layout === "title") {
    line(s.title, { ...T.statement, size: 62 }, ML, 168, { w: COL });
    line(s.subtitle, { ...T.lead, size: 23 }, ML, 256, { w: COL });
    slide.addShape(pres.ShapeType.line, {
      x: IN(ML), y: IN(352), w: IN(340), h: 0, line: { color: RULE, width: 1 },
    });
    s.meta.forEach((m, k) =>
      line(m, { ...T.attrib, size: 13 }, ML, 376 + k * 22, { color: MUTED, w: COL }));
    return;
  }

  if (s.layout === "word") {
    slide.addText(s.word, {
      x: 0, y: IN(H / 2 - 52), w: IN(W), h: IN(96),
      isTextBox: true, margin: 0, align: "center", valign: "top",
      fontFace: FONT, fontSize: 76, bold: true, color: INK,
    });
    return;
  }

  if (s.layout === "split") {
    const textW = 520;
    const h = stackHeight(s.blocks);
    let y = BAND_TOP + (BAND_BOTTOM - BAND_TOP - h) / 2;
    for (const b of s.blocks) {
      drawBlock(b, ML, y, textW);
      y += blockHeight(b) + gapAfter(b);
    }
    const pw = 214, ph = 268;
    DIAGRAMS.phone(W - ML - pw, BAND_TOP + (BAND_BOTTOM - BAND_TOP - ph) / 2, pw, ph);
    return;
  }

  const h = stackHeight(s.blocks);
  let y = BAND_TOP + (BAND_BOTTOM - BAND_TOP - h) / 2;
  for (const b of s.blocks) {
    drawBlock(b, ML, y, COL);
    y += blockHeight(b) + gapAfter(b);
  }
});

const offenders = allText().filter((s) => /[—–]/.test(s));
if (offenders.length) {
  console.error("Em or en dash found in deck copy:");
  for (const o of offenders) console.error(`  ${o.slice(0, 80)}`);
  process.exit(1);
}

await pres.writeFile({ fileName: OUT });
console.log(`Deck written to ${OUT}`);
console.log(`  ${DECK.length} slides, 16:9, Times New Roman, no em or en dashes`);
