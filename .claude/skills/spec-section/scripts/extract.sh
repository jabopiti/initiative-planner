#!/usr/bin/env bash
# Print one numbered section of docs/spec.md (heading through the next
# heading of equal or higher level), so callers never need to read the
# whole 1700+ line document for a single §-reference.
#
# Usage: extract.sh <section-number> [spec-file]
#   extract.sh 5.6
#   extract.sh 7.2
#   extract.sh --toc            all headings (numbered, ~80 lines)
#   extract.sh --find <term>    sections whose body mentions <term>
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: extract.sh <section-number> [spec-file]" >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

case "$1" in
  --toc)
    grep -nE '^#{1,4} ' "${2:-$root/docs/spec.md}"
    exit 0
    ;;
  --find)
    [ $# -ge 2 ] || { echo "usage: extract.sh --find <term>" >&2; exit 1; }
    awk -v term="$2" '
      /^#+ / { h = $0; hl = NR }
      tolower($0) ~ tolower(term) && h != last { print hl ": " h; last = h }
    ' "${3:-$root/docs/spec.md}"
    exit 0
    ;;
esac

section="$1"
spec="${2:-$root/docs/spec.md}"

if [ ! -f "$spec" ]; then
  echo "spec file not found: $spec" >&2
  exit 1
fi

out="$(awk -v want="$section" '
  function heading_level(line,    i, n) {
    n = 0
    for (i = 1; i <= length(line); i++) {
      if (substr(line, i, 1) == "#") n++
      else break
    }
    return n
  }
  {
    lvl = heading_level($0)
    if (lvl > 0) {
      rest = $0
      sub(/^#+[ \t]+/, "", rest)
      split(rest, arr, " ")
      numtok = arr[1]
      gsub(/\.$/, "", numtok)
      if (found && lvl <= foundLevel) exit
      if (!found && numtok == want) {
        found = 1
        foundLevel = lvl
        print
        next
      }
    }
    if (found) print
  }
' "$spec")"

if [ -z "$out" ]; then
  echo "no heading numbered '$section' found in $spec" >&2
  exit 1
fi

printf '%s\n' "$out"
