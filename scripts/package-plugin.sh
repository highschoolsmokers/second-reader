#!/usr/bin/env bash
# Build a self-contained second-reader.plugin zip.
#
# The plugin manifest runs ${CLAUDE_PLUGIN_ROOT}/dist/index.js, so the zip
# needs the compiled server and its production dependencies. This script
# builds dist/, stages the plugin files in a temp directory, installs
# production dependencies there (never touching this checkout's
# node_modules), and zips the result.
#
# Usage: npm run package [-- <output path>]
# Default output: ./second-reader.plugin (gitignored).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${1:-$repo_root/second-reader.plugin}"
case "$out" in
  /*) ;;
  *) out="$PWD/$out" ;;
esac

# Files that ship in the plugin. Secrets (.env, .mcp.json) and local data
# (uploads/, evals/results/) are deliberately absent.
files=(
  .claude-plugin agents skills templates examples
  dist src scripts sql evals
  package.json package-lock.json README.md
  .env.example .mcp.json.example .gitignore
  Dockerfile docker-compose.yml
)

cd "$repo_root"

echo "Building dist/..."
npm run build --silent

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

echo "Staging plugin files..."
rsync -a --exclude '.DS_Store' --exclude 'evals/results' "${files[@]}" "$stage/"

echo "Installing production dependencies..."
# --ignore-scripts: the only install script in the production tree is
# tesseract.js's opencollective banner.
(cd "$stage" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --silent)

for secret in .env .mcp.json; do
  if [[ -e "$stage/$secret" ]]; then
    echo "Refusing to package: $secret ended up in the staging directory." >&2
    exit 1
  fi
done

rm -f "$out"
(cd "$stage" && zip -rqX "$out" . -x '*.DS_Store')

echo "Wrote $out ($(du -h "$out" | awk '{print $1}'))"
