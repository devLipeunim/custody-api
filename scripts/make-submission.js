// Builds the submission summary as a Word document: the three repositories,
// what each one is, where each is deployed, and the team.
//
// Usage: node scripts/make-submission.js [outfile]

import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel,
  LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? path.join(here, "../deck/custody-submission.docx");

const FONT = "Times New Roman";
const MONO = "Courier New";
const INK = "16160F";
const MUTED = "5A5A52";
const RULE = "C9C9BF";

const CONTENT = 9026;
const LABEL = 2400;

const run = (text, o = {}) => new TextRun({ text, font: o.font ?? FONT, ...o });

const link = (url) =>
  new ExternalHyperlink({
    link: url,
    children: [run(url, { font: MONO, size: 18, style: "Hyperlink" })],
  });

const body = (text, o = {}) =>
  new Paragraph({
    alignment: o.alignment ?? AlignmentType.JUSTIFIED,
    spacing: { after: o.after ?? 120, line: 260 },
    children: [run(text, { size: 20, ...o })],
  });

const heading = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 140 },
    children: [run(text, { bold: true, size: 24, color: INK })],
  });

const rule = () =>
  new Paragraph({
    spacing: { after: 220 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
    children: [],
  });

const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};

/** Label on the left, one or more paragraphs on the right. */
function definitionTable(rows) {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [LABEL, CONTENT - LABEL],
    borders: noBorders,
    rows: rows.map(({ label, children }) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: LABEL, type: WidthType.DXA },
            margins: { top: 40, bottom: 100, right: 160 },
            children: [new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [run(label, { bold: true, size: 20 })],
            })],
          }),
          new TableCell({
            width: { size: CONTENT - LABEL, type: WidthType.DXA },
            margins: { top: 40, bottom: 100 },
            children,
          }),
        ],
      })
    ),
  });
}

const cell = (text, o = {}) =>
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: o.after ?? 0, line: 250 },
    children: [run(text, { size: 20, ...o })],
  });

const cellLink = (url) =>
  new Paragraph({ spacing: { after: 40 }, children: [link(url)] });

const REPOS = [
  {
    label: "Field application",
    repo: "https://github.com/devLipeunim/custody-field",
    stack: "React Native 0.86, Expo SDK 57, SQLite",
    what: "Collection on the officer's device. Fingerprints a file or a recording in 4 MB " +
      "chunks, builds a Merkle root, writes the sealed record to local storage and queues a " +
      "custody event. No network operation sits on the collection path. Synchronisation is " +
      "separate, batched and resumes when the service becomes reachable.",
  },
  {
    label: "Backend service",
    repo: "https://github.com/devLipeunim/custody-api",
    live: "https://custody-api-mvgr.onrender.com",
    stack: "Express 5, PostgreSQL 16, Node 20",
    what: "The record. Recomputes every hash it is given, seals items, maintains the append " +
      "only custody chain, verifies files and chains on demand, and generates the one page " +
      "report as a PDF. Hosted on Render with a managed PostgreSQL database.",
  },
  {
    label: "Dashboard",
    repo: "https://github.com/devLipeunim/custody-web",
    live: "https://custody-web.vercel.app",
    stack: "Next.js 15, TypeScript, React 19",
    what: "The reader's view. Cases, exhibits, the custody timeline, the chunk map and the " +
      "verification controls. Server rendered, read only, and deliberately free of hash " +
      "values and enumeration codes outside the appendix.",
  },
];

const TEAM = [
  "ANIAH, Moses Lipeunim",
  "ADESHINA, Ayomide Oluwatofunmi",
  "ALUGBIN, Boluwatife Godwin",
  "MARKSON, Favour",
  "OLADAPO, Olalekan Olanrewaju",
];

const children = [
  new Paragraph({ spacing: { after: 40 }, children: [run("Custody", { bold: true, size: 38 })] }),
  new Paragraph({
    spacing: { after: 60 },
    children: [run("Proving digital evidence has not been changed", { size: 22 })],
  }),
  new Paragraph({
    spacing: { after: 140 },
    children: [run("Team Echelons.  ICSC 2026 Universities Hackathon, Track H.", { size: 18, color: MUTED })],
  }),
  rule(),

  heading("Repositories"),
  body(
    "Three repositories, one system. Each runs independently and is deployable on its own; " +
    "together they carry an exhibit from the scene to a hearing."
  ),
];

for (const r of REPOS) {
  children.push(new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [run(r.label, { bold: true, size: 22 })],
  }));
  const rows = [
    { label: "Repository", children: [cellLink(r.repo)] },
    { label: "Stack", children: [cell(r.stack)] },
    { label: "What it does", children: [cell(r.what)] },
  ];
  if (r.live) rows.splice(1, 0, { label: "Live", children: [cellLink(r.live)] });
  children.push(definitionTable(rows));
}

children.push(
  heading("How the three fit together"),
  body(
    "The field application records a fingerprint of the exhibit before the file has been " +
    "anywhere else, and holds it locally until a connection appears. It then sends the " +
    "fingerprint and the metadata to the backend, never the evidence file itself, which is why " +
    "a synced exhibit is reported as sealed but not yet deposited. The backend recomputes every " +
    "hash it receives, refusing anything internally inconsistent, and extends an append only " +
    "chain in which each entry is bound to the one before it. The dashboard reads that record " +
    "and renders it, including a one page report written for a reader with no technical " +
    "background."
  ),

  heading("Team Echelons"),
);

children.push(...TEAM.map((name, i) =>
  new Paragraph({
    numbering: { reference: "members", level: 0 },
    spacing: { after: i === TEAM.length - 1 ? 160 : 60, line: 260 },
    children: [run(name, { size: 20 })],
  })
));

children.push(
  new Paragraph({
    spacing: { before: 200 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 8 } },
    children: [run(
      "All data used in this system is synthetic and was generated for demonstration. " +
      "No real persons, cases, accounts or personal data are represented.",
      { size: 17, color: MUTED, italics: true }
    )],
  })
);

const doc = new Document({
  title: "Custody: submission summary",
  creator: "Team Echelons",
  numbering: {
    config: [{
      reference: "members",
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 420, hanging: 260 } } },
      }],
    }],
  },
  styles: { default: { document: { run: { font: FONT, size: 20, color: INK } } } },
  sections: [{
    properties: { page: { margin: { top: 1160, bottom: 1160, left: 1160, right: 1160 } } },
    children,
  }],
});

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, await Packer.toBuffer(doc));
console.log(`Written to ${OUT}`);
