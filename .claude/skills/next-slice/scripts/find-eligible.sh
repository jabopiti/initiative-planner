#!/usr/bin/env bash
# List backlog slices that are not yet done but whose dependencies are.
# Replaces hand-parsing every slice-*.md frontmatter and cross-checking
# git log on every invocation of the next-slice skill.
#
# "Done" is inferred from this repo's commit convention: a commit subject
# starting with "Slice <id>:" (case-insensitive), reachable from this branch
# or origin/main — i.e. merged, or delivered in this session. A commit that
# only mentions a slice in passing ("Backlog: slice 003 is deployed")
# doesn't match, since the id has to be the first word after the hash.
#
# Slices run in parallel sessions, each on its own branch. A slice with a
# "Slice <id>:" or "Slice <id> spec:" commit on another remote branch that
# isn't merged yet is reported as in progress there, so two sessions don't
# pick the same slice, and a slice depending on it isn't eligible until it
# is merged.
#
# Usage: find-eligible.sh
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
backlog="$root/backlog"

git -C "$root" fetch -q origin 2>/dev/null || true
base="HEAD"
git -C "$root" rev-parse -q --verify origin/main >/dev/null && base="HEAD origin/main"

slice_ids() { # stdin: git log --oneline  ->  ids of "Slice <id>:" subjects
  grep -oiE '^[a-f0-9]+ slice [0-9]+[a-z]?:' | grep -oiE 'slice [0-9]+[a-z]?' \
    | awk '{print tolower($2)}' | sort -u || true
}

# shellcheck disable=SC2086
done_ids="$(git -C "$root" log --oneline $base 2>/dev/null | slice_ids)"

in_progress="" # lines "<id> <branch>"
current="$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
for ref in $(git -C "$root" for-each-ref --format='%(refname:short)' refs/remotes/origin 2>/dev/null); do
  case "$ref" in origin/main|origin/HEAD|origin|"origin/$current") continue ;; esac
  ids="$(git -C "$root" log --oneline "origin/main..$ref" 2>/dev/null \
    | grep -oiE '^[a-f0-9]+ slice [0-9]+[a-z]?( spec)?:' | grep -oiE 'slice [0-9]+[a-z]?' \
    | awk '{print tolower($2)}' | sort -u || true)"
  for id in $ids; do in_progress="$in_progress$id ${ref#origin/}"$'\n'; done
done

field() { # field <file> <key>  ->  raw value after "key:", quotes stripped
  grep -m1 "^$2:" "$1" | sed -E "s/^$2:[[:space:]]*//" | tr -d '"'
}

is_done() {
  printf '%s\n' "$done_ids" | grep -qx "$1"
}

echo "Done per git log: ${done_ids:-<none>}" | tr '\n' ' '
echo
busy="$(printf '%s' "$in_progress" | awk 'NF' | sort -u)"
if [ -n "$busy" ]; then
  echo "In progress on other branches (not merged):"
  printf '%s\n' "$busy" | while read -r id br; do
    is_done_id=0; printf '%s\n' "$done_ids" | grep -qx "$id" && is_done_id=1
    [ "$is_done_id" = 1 ] || echo "  $id on $br"
  done
fi
echo

shopt -s nullglob
for f in "$backlog"/slice-*.md; do
  id="$(field "$f" slice_id)"
  if is_done "$id"; then
    # Only when main hasn't archived it either: a branch behind origin/main
    # gets the move by merging main, and moving it again would conflict.
    rel="${f#"$root"/}"
    if [ "$base" = "HEAD" ] || git -C "$root" cat-file -e "origin/main:$rel" 2>/dev/null; then
      echo "NOT ARCHIVED $id: done per git log, but $rel is still open — move it to backlog/done/"
      echo
    fi
    continue
  fi
  [ "$(field "$f" status)" = "valid" ] || continue
  [ "$(field "$f" superseded_by)" = "null" ] || continue

  depends="$(field "$f" depends_on | tr -d '[]' | tr ',' ' ')"
  unmet=""
  for d in $depends; do
    is_done "$d" || unmet="$unmet $d"
  done
  [ -z "$unmet" ] || continue

  elsewhere="$(printf '%s' "$busy" | awk -v id="$id" '$1 == id {print $2}' | paste -sd, -)"
  if [ -n "$elsewhere" ]; then
    echo "ELIGIBLE $id (IN PROGRESS on $elsewhere — pick another): $(field "$f" title)"
  else
    echo "ELIGIBLE $id: $(field "$f" title)"
  fi
  echo "  depends_on: [$depends ]"
  echo "  recommended_model: $(field "$f" recommended_model)"
  echo "  file: ${f#"$root"/}"
  echo
done
