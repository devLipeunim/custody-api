# How to test Custody

Written for the team. Read this before the first rehearsal.

The tests are arranged as a ladder of claims. Each rung proves one thing the pitch asserts,
and each rung assumes the one below it holds. If you work up the ladder in order, by the time
you reach the top you will understand the system, because every claim we make on stage has a
command underneath it that either passes or does not.

If you only have ten minutes, do [Level 0](#level-0-prove-the-spine-by-hand) and
[Level 4](#level-4-the-nine-acceptance-tests). Level 0 teaches you what the product is. Level 4
tells you whether the demo will work.

---

## Before anything

```bash
brew services start postgresql@16     # or: sudo service postgresql start
pg_isready -h localhost               # must say "accepting connections"

cd hackathonBackend
npm install
npm run demo:reset                    # clean, known state
npm run dev                           # API on :4000, leave it running

cd ../hackathonWebApp
npm install
npm run dev                           # dashboard on :3000, leave it running
```

Two terminals stay open from here on. Most suites need the API; the web suite needs both.

**Always start from `npm run demo:reset`.** Every expected result in this document assumes that
state. A suite that fails on a dirty database tells you nothing.

---

## Level 0: prove the spine by hand

Do this once, by hand, before you run any automated test. It takes four minutes and it is the
whole product in miniature. Everything else is this idea with paperwork around it.

```bash
cd hackathonBackend

# 1. What is this file's fingerprint?
curl -s localhost:4000/api/items/EX-2026-0041/verify | python3 -m json.tool
```

Read the output. `fileIntegrity: "intact"`, and `expectedRootHash` equals `actualRootHash`.
The first was computed when the item was collected. The second was computed just now, by
reading the file off the disk. They match, so the file has not changed.

```bash
# 2. Change one byte. One.
cd testdata
node scripts/tamper-file.js evidence/case-c/handset-extraction.bin 21000000
```

It tells you it flipped byte 21,000,000 and that this lands in chunk 5.

```bash
# 3. Ask again.
curl -s localhost:4000/api/items/EX-2026-0041/verify | python3 -m json.tool
```

Now `fileIntegrity: "altered"`, `alteredChunks: [5]`, and a byte range of 20,971,520 to
25,165,823.

Stop and look at that. We changed **one byte out of thirty million** and the system named the
four megabyte window it happened in. That is the difference between "the hash does not match"
and something a panel can act on, and it is the reason we hash in chunks rather than hashing
the file whole.

```bash
# 4. Put it back. The tamper script XORs, so running it again undoes it.
node scripts/tamper-file.js evidence/case-c/handset-extraction.bin 21000000
cd ..
```

Now do the same to the **record** rather than the file:

```bash
psql -U custody -d custody -h localhost -c \
  "UPDATE custody_events SET note = 'edited' WHERE seq = 0;"
```

It refuses: `ERROR: custody_events is append only`. The database itself will not let you,
which is the point. A guard written only in application code is a guard that a direct database
connection walks past.

```bash
# Now break it on purpose, with the guard deliberately switched off
psql -U custody -d custody -h localhost -f testdata/scripts/tamper-event.sql
curl -s localhost:4000/api/items/EX-2026-0007/chain | python3 -m json.tool | head -20
```

`chainIntegrity: "broken"`, `chainBreakAtSeq: 2`. We did not record that something was edited.
We **recomputed the chain and it stopped adding up** at entry 2. Nobody had to be trusted.

```bash
# And notice this, because it is the part people miss:
curl -s localhost:4000/api/items/EX-2026-0007/verify | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d['fileIntegrity'], d['chainIntegrity'])"
# intact broken
```

The **file** is untouched. The **handling record** was edited. Those are different failures
with different consequences, which is why the system always answers them separately and the
report keeps them in separate sections. If you learn one thing from this document, learn that.

```bash
npm run demo:reset
```

---

## Level 1: the field app agrees with the server

```bash
npm run test          # runs parity, api, sync and mobile
```

Or, to understand them one at a time:

### `node test/device-parity.test.mjs`, 13 assertions, needs no server

The most important suite in the repository and the least obvious.

The phone computes a fingerprint. Months later the server recomputes it. If those two pieces of
code ever disagree by so much as a separator character, **every fingerprint ever taken in the
field becomes unverifiable** and nothing in the system means anything. This suite takes the
Expo app's hashing rules, reimplements them in Node, and asserts the output is byte identical
to the server's on real files, including the eight chunk tree and odd node promotion at 1, 2,
3, 5, 7, 8 and 9 chunks.

**If this fails, stop.** Do not debug anything else. Two implementations of the same rule have
drifted, and the fix is to decide which one is right before touching anything else.

### `node test/api.test.mjs`, 104 assertions

Every endpoint, and more usefully, every *contract*. It does not merely check that a route
answers; it checks that the response carries the exact field names the dashboard and the phone
destructure. A renamed field passes a route test and fails on stage.

It also covers the paths we hope never to need: malformed JSON, unknown officers, actions
outside the agreed list, an injection attempt in a path parameter, and a client supplying an
event hash that disagrees with the server's.

### `node test/sync.test.mjs`, 14 assertions

One officer, one scene, no signal, then a sync five hours later. Asserts the item is sealed,
the events land in order, the server stamps its own clock, and the five hour gap survives the
round trip.

### `node test/mobile.test.mjs`, 33 assertions

Imports the field app's **own** payload builder from `hackathonMobile/src/payload.js` and posts
what it produces at the live API. Not a copy of the builder: a copy would pass forever while
the real app drifted away from it.

Set `MOBILE_REPO` if the app is checked out elsewhere, or `SKIP_MOBILE=1` to skip.

---

## Level 2: the dashboard says what we think it says

```bash
npm run test:web      # 52 assertions, needs BOTH servers running
```

This is not a set of 200 checks. It reads the served HTML and asserts:

- No `undefined`, `NaN`, `[object Object]` or ISO timestamp reaches the page
- No raw database enum reaches the page. A panel member must never see `disciplinary_panel`
  or `analysed`; they see "Disciplinary panel" and "examined"
- `NEXT_PUBLIC_API_BASE` is compiled into the client bundle, so the Verify button can actually
  reach the API rather than silently doing nothing
- When the chain is broken, the break renders at the correct link and the three events after it
  are marked
- An unknown reference is a 404 with readable wording, not a server error

The enum check is worth understanding. The report is judged on whether a non technical reader
can follow it, and raw enum values are the single most common way a document announces that a
machine wrote it. The test exists so that nobody can quietly reintroduce one.

### Testing the loading states and the motion

Skeletons are hard to see on a fast local network, which is exactly why they are easy to get
wrong. Force them into view:

1. Open the dashboard, then in the browser's dev tools set the network to **Slow 3G**
2. Navigate between the case list, a case, and an item

You should see a grey outline in the shape of the real content, and when the content arrives
**nothing should jump**. If the page reflows when the data lands, the skeleton is the wrong
shape and it is doing more harm than a blank panel would.

Do the same for verification, which is the one that matters most: press **Verify this item
now** on `EX-2026-0041` and watch. The result area should already be the right size, including
the row of chunk blocks, so that a red result does not shove the page around at the moment
somebody is reading it.

A shortcut for the demo: **`/items/EX-2026-0041?verify=1`** runs the check on arrival, so you
can send a result as a link instead of telling someone where to click.

Then check we have not trapped anyone who cannot tolerate motion:

- macOS: System Settings, Accessibility, Display, **Reduce motion**
- Reload the dashboard

Everything should appear immediately and be entirely legible, with no shimmer and no fades.
If any animation survives, it has been written outside the `prefers-reduced-motion` rule at
the bottom of `globals.css` and needs moving inside it.

### One known trade

The detail pages return **200 rather than 404** for a reference that does not exist. The page
itself correctly says "No such record". The cause is that `loading.js` lets Next stream the
shell before the data arrives, which is what makes the skeletons possible, and once the shell
has gone out the status line cannot be changed. We took the skeleton on every page view over a
status code nothing in this system reads. Delete `app/**/loading.js` to reverse that choice.

---

## Level 3: things only a human can test

Automated tests cannot do these, and two of them are worth marks.

### 3a. Seal an item with the network off

The only test of the thing the whole architecture exists for.

1. Phone and laptop on the same network. Open the field app, tap **Setup**, paste the LAN
   address the API printed at startup. Never `localhost`: on a phone, localhost is the phone.
2. Confirm the status dot is green.
3. **Turn airplane mode on.** The dot goes grey.
4. Collect a file. Watch the progress bar move chunk by chunk.
5. Confirm: the item shows **Sealed, not synced**, the header shows **1 pending**, and a short
   fingerprint is displayed. All of that happened with no network.
6. Turn the network back on. Within a couple of seconds it syncs by itself. The badge becomes
   **Synced** and the server's timestamp appears under the device's.

If step 5 needs a network, the architecture is wrong, not the test.

### 3b. Give the report to someone who is not a programmer

**This is a graded deliverable and it cannot be faked.** Find a law student, or anyone outside
computer science. Hand them the printed page. Say nothing.

Ask afterwards:

- What is this document telling you?
- Is the evidence changed or not? How do you know?
- Is there anything here you could not follow?

Write down what confused them and what you changed in response. That goes on slide 11 and into
the submission. **Do not invent the result.** Almost no other team will have done this, and an
honest "they did not understand the phrase X, so we changed it to Y" is worth more than any
claim we could make up.

### 3c. Read the report yourself, out loud

Generate it, print it, read it aloud to another person on the team.

```bash
curl -s "localhost:4000/api/items/EX-2026-0007/report?download=1" -o report.pdf && open report.pdf
```

Anything you stumble over reading aloud is a sentence a magistrate will stumble over silently.

---

## Level 4: the nine acceptance tests

```bash
npm run test:acceptance     # 23 assertions
```

This runs the nine tests named in the test data pack, end to end, resets the demo twice along
the way, and leaves the system in the clean demo state. It is the closest thing we have to
"will the demo work".

It covers the file tamper, the chunk localisation, the append only guard, the event tamper,
the item deletion caught by the case chain, both report generations, and the fact that the
reset is repeatable.

**Run this before every rehearsal and once more before presenting.**

Test 8 is the phone and is listed at the end as a manual step, because it cannot be automated
from a laptop. Do 3a above.

---

## Reading a failure

| Symptom | What it means | First move |
|---|---|---|
| `device-parity` fails | the phone and server no longer compute the same fingerprint | stop everything, fix this first |
| `api` contract check fails | a field was renamed; a consumer is now reading `undefined` | find both sides, agree on one name |
| `verify` says `missing` | the file is not where `storage_path` says | `npm run demo:reset` |
| `verify` says `awaiting_file` | sealed in the field, exhibit not deposited yet | correct behaviour, not a bug |
| chain broken before you broke it | a previous rehearsal left it tampered | `npm run demo:reset` |
| dashboard says API unreachable | the API is not running | `npm run dev` in `hackathonBackend` |
| `psql: connection refused` | postgres is not started | `brew services start postgresql@16` |
| phone cannot sync | different networks, or `localhost` in Setup | hotspot, then re-check the address |

A failing test is a claim we can no longer make on stage. Treat it that way.

---

## What we deliberately do not test

Say these out loud if asked. They are choices, not oversights.

- **A real 100GB extraction.** We tested at 30MB and extrapolated. What we can defend is that
  memory use stays flat as the file grows, because we never hold the whole file at once, and
  that is measured rather than asserted.
- **A corrupt collector.** No test can cover this, because it is outside the system. If the
  officer alters the file before sealing it, we faithfully prove the integrity of altered
  evidence. It is on the limits slide.
- **Concurrent officers on one item.** The append path locks the item row so two devices cannot
  claim the same sequence number, but we have not tested it under real contention.
- **Browsers other than the one on the presenting laptop.** Decide which machine presents, and
  test on that machine.

---

## The routine

**Every morning**

```bash
brew services start postgresql@16
cd hackathonBackend && npm run demo:reset && npm test
```

**Before every rehearsal**

```bash
npm run test:acceptance       # expect 23 passed, 0 failed
```

**Before presenting**

```bash
npm run demo:reset
npm run test:acceptance
npm run test:web
```

Then follow `DEMO.md` from the top, including the phone setup.

Full sweep, all six suites, 239 assertions:

```bash
npm test && npm run test:web && npm run test:acceptance
```
