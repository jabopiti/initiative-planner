#!/usr/bin/env bash
# PostToolUse hook for Write|Edit.
# Auto-fixes lint issues on the specific src/**/*.ts(x) file just touched,
# so `npm run lint` (AGENTS.md's "before finishing" step) starts clean.
set -euo pipefail

input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')"

case "$file" in
  *src/*.ts|*src/*.tsx) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || true
npx eslint --fix "$file" 2>/dev/null || true
