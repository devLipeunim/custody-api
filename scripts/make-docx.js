// Builds Word versions of the technical write-up and the deck.
//
// Both read the same content modules the PDF and PowerPoint builds use, so no
// text is maintained twice. Diagrams are drawn by the PDF build alone and are
// named rather than reproduced here.
//
// Usage: node scripts/make-docx.js

import {
  AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WRITEUP, TITLE, SUBTITLE, BYLINE } from "./writeup-content.js";
import { DECK } from "./deck-content.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(here, "../deck");

const INK = "16160F";
const MUTED = "5A5A52";
const RULE = "C9C9BF";
const BAND = "F2F2EC";

// A4 less 58pt margins, in twentieths of a point.
const CONTENT_WIDTH = 9026;
const LABEL_WIDTH = 2600;

const FONT = "Times New Roman";
const MONO = "Courier New";

const numbering = {
  config: [{
    reference: "points",
    levels: [{
      level: 0,
      format: LevelFormat.BULLET,
      text: "•",
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360, hanging: 240 } } },
    }],
  }],
};

const page = {
  margin: { top: 1160, bottom: 1160, left: 1160, right: 1160 },
};

const run = (text, o = {}) => new TextRun({ text, font: o.font ?? FONT, ...o });

const para = (text, o = {}) =>
  new Paragraph({
    alignment: o.alignment ?? AlignmentType.JUSTIFIED,
    spacing: { after: o.after ?? 120, line: o.line ?? 260 },
    children: [run(text, o)],
    ...(o.paragraph ?? {}),
  });

const heading = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 140 },
    children: [run(text, { bold: true, size: 24, color: INK })],
  });

const rule = () =>
  new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
    children: [],
  });

const monoLines = (text) =>
  text.split("\n").map((line, i, all) =>
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: i === all.length - 1 ? 140 : 0, line: 240 },
      indent: { left: 200 },
      children: [run(line, { font: MONO, size: 17, color: "2A2A24" })],
    })
  );

/** Label and value rows, borderless, so definitions read as a list not a grid. */
function definitionTable(rows) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [LABEL_WIDTH, CONTENT_WIDTH - LABEL_WIDTH],
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: rows.map(({ label, value }) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: LABEL_WIDTH, type: WidthType.DXA },
            margins: { top: 40, bottom: 80, right: 160 },
            children: [new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [run(label, { bold: true, size: 20 })],
            })],
          }),
          new TableCell({
            width: { size: CONTENT_WIDTH - LABEL_WIDTH, type: WidthType.DXA },
            margins: { top: 40, bottom: 80 },
            children: [new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: 260 },
              children: [run(value, { size: 20 })],
            })],
          }),
        ],
      })
    ),
  });
}

// ------------------------------------------------------------------ write-up

function writeupChildren() {
  const children = [
    new Paragraph({ spacing: { after: 40 }, children: [run(TITLE, { bold: true, size: 38 })] }),
    new Paragraph({ spacing: { after: 60 }, children: [run(SUBTITLE, { size: 22 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [run(BYLINE, { size: 18, color: MUTED })] }),
    rule(),
  ];

  // Consecutive label and value blocks become one table, so they align.
  let pending = [];
  const flush = () => {
    if (pending.length === 0) return;
    children.push(definitionTable(pending));
    children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
    pending = [];
  };

  for (const block of WRITEUP) {
    if (block.type === "kv") { pending.push(block); continue; }
    flush();
    switch (block.type) {
      case "h1":
        children.push(heading(block.text));
        break;
      case "body":
        children.push(para(block.text, { size: 20 }));
        break;
      case "item":
        children.push(new Paragraph({
          numbering: { reference: "points", level: 0 },
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 80, line: 260 },
          children: [run(block.text, { size: 20 })],
        }));
        break;
      case "code":
        children.push(...monoLines(block.text));
        break;
      case "gap":
        break;
    }
  }
  flush();
  return children;
}

// ---------------------------------------------------------------------- deck

const slideRule = () =>
  new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
    children: [],
  });

function slideChildren(slide, index) {
  const children = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        run(`Slide ${index + 1}`, { size: 16, color: MUTED, allCaps: true, bold: true }),
        ...(slide.kicker ? [run(`    ${slide.kicker}`, { size: 16, color: MUTED })] : []),
      ],
    }),
  ];

  if (slide.word) {
    children.push(new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [run(slide.word, { bold: true, size: 44 })],
    }));
  }

  for (const block of slide.blocks ?? []) {
    const text = (block.lines ?? []).join(" ");
    switch (block.type) {
      case "statement":
      case "title":
        children.push(new Paragraph({
          spacing: { before: 80, after: 120 },
          children: [run(text, { bold: true, size: block.type === "statement" ? 32 : 28 })],
        }));
        break;
      case "lead":
        children.push(para(text, { size: 22, alignment: AlignmentType.LEFT }));
        break;
      case "quote":
        children.push(new Paragraph({
          spacing: { before: 100, after: 40 },
          indent: { left: 360 },
          children: [run(text, { italics: true, size: 22 })],
        }));
        if (block.attribution) {
          children.push(new Paragraph({
            spacing: { after: 120 },
            indent: { left: 360 },
            children: [run(block.attribution, { size: 18, color: MUTED })],
          }));
        }
        break;
      case "rows":
      case "qa":
        children.push(definitionTable(
          block.rows.map(([label, value]) => ({ label, value }))
        ));
        children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
        break;
      case "diagram":
        children.push(new Paragraph({
          spacing: { before: 80, after: 120 },
          shading: { type: ShadingType.CLEAR, fill: BAND },
          children: [run(`Diagram: ${block.name}. Drawn in the PDF and PowerPoint builds.`,
            { size: 18, color: MUTED, italics: true })],
        }));
        break;
    }
  }

  if (slide.notes) {
    children.push(new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [
        run("Speaker notes.  ", { bold: true, size: 18, color: MUTED }),
        run(slide.notes, { size: 18, color: MUTED }),
      ],
    }));
  }

  children.push(slideRule());
  return children;
}

function deckChildren() {
  const children = [
    new Paragraph({ spacing: { after: 40 }, children: [run(TITLE, { bold: true, size: 38 })] }),
    new Paragraph({ spacing: { after: 60 }, children: [run(SUBTITLE, { size: 22 })] }),
    new Paragraph({
      spacing: { after: 120 },
      children: [run(`Presentation deck, ${DECK.length} slides.  Team Captain.  ` +
        "ICSC 2026 Universities Hackathon, Track H.", { size: 18, color: MUTED })],
    }),
    rule(),
  ];
  DECK.forEach((slide, i) => children.push(...slideChildren(slide, i)));
  return children;
}

// --------------------------------------------------------------------- build

async function build(name, children, title) {
  const doc = new Document({
    numbering,
    title,
    creator: "Team Captain",
    styles: { default: { document: { run: { font: FONT, size: 20, color: INK } } } },
    sections: [{ properties: { page }, children }],
  });
  const out = path.join(OUT_DIR, name);
  await writeFile(out, await Packer.toBuffer(doc));
  console.log(`  ${out}`);
}

await mkdir(OUT_DIR, { recursive: true });
console.log("Word builds:");
await build("custody-technical-writeup.docx", writeupChildren(), "Custody: technical write-up");
await build("custody-deck.docx", deckChildren(), "Custody: presentation deck");
