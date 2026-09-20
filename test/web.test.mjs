// The dashboard as a browser receives it.
//
// Asserts against the served HTML and the client bundle, not merely status
// codes: a page can render while showing "undefined", leaking a database enum,
// or wiring its controls to an unreachable address.
//
// Usage: node test/web.test.mjs      (both the API and the dashboard running)

import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const WEB = process.env.WEB_BASE || "http://localhost:3000";
const API = process.env.API_BASE || "http://localhost:4000";
const PSQL = process.env.PSQL || "/opt/homebrew/opt/postgresql@16/bin/psql";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTDATA = process.env.EVIDENCE_ROOT || path.join(REPO, "testdata");

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const page = async (path) => {
  const res = await fetch(`${WEB}${path}`, { cache: "no-store" });
  return { status: res.status, html: await res.text() };
};
// React writes <!-- --> between adjacent expressions; removed outright rather
// than replaced with a space.
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, PGPASSWORD: "custody" } });
const psql = (f) => sh(PSQL, ["-U", "custody", "-d", "custody", "-h", "localhost", "-q", "-f", f], TESTDATA);
const section = (t) => console.log(`\n${t}`);

// Reset so the assertions below describe a known state.
sh("./scripts/reset-demo.sh", [], REPO);

// ===========================================================================
section("Every route renders");
{
  for (const [path, label] of [
    ["/", "case list"],
    ["/cases/UI-DISC-2026-014", "case detail, disciplinary panel"],
    ["/cases/FRD-2026-088", "case detail, fraud"],
    ["/cases/CID-2026-0041", "case detail, criminal"],
    ["/items/EX-2026-0007", "item detail, intact"],
    ["/items/EX-2026-0010", "item detail, altered"],
    ["/items/EX-2026-0041", "item detail, 8 chunks, collected offline"],
    ["/items/EX-2026-0009", "item detail, with a correction event"],
  ]) {
    const p = await page(path);
    check(p.status === 200, `${label}`, `${p.status} ${path}`);
  }
}

section("Nothing machine shaped reaches the page");
{
  for (const path of ["/", "/cases/UI-DISC-2026-014", "/items/EX-2026-0041", "/items/EX-2026-0009"]) {
    const t = text((await page(path)).html);
    const leaks = [];
    if (/\bundefined\b/.test(t)) leaks.push("undefined");
    if (/\bNaN\b/.test(t)) leaks.push("NaN");
    if (/\[object Object\]/.test(t)) leaks.push("[object Object]");
    if (/\bnull\b/.test(t)) leaks.push("null");
    if (/disciplinary_panel|fraud_investigation/.test(t)) leaks.push("raw forum enum");
    // action enums must be translated before they are shown
    if (/\b(transferred|analysed|accessed|returned)\b(?![ a-z]*(to|for|the))/.test(t) &&
        !/opened for review|returned to the evidence store|transferred to the evidence store/.test(t)) {
      leaks.push("raw action enum");
    }
    if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) leaks.push("ISO timestamp");
    check(leaks.length === 0, `clean output: ${path}`, leaks.join(", "));
  }
}

section("Case list");
{
  const t = text((await page("/")).html);
  check(t.includes("UI-DISC-2026-014") && t.includes("FRD-2026-088") && t.includes("CID-2026-0041"),
    "all three cases listed");
  check(t.includes("Disciplinary panel") && t.includes("Fraud investigation") && t.includes("Criminal"),
    "forums shown in plain language");
  check(/30\.0 MB|31\.0 MB|3[01]\.\d MB/.test(t), "the 30MB item is reflected in the case size");
}

section("Case detail");
{
  const t = text((await page("/cases/UI-DISC-2026-014")).html);
  for (const ref of ["EX-2026-0007", "EX-2026-0008", "EX-2026-0009", "EX-2026-0010"]) {
    check(t.includes(ref), `lists ${ref}`);
  }
  // Nothing is verified straight after a reset, and the page says so rather
  // than asserting an integrity it has not checked.
  check(t.includes("Not yet verified"), "unverified items say so instead of claiming intact");
  check(t.includes("Check the case record"), "the case level chain check is offered");
  check(t.includes("Tunde Okonjo"), "the collecting officer is named");
}

section("Item detail, intact and offline collected");
{
  const t = text((await page("/items/EX-2026-0041")).html);
  check(t.includes("Partial logical extraction"), "description shown");
  check(/8 chunks of 4\.0 MB/.test(t), "chunking is explained on the page", /8 chunks[^.]*/.exec(t)?.[0]);
  check(/4h 35m later/.test(t), "the offline gap is shown as a badge");
  check(t.includes("collected with no network"), "and explained in words");
  check(t.includes("collected from the source device"), "actions are in plain language");
  check(t.includes("Adebayo Adeyemi") && t.includes("Olamide Bello"), "every handler is named");
  check(t.includes("Verify this item now"), "the verify control is present");
  check(t.includes("Open the report") && t.includes("Download PDF"), "both report links are present");
  check(/7\.4306, 3\.8912/.test(t), "collection location shown when recorded");
}

