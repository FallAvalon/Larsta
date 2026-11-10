#!/usr/bin/env bash
set -e
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Install Node.js 22.13+ and npm, then run this script again.'
  exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || a===22&&b>=13 ? 0 : 1)'; then
  echo 'Node.js 22.13 or newer is required.'
  exit 1
fi

# Windows dependencies can contain binaries that do not work on Linux.
install_id="$(node -p '`${process.platform}-${process.arch}-${process.versions.node.split(".")[0]}`')"
if [[ ! -f node_modules/.larsta-install-id ]] || [[ "$(cat node_modules/.larsta-install-id)" != "$install_id" ]]; then
  echo 'Installing dependencies for this platform...'
  npm ci --no-fund --no-audit
  printf '%s\n' "$install_id" > node_modules/.larsta-install-id
fi

npm run build
npm start
