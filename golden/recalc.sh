#!/usr/bin/env bash
# Round-trip the golden workbooks through LibreOffice headless so every formula cell
# carries a cached value. Usage: bash golden/recalc.sh   (override the binary with SOFFICE=...)
set -euo pipefail
cd "$(dirname "$0")"

for candidate in "${SOFFICE:-}" "$(command -v soffice || true)" \
    "/c/Program Files/LibreOffice/program/soffice.exe" \
    "/Applications/LibreOffice.app/Contents/MacOS/soffice"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then SOFFICE="$candidate"; break; fi
  SOFFICE=""
done
if [ -z "$SOFFICE" ]; then
  echo "LibreOffice not found. Install it (Windows: winget install -e --id TheDocumentFoundation.LibreOffice) or set SOFFICE." >&2
  exit 1
fi

tmp=.recalc_tmp
rm -rf "$tmp" && mkdir "$tmp"
for f in dues_v2.xlsx dues_v3_REAL.xlsx judge_xlookup.xlsx; do
  "$SOFFICE" --headless --calc --convert-to xlsx --outdir "$tmp" "$f"
  mv "$tmp/$f" "$f"
done
rm -rf "$tmp"
echo "Recalculated with: $SOFFICE"