section("Item detail, correction event");
{
  const t = text((await page("/items/EX-2026-0009")).html);
  check(t.includes("a correction was recorded"), "the correction is shown in plain language");
  check(/Corrects entry 2/.test(t), "it names the entry it corrects");
  check(/original was not removed or edited/.test(t), "and explains that nothing was deleted");
}

section("The Verify button can actually reach the API");
{
  const html = (await page("/items/EX-2026-0010")).html;
  const chunks = [...new Set([...html.matchAll(/static\/chunks\/[^"]*?\.js/g)].map((m) => m[0]))];
  let inlined = false;
  for (const c of chunks) {
    const js = await (await fetch(`${WEB}/_next/${c}`)).text();
    if (js.includes(API.replace(/^https?:\/\//, "")) || js.includes(API)) inlined = true;
  }
  check(inlined, "NEXT_PUBLIC_API_BASE is compiled into the client bundle",
    inlined ? API : "the button would silently do nothing");

  // and the endpoints those buttons call must answer from a browser origin
  for (const [path, label] of [
    ["/api/items/EX-2026-0010/verify", "verify endpoint"],
    ["/api/cases/UI-DISC-2026-014/verify", "case chain endpoint"],
    ["/api/items/EX-2026-0010/report", "report endpoint"],
  ]) {
    const res = await fetch(`${API}${path}`, { headers: { Origin: WEB } });
    const cors = res.headers.get("access-control-allow-origin");
    check(res.ok && cors === "*", `${label} answers a cross origin request`, `${res.status} cors=${cors}`);
  }
}

section("A broken chain renders as broken, at the right link");
{
  psql("scripts/tamper-event.sql");
  const t = text((await page("/items/EX-2026-0007")).html);
  const html = (await page("/items/EX-2026-0007")).html;
  check(/This record has been edited/.test(t), "the page says so in plain words");
  check(/lock fails at entry 3/.test(t), "and names the entry", /lock fails at entry \d+/.exec(t)?.[0]);
  check(html.includes("break-point"), "the severed link is rendered at the break");
  check((html.match(/class="broken/g) || []).length === 3, "the three events after the break are marked",
    `${(html.match(/class="broken/g) || []).length}`);
  check(/link broken here/.test(t), "the break carries a visible label");

  // List badges reflect the last verification, so run one first.
  await fetch(`${API}/api/items/EX-2026-0007/verify`);
  await fetch(`${API}/api/items/EX-2026-0010/verify`);
  const list = text((await page("/")).html);
  check(/chain broken/i.test(list), "a broken chain reaches the case list summary");
  check(/altered/i.test(list), "so does an altered file");
  const caseText = text((await page("/cases/UI-DISC-2026-014")).html);
  check(caseText.includes("Altered"), "and the altered item carries an Altered badge");
}

section("A deleted item is caught on the case page");
{
  psql("scripts/delete-item.sql");
  const detail = await page("/cases/UI-DISC-2026-014");
  check(detail.status === 200, "the case page still renders with an item missing");
  const t = text(detail.html);
  check(!t.includes("EX-2026-0009"), "the deleted item is gone from the table");
  const v = await (await fetch(`${API}/api/cases/UI-DISC-2026-014/verify`)).json();
  check(v.missingItems.includes("EX-2026-0009"), "but the case record still names it");
}

section("Failure modes are handled, not crashed through");
{
  const missing = await page("/items/EX-DOES-NOT-EXIST");
  // 200 rather than 404 by design: loading.js places a Suspense boundary
  // around these routes, so the shell streams before the data arrives and the
  // status line is already sent by the time notFound() runs. Removing
  // app/**/loading.js restores the 404 and loses the skeletons.
  check(missing.status < 500, "an unknown item does not produce a server error", `${missing.status}`);
  // Streamed as React Flight data inside a script tag, so it is matched in
  // the raw response rather than the stripped text.
  check(/No such record/.test(missing.html), "and says so in plain words");
  const missingCase = await page("/cases/NO-SUCH-CASE");
  check(missingCase.status < 500, "an unknown case does not either", `${missingCase.status}`);
  check(/No such record/.test(missingCase.html), "and it too says so in plain words");
}

// leave it clean
sh("./scripts/reset-demo.sh", [], REPO);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
