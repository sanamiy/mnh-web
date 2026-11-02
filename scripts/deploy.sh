#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec npx --yes wrangler@4.156.1 pages deploy public --project-name monday-night-hackathon --branch main "$@"
