#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 scripts/prerender.py
exec npx --yes wrangler@4.156.1 pages deploy _site --project-name monday-night-hackathon --branch main "$@"
