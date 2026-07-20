#!/usr/bin/env bash
set -euo pipefail

REPO="${PROCESSKIT_REPO:-raintr91/Processkit}"
INSTALL_DIR="${PROCESSKIT_INSTALL_DIR:-$HOME/.processkit}"
BIN_DIR="${PROCESSKIT_BIN_DIR:-$HOME/.local/bin}"
REF="${PROCESSKIT_REF:-main}"
# Local checkout → global install (skips GitHub clone). Example:
#   PROCESSKIT_SRC=/home/me/workspace/processkit ./install.sh
SRC="${PROCESSKIT_SRC:-}"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$BIN_DIR/processkit" "$BIN_DIR/processkit-mcp"
  rm -rf "$INSTALL_DIR"
  echo "processkit uninstalled ($INSTALL_DIR)."
  exit 0
fi

if [ "${1:-}" = "--from" ] || [ "${1:-}" = "--from-local" ]; then
  SRC="${2:-${SRC:-}}"
  if [ -z "$SRC" ]; then
    echo "processkit: --from <checkout-path> required" >&2
    exit 1
  fi
fi

command -v node >/dev/null || { echo "processkit: Node.js >=22 required" >&2; exit 1; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

if [ -n "$SRC" ]; then
  SRC="$(cd "$SRC" && pwd)"
  [ -f "$SRC/package.json" ] || { echo "processkit: not a Processkit checkout: $SRC" >&2; exit 1; }
  echo "Installing Processkit from local checkout: $SRC"
  # Copy without node_modules/dist so the install dir rebuilds cleanly.
  mkdir -p "$tmpdir/src"
  if command -v rsync >/dev/null; then
    rsync -a --delete \
      --exclude node_modules --exclude dist --exclude .git \
      "$SRC"/ "$tmpdir/src"/
  else
    # Fallback when rsync is unavailable.
    (
      cd "$SRC"
      tar --exclude=node_modules --exclude=dist --exclude=.git -cf - .
    ) | (cd "$tmpdir/src" && tar -xf -)
  fi
else
  command -v git >/dev/null || { echo "processkit: git required" >&2; exit 1; }
  git clone --depth 1 --branch "$REF" "https://github.com/$REPO.git" "$tmpdir/src"
fi

rm -rf "$INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"
mv "$tmpdir/src" "$INSTALL_DIR"
cd "$INSTALL_DIR"

if command -v pnpm >/dev/null; then
  pnpm install
  pnpm build
else
  npm install
  npm run build
fi

mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/bin/processkit.mjs" "$BIN_DIR/processkit"
ln -sf "$INSTALL_DIR/bin/processkit-mcp.mjs" "$BIN_DIR/processkit-mcp"
chmod +x "$INSTALL_DIR/bin/"*.mjs

echo "Installed Processkit $(node -e "console.log(require('./package.json').version)" 2>/dev/null || true) → $INSTALL_DIR"
echo "Next:"
echo "  cd /path/to/project && processkit init   # wizard: agents → lane"
echo "Dev tip (Platform DNA package init without republishing):"
echo "  export PLATFORM_DNA_PROCESSKIT_ROOT=$INSTALL_DIR"
