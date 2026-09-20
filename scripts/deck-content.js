// Slide content for the presentation deck.
//
// Single source for both builds: make-deck.js emits the PDF, make-deck-pptx.js
// emits the editable PowerPoint. Keeping the text here prevents the two from
// drifting apart.
//
// Every text block carries explicit lines rather than relying on wrapping, so
// both renderers compute identical block heights and identical layout.
//
// Block types:
//   statement  large single idea
//   title      slide heading
//   lead       supporting sentence
//   rows       aligned label and value pairs
//   qa         question and answer pairs
//   quote      attributed quotation
//   diagram    named figure drawn by the renderer, with a fixed height

export const DECK = [
  {
    layout: "title",
    title: "Custody",
    subtitle: "Proving digital evidence has not been changed",
    meta: [
      "ICSC 2026 Universities Hackathon, Track H",
      "Team Captain, five members, University of Ibadan",
    ],
    notes: "Ten seconds. Do not read the slide.",
  },
  {
    kicker: "The problem",
    blocks: [
      { type: "lead", lines: ["A flash drive. An email. A shared laptop."] },
      { type: "lead", lines: ["A hearing, eleven months later."] },
      { type: "statement", lines: [
        "Nobody can prove the file is",
        "the one that was collected.",
      ] },
      { type: "lead", lines: ["Not because anyone changed it. Because nobody can show they did not."] },
    ],
    notes: "Tell it as a story. Evidence goes onto a flash drive, gets emailed between " +
      "officers, sits on a shared machine, and arrives at a hearing a year later. Maybe " +
      "nobody touched it. Nobody can prove that either.",
  },
  {
    kicker: "Where this happens",
    blocks: [
      { type: "title", lines: ["Three settings"] },
      { type: "rows", rows: [
        ["Cybercrime cases", "phone extractions, server logs"],
        ["Fraud investigations", "transaction records, audit logs"],
        ["Disciplinary panels", "message exports, access logs"],
      ] },
      { type: "lead", lines: [
        "In each one the handling record is on paper, if it exists at all,",
        "and the evidence is a file that anyone could have opened.",
      ] },
    ],
    notes: "Name the university panel explicitly. The room has sat on one.",
  },
  {
    kicker: "The idea",
    blocks: [
      { type: "title", lines: ["Same file, same code. Every time."] },
      { type: "diagram", name: "fingerprints", height: 132 },
      { type: "lead", lines: [
        "One character changed in a 40 page statement.",
        "Nothing else about the file is different.",
      ] },
    ],
    notes: "No hashes on this slide. Words only. The code is taken at the scene, on the " +
      "collecting officer's own phone, before the file goes anywhere else.",
  },
  {
    kicker: "The idea, part two",
    blocks: [
      { type: "title", lines: [
        "Every entry is knotted to the one",
        "before it, like beads on a string.",
      ] },
      { type: "diagram", name: "beads", height: 118 },
      { type: "lead", lines: ["You cannot quietly remove a bead from the middle."] },
    ],
    notes: "This metaphor is the one they will remember. Use it twice in the talk.",
  },
  {
    kicker: "How it fits together",
    blocks: [
      { type: "title", lines: ["Architecture"] },
      { type: "diagram", name: "architecture", height: 224 },
      { type: "lead", lines: ["One laptop, or hosted. Nothing paid for. Works with the network down."] },
    ],
    notes: "Twenty seconds. Do not walk through every box. The same code runs on a laptop or " +
      "hosted; the dashboard on show is the hosted one.",
  },
  {
    kicker: "Power cuts and dead networks",
    layout: "split",
    blocks: [
      { type: "title", lines: [
        "The fingerprint is taken at",
        "the scene, on the officer's",
        "own device, before the file",
        "goes anywhere.",
      ] },
      { type: "lead", lines: [
        "Nothing between the scene and",
        "the server can alter it undetected.",
      ] },
    ],
    notes: "The requirement to work through power and network cuts is answered by the " +
      "architecture rather than by a policy.",
  },
  {
    kicker: "One extraction can exceed 100GB",
    blocks: [
      { type: "title", lines: [
        "We say which part changed,",
        "not just that something did.",
      ] },
      { type: "diagram", name: "chunks", height: 104 },
      { type: "lead", lines: [
        "One byte altered in thirty million. Part 6 of 8 differs, so the",
        "change lies between byte 20,971,520 and byte 25,165,823.",
      ] },
    ],
    notes: "Tested at 30MB and extrapolated. Memory use stays flat as the file grows. Do " +
      "not overclaim; the honesty is the point.",
  },
  {
    layout: "word",
    word: "Demo",
    notes: "Six minutes. Follow DEMO.md.",
  },
  {
    kicker: "The deliverable",
    blocks: [
      { type: "title", lines: ["One page. No jargon. No hashes."] },
      { type: "qa", rows: [
        ["Is it unchanged?", "Yes."],
        ["How do we know?", "A fingerprint was taken at collection, and checked again."],
        ["Who has handled it?", "Four people, named, with dates."],
        ["Could the list be edited?", "No, and here is why."],
      ] },
      { type: "quote", lines: [
        "A process that is technically perfect but cannot be",
        "explained in a hearing has not solved the problem.",
      ], attribution: "the brief" },
    ],
    notes: "Replace this slide with a photograph of the printed report in someone's hands.",
  },
  {
    kicker: "What we did not solve",
    blocks: [
      { type: "title", lines: ["Honest limits"] },
      { type: "rows", compact: true, rows: [
        ["A corrupt collector", "protected from collection onward, not before it"],
        ["The device clock", "both clocks shown, the phone's not vouched for"],
        ["Scale", "tested at 30MB, extrapolated, not a real extraction"],
        ["Per officer signing", "tied to a login, not to a person's key"],
        ["Storage", "change is proven, deletion is not prevented"],
        ["Bulk compromise", "single edits are caught, a full rewrite is not"],
      ] },
    ],
    notes: "Deliver this confidently, not apologetically. If pressed on the last row: the events " +
      "table is append only and witnesses the fingerprint, so editing one record is reported. " +
      "Defeating it means dropping the trigger and rewriting every table.",
  },
  {
    kicker: "If asked",
    blocks: [
      { type: "title", lines: ["Why not a blockchain?"] },
      { type: "lead", lines: [
        "A blockchain solves distrust between parties with no",
        "shared authority. A court has one.",
      ] },
      { type: "lead", lines: [
        "A hash chain and append only storage give the same tamper",
        "evidence, and can be explained to a panel in one sentence.",
      ] },
    ],
    notes: "One sentence, then stop.",
  },
];

/** Collects every string a renderer will draw, for the dash check. */
export function allText(deck = DECK) {
  const out = [];
  for (const s of deck) {
    if (s.kicker) out.push(s.kicker);
    if (s.title) out.push(s.title);
    if (s.subtitle) out.push(s.subtitle);
    if (s.word) out.push(s.word);
    for (const m of s.meta ?? []) out.push(m);
    for (const b of s.blocks ?? []) {
      for (const l of b.lines ?? []) out.push(l);
      for (const [a, c] of b.rows ?? []) { out.push(a); out.push(c); }
      if (b.attribution) out.push(b.attribution);
    }
  }
  return out;
}
