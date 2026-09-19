#!/usr/bin/env bash
# Generates the stand-in for a phone extraction.
#
# 30MB is deliberate. The brief says a real extraction can exceed 100GB, so we
# need an answer for scale. What we are actually proving is that memory use
# stays flat as the file grows, because we hash in 4MB pieces and never hold
# the whole file at once. 30MB gives 8 chunks, which is enough for the chunk
# map visual, and hashes fast enough to rehearse the demo repeatedly.
#
# Not committed to git. Run once before the demo.
set -e
OUT="${1:-evidence/case-c/handset-extraction.bin}"
SIZE_MB="${2:-30}"
mkdir -p "$(dirname "$OUT")"
echo "Generating ${SIZE_MB}MB at ${OUT} ..."
dd if=/dev/urandom of="$OUT" bs=1M count="$SIZE_MB" status=none
echo "Done. Size: $(du -h "$OUT" | cut -f1)"
echo "Chunks at 4MB: $(( (SIZE_MB + 3) / 4 ))"
