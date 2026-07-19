#!/usr/bin/env bash
set -euo pipefail

REPO="${PROCESSKIT_REPO:-raintr91/Processkit}"
INSTALL_DIR="${PROCESSKIT_INSTALL_DIR:-$HOME/.processkit}"
BIN_DIR="${PROCESSKIT_BIN_DIR:-$HOME/.local/bin}"
REF="${PROCESSKIT_REF:-main}"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$BIN_DIR/processkit" "$BIN_DIR/processkit-mcp"
  rm -rf "$INSTALL_DIR"
  echo "processkit uninstalled ($INSTALL_DIR)."
  exit 0
fi

command -v node >/dev/null || { echo "processkit: Node.js >=22 required" >&2; exit 1; }
command -v git >/dev/null || { echo "processkit: git required" >&2; exit 1; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
git clone --depth 1 --branch "$REF" "https://github.com/$REPO.git" "$tmpdir/src"
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

echo "Installed Processkit. Next:"
echo "  cd /path/to/project && processkit init   # wizard: agents → lane"
