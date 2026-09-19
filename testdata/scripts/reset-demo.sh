#!/usr/bin/env bash
# Restores the demo to a clean state. Run between rehearsals.
set -e
echo "Dropping and reseeding..."
psql -d custody -f ../web/schema.sql
node ../web/scripts/seed.js seed.json
echo "Regenerating altered demo item..."
node scripts/tamper-file.js evidence/case-a/circulated-paper.txt 900
echo "Demo reset. EX-2026-0010 is altered, everything else intact."
