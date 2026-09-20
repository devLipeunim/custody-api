# Demo checklist and script

Nine steps, roughly six minutes. Rehearse twice end to end, including the failure paths.
Step 4 is the moment. Let a judge do it, not us.

---

## Before the room fills

Decide on day one which machine presents, seed it early, and rehearse the reset on that
machine specifically. A reset that works on a developer's laptop and not the presenter's is a
failure mode worth ruling out in advance.

```bash
# 1. database up
brew services start postgresql@16          # or: sudo service postgresql start
pg_isready -h localhost

# 2. clean demo state, and confirm it
cd hackathonBackend
npm run test:acceptance                    # expect 23 passed, 0 failed

# 3. the two processes
npm run dev                                # API on :4000
cd ../hackathonWebApp && npm run dev       # dashboard on :3000
```

Then, on the phone:

- Join the **same network** as the laptop. If the venue wifi is hostile, put the laptop on
  the phone's hotspot. Do this before you need it.
- Open the field app, tap **Setup**, and paste the LAN address the API printed on startup.
  It looks like `http://172.20.10.6:4000`. Never `localhost`: on a phone, localhost is the phone.
- Confirm the status dot is green, then **turn airplane mode on**. The dot goes grey. That is
  the state you present from.

Have ready: the printed report, a text editor open on
`custody-testdata/evidence/case-c/handset-extraction.bin`'s folder, and a terminal in
`custody-testdata/`.

---

## The script

**1. Collect, with no network.** Airplane mode is already on. Tap Collect evidence, pick a
file. The progress bar shows chunk 1 of 8, 2 of 8, and so on. The item appears as
**Sealed, not synced** with the short fingerprint. The header shows **1 pending**.

> Say: the fingerprint was taken here, on this device, at the scene, before the file went
> anywhere. The requirement to work through power and network cuts is answered by the
> architecture rather than by a policy.

**2. Turn the network on.** Within a couple of seconds the dot goes green and it syncs by
itself. The badge becomes **Synced** and the server's own timestamp appears beneath the
device's.

> Say: the device clock is the device's. The server stamps its own on arrival, and the report
> shows both, because a defence can challenge a phone clock and we are not going to hide that.

**3. Open the dashboard** and show the custody timeline for the item. One row per hand it
passed through, in plain words, with the knotted line running down the side.

**4. Hand a judge the file and let them edit it.** Any byte. Then press **Verify this item
now**.

```bash
# if they would rather we did it, or to be sure of the chunk
cd custody-testdata
node scripts/tamper-file.js evidence/case-c/handset-extraction.bin 21000000
```

Red result. The chunk map lights up: seven green blocks, one red. We name the byte range,
20,971,520 to 25,165,823.

> Say: hashing tells you something changed. This tells you which part changed. In a hearing
> that is a different kind of claim.

**5. Edit a custody event directly in the database.**

```bash
psql -U custody -d custody -h localhost -f scripts/tamper-event.sql
```

Reload the item page. The chain breaks at entry 3, the line renders visibly severed at that
exact link, and everything above it stays verified.

> Say: the table is append only and the database refuses ordinary edits. We disabled that guard
> on purpose to show you this. Even with the guard off, the record gives itself away.

**6. Delete an item outright.**

```bash
psql -U custody -d custody -h localhost -f scripts/delete-item.sql
```

On the case page press **Check the case record**. Four items were recorded as added, three
remain, and it names `EX-2026-0009`.

> Say: the bead is gone, but the knot it was tied into is still there.

**7. Print the report.** Hand the physical page to a judge and let them read it.

> Quote the brief: a process that is technically perfect but cannot be explained in a hearing
> has not solved the problem.

**8. Report the non technical user test.** What confused them, and what we changed.

**9. The limits slide.** Deliver it confidently, not apologetically.

---

## Reset between rehearsals

```bash
cd hackathonBackend && npm run demo:reset
```

Restores the evidence from pristine copies, reloads the schema, reseeds, and puts
`EX-2026-0010` back into its altered state. The result is identical every time, which is the
whole point.

To reset the phone as well: **Setup → Clear local record**. That clears the device only; the
server keeps everything already synced.

---

## If something breaks on stage

| Symptom | Cause | Fix |
|---|---|---|
| Phone says sync failed | phone and laptop on different networks | hotspot, then re-check the address in Setup |
| Dashboard says API not reachable | API not running | `cd hackathonBackend && npm run dev` |
| `psql: connection refused` | postgres not started | `brew services start postgresql@16` |
| Verify says `missing` | evidence file moved or deleted | `npm run demo:reset` |
| Chain already broken at the start | a previous rehearsal left it tampered | `npm run demo:reset` |

If the phone cannot be made to reach the laptop at all, the demo still runs: step 1 and 2 are
the only steps that need it, and `test/sync.test.mjs` performs the same sync against the API
from the laptop. Say what you are doing and why. Do not pretend.
