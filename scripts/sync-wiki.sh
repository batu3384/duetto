#!/usr/bin/env bash
# Sync wiki/ → GitHub Wiki (.wiki.git). Requires: gh, rsync, git.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-batu3384/duetto}"
WIKI_SLUG="${REPO}.wiki"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$ROOT/wiki"
WORK="$ROOT/.wiki.git"

if [[ ! -d "$SRC" ]]; then
  echo "Missing wiki source: $SRC" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI required: https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login" >&2
  exit 1
fi

TOKEN="$(gh auth token)"
AUTH_REMOTE="https://x-access-token:${TOKEN}@github.com/${WIKI_SLUG}.git"
PUBLIC_WIKI="https://github.com/${REPO}/wiki"

wiki_remote_exists() {
  git ls-remote --quiet "$AUTH_REMOTE" HEAD >/dev/null 2>&1
}

bootstrap_hint() {
  cat <<EOF
GitHub Wiki git repo not initialized yet.

First-time only:
  1. Open ${PUBLIC_WIKI}/_new
  2. Title: Home → Save Page (body can be empty)
  3. Re-run: ./scripts/sync-wiki.sh

EOF
  if command -v gh >/dev/null 2>&1; then
    gh browse --repo "$REPO" "wiki/_new" 2>/dev/null || true
  elif [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    open "${PUBLIC_WIKI}/_new" 2>/dev/null || true
  fi
}

echo "→ Source: $SRC"
echo "→ Remote: https://github.com/${WIKI_SLUG}.git"

if ! wiki_remote_exists; then
  bootstrap_hint
  echo "Waiting up to 120s for wiki git repo (create Home page in browser)…" >&2
  for _ in $(seq 1 60); do
    if wiki_remote_exists; then
      echo "Wiki git repo detected."
      break
    fi
    sleep 2
  done
  if ! wiki_remote_exists; then
    echo "Wiki git repo still missing. Create Home page, then re-run sync." >&2
    exit 1
  fi
fi

rm -rf "$WORK"
git clone --quiet "$AUTH_REMOTE" "$WORK"

rsync -a --delete \
  --exclude='.git/' \
  --exclude='README.md' \
  "$SRC/" "$WORK/"

cd "$WORK"
git add -A

if git diff --staged --quiet; then
  echo "Wiki unchanged — nothing to push."
  echo "URL: $PUBLIC_WIKI"
  exit 0
fi

git commit -m "Sync wiki from wiki/ ($(date -u +%Y-%m-%dT%H:%MZ))"
git push origin master 2>/dev/null || git push origin main

echo "✓ Wiki synced: $PUBLIC_WIKI"
