#!/bin/sh
# Rebuilds the game library: catalog from the console, then artwork, then descriptions.
# Usage: scripts/refresh-library.sh [--skip-catalog]
set -e
cd "$(dirname "$0")/.."
npx tsx tools/library/consoles.ts > output/consoles.log 2>&1
[ "$1" = "--skip-catalog" ] || npx tsx --env-file=.env tools/library/build-catalog.ts
npx tsx tools/library/art.ts > output/art.log 2>&1
npx tsx tools/library/describe.ts > output/describe.log 2>&1
echo "Library refreshed."
