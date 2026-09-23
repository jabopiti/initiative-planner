#!/usr/bin/env bash
# List backlog slices that are not yet done but whose dependencies are.
# Replaces hand-parsing every slice-*.md frontmatter and cross-checking
# git log on every invocation of the next-slice skill.
#
# "Done" is inferred from this repo's commit convention: a commit subject
# starting with "Slice <id>:" (case-insensitive). A commit that only
# mentions a slice in passing ("Backlog: slice 003 is deployed") doesn't
# match, since the id has to be the first word after the hash.
#
# Usage: find-eligible.sh
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
backlog="$root/backlog"

done_ids="$(git -C "$root" log --oneline --all 2>/dev/null \
  | grep -oiE '^[a-f0-9]+ slice [0-9]+[a-z]?:' \
  | grep -oiE 'slice [0-9]+[a-z]?' \
  | awk '{print $2}' | sort -u || true)"

field() { # field <file> <key>  ->  raw value after "key:", quotes stripped
  grep -m1 "^$2:" "$1" | sed -E "s/^$2:[[:space:]]*//" | tr -d '"'
}

is_done() {
  printf '%s\n' "$done_ids" | grep -qx "$1"
}

echo "Done per git log: ${done_ids:-<none>}" | tr '\n' ' '
echo

shopt -s nullglob
for f in "$backlog"/slice-*.md; do
  id="$(field "$f" slice_id)"
  is_done "$id" && continue
  [ "$(field "$f" status)" = "valid" ] || continue
  [ "$(field "$f" superseded_by)" = "null" ] || continue

  depends="$(field "$f" depends_on | tr -d '[]' | tr ',' ' ')"
  unmet=""
  for d in $depends; do
    is_done "$d" || unmet="$unmet $d"
  done
  [ -z "$unmet" ] || continue

  echo "ELIGIBLE $id: $(field "$f" title)"
  echo "  depends_on: [$depends ]"
  echo "  recommended_model: $(field "$f" recommended_model)"
  echo "  file: ${f#"$root"/}"
  echo
done
