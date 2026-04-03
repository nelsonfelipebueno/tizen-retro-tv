#!/bin/bash
set -e

DIST_DIR="dist"
WGT_NAME="TizenRetroTV.wgt"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

zip -r "$DIST_DIR/$WGT_NAME" \
  config.xml \
  index.html \
  css/ \
  js/ \
  lib/ \
  roms/ \
  assets/ \
  -x "*.DS_Store" "*__MACOSX*" "*.git*" "*.md" "*.wgt" "author-signature*" "signature*" ".manifest*" "dist/*" "docs/*" "dev-server.sh" ".gitignore"

echo ""
echo "========================================="
echo "  Built: $DIST_DIR/$WGT_NAME"
SIZE=$(du -h "$DIST_DIR/$WGT_NAME" | cut -f1)
echo "  Size: $SIZE"
echo "========================================="
echo ""
echo "Deploy to TV:"
echo "  tizen-app-installer -t <TV_IP> $DIST_DIR/$WGT_NAME"
