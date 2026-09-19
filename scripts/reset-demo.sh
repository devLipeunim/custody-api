#!/usr/bin/env bash
# Restores the demo to a known clean state. Run between rehearsals.
#
# This is deliberately more careful than "reseed and tamper". tamper-file.js
# flips a byte with XOR 0xff, which is its own inverse, so running it twice
# silently restores the original. A reset built on "tamper again" therefore
# drifts: after two resets the demo item is the wrong way round. Instead we
# keep pristine copies of the evidence and restore from them, so the state
# after every reset is identical to the state after the first one.
#
# Usage: ./scripts/reset-demo.sh
set -euo pipefail

BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTDATA="${EVIDENCE_ROOT:-$BACKEND/testdata}"
PRISTINE="$TESTDATA/.pristine"
PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export PGPASSWORD=custody

echo "==> Checking PostgreSQL"
if ! pg_isready -h localhost -q; then
  echo "    postgres is not accepting connections. Starting it."
  brew services start postgresql@16
  for _ in $(seq 1 15); do pg_isready -h localhost -q && break; sleep 1; done
fi
pg_isready -h localhost

echo "==> Evidence files"
if [ ! -f "$TESTDATA/evidence/case-c/handset-extraction.bin" ]; then
  echo "    generating the 30MB stand-in extraction"
  ( cd "$TESTDATA" && ./scripts/make-large-file.sh )
fi

if [ ! -d "$PRISTINE" ]; then
  echo "    first run: saving pristine copies of the evidence"
  mkdir -p "$PRISTINE"
  ( cd "$TESTDATA/evidence" && find . -type f | while read -r f; do
      mkdir -p "$PRISTINE/$(dirname "$f")"; cp "$f" "$PRISTINE/$f"
    done )
else
  echo "    restoring evidence from pristine copies"
  ( cd "$PRISTINE" && find . -type f | while read -r f; do
      cp "$f" "$TESTDATA/evidence/$f"
    done )
fi

echo "==> Loading schema"
psql -U custody -d custody -h localhost -q -v ON_ERROR_STOP=1 -f "$BACKEND/schema.sql"

echo "==> Seeding synthetic data"
node "$BACKEND/scripts/seed.js" "$TESTDATA/seed.json"

echo "==> Putting EX-2026-0010 into its altered state for the demo"
( cd "$TESTDATA" && node scripts/tamper-file.js evidence/case-a/circulated-paper.txt 900 | sed 's/^/    /' )

echo
echo "Demo reset complete."
echo "  EX-2026-0010 is ALTERED  (chunk 0)"
echo "  everything else is intact, all chains intact"
echo "  the 30MB extraction EX-2026-0041 is intact and ready to be tampered live"
