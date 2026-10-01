#!/bin/bash
# SessionStart: install dependencies in remote (web/cloud) sessions, where the
# container starts from a fresh clone with no node_modules, so every npm script fails.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}"

# Skip when node_modules is already current with the lockfile (resumed container).
if [ -f node_modules/.package-lock.json ] && ! [ package-lock.json -nt node_modules/.package-lock.json ]; then
  exit 0
fi

# --ignore-scripts matches CI; `npm ci` is the reproducible install from the lockfile.
npm ci --ignore-scripts --no-audit --no-fund
