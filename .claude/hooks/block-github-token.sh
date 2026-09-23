#!/usr/bin/env bash
# PreToolUse hook for Write|Edit|Bash.
# Blocks the tool call if the new file content or shell command contains a
# GitHub token pattern, per AGENTS.md's Security section: tokens live only
# in browser storage and must never be written to a file, the dataset, a
# commit, or a shell command (which could log or echo it).
set -euo pipefail

input="$(cat)"
content="$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // .tool_input.command // empty')"

if printf '%s' "$content" | grep -qE '(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{10,}'; then
  reason="Blocked: this content matches a GitHub token pattern (ghp_/gho_/github_pat_/etc). AGENTS.md's Security section forbids writing a token to a file, the dataset, a commit, or a shell command — it belongs in browser storage only."
  jq -n --arg reason "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
