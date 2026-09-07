#!/usr/bin/env bash
# Build with standard electron-builder outside Documents/FileProvider.
# This command does not stop, replace, or launch the installed application.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_TEXT="$(cat "$ROOT_DIR/VERSION")"
OUTPUT_DIR="${1:-$ROOT_DIR/release/local-$VERSION_TEXT}"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
STAGE_DIR="$(mktemp -d /tmp/mt-gmt-package.XXXXXX)"
BUILD_CACHE="${MT_GMT_BUILD_CACHE:-$HOME/Library/Caches/mt-point-map-gmt-build}"
trap 'rm -rf "$STAGE_DIR"' EXIT

for item in package.json package-lock.json VERSION README.md CHANGELOG.md sample_points.csv; do
  cp "$ROOT_DIR/$item" "$STAGE_DIR/$item"
done
ditto "$ROOT_DIR/electron" "$STAGE_DIR/electron"
BUILDER_VERSION="$(node -p 'require(process.argv[1]).packages["node_modules/electron-builder"].version' "$ROOT_DIR/package-lock.json")"
ELECTRON_VERSION="$(node -p 'require(process.argv[1]).version' "$ROOT_DIR/node_modules/electron/package.json")"

cd "$STAGE_DIR"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$BUILD_CACHE"
npm exec --yes --cache "$BUILD_CACHE" --package "electron-builder@$BUILDER_VERSION" -- electron-builder \
  --projectDir "$STAGE_DIR" --mac dir --arm64 \
  --config.electronDist="$ROOT_DIR/node_modules/electron/dist" \
  --config.electronVersion="$ELECTRON_VERSION" \
  --config.mac.identity=- --config.directories.output="$STAGE_DIR/packaged"
codesign --verify --deep --strict "$STAGE_DIR/packaged/mac-arm64/MT点位图制作工具—GMT.app"
mkdir -p "$OUTPUT_DIR/mac-arm64"
ditto --noextattr --norsrc "$STAGE_DIR/packaged/mac-arm64/MT点位图制作工具—GMT.app" "$OUTPUT_DIR/mac-arm64/MT点位图制作工具—GMT.app"
# FileProvider can add Finder metadata after copying; verify the copied code too.
codesign --verify --deep "$OUTPUT_DIR/mac-arm64/MT点位图制作工具—GMT.app"
printf 'Verified local App: %s\n' "$OUTPUT_DIR/mac-arm64/MT点位图制作工具—GMT.app"
