#!/usr/bin/env bash
set -e

echo "========================================================"
echo " Installing omp-antigravity-auth into Oh My Pi (omp)"
echo "========================================================"
echo ""

EXT_DIR="$HOME/.omp/agent/extensions"
mkdir -p "$EXT_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_FILE="$SCRIPT_DIR/../extension/omp-antigravity-auth.ts"
if [ ! -f "$SRC_FILE" ]; then
    SRC_FILE="$SCRIPT_DIR/extension/omp-antigravity-auth.ts"
fi

if [ ! -f "$SRC_FILE" ]; then
    echo "[ERROR] Source extension file not found: $SRC_FILE"
    exit 1
fi

cp -f "$SRC_FILE" "$EXT_DIR/omp-antigravity-auth.ts"

echo "[OK] Extension installed successfully:"
echo "     $EXT_DIR/omp-antigravity-auth.ts"
echo ""
echo "========================================================"
echo " Installation Complete!"
echo " Restart omp and you can use:"
echo "   /ag-import [file|text]"
echo "   /ag-list"
echo "   /ag-verify"
echo "========================================================"
