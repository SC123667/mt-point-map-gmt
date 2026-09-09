#!/usr/bin/env bash
# Build distributable packages without touching the installed app or publishing.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_TEXT="$(cat "$ROOT_DIR/VERSION")"
OUTPUT_DIR="${1:-$ROOT_DIR/release/public-$VERSION_TEXT}"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
STAGE_DIR="$(mktemp -d "$OUTPUT_DIR/build-stage.XXXXXX")"
# Keep the isolated source and logs available for diagnosis/reproduction.
for item in package.json package-lock.json VERSION README.md CHANGELOG.md DISTRIBUTION.md LICENSE sample_points.csv; do
  cp "$ROOT_DIR/$item" "$STAGE_DIR/$item"
done
for item in electron docs build scripts; do
  ditto --noextattr --norsrc "$ROOT_DIR/$item" "$STAGE_DIR/$item"
done
cd "$STAGE_DIR"
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --no-audit --no-fund --cache "$OUTPUT_DIR/npm-cache"
node scripts/patch-nsis-install-section.js
export CSC_IDENTITY_AUTO_DISCOVERY=false
BUILDER="$STAGE_DIR/node_modules/.bin/electron-builder"
COMMON=(--publish never '--config.artifactName=MT-Point-Map-GMT-${version}-${os}-${arch}.${ext}'
  '--config.nsis.artifactName=MT-Point-Map-GMT-${version}-win-${arch}-setup.${ext}'
  '--config.portable.artifactName=MT-Point-Map-GMT-${version}-win-${arch}-portable.${ext}'
  "--config.directories.output=$OUTPUT_DIR")
"$BUILDER" --mac dmg dir --arm64 --config.mac.identity=- \
  "--config.electronDist=$ROOT_DIR/node_modules/electron/dist" "${COMMON[@]}"
codesign --verify --deep --strict "$OUTPUT_DIR/mac-arm64/MT点位图制作工具—GMT.app"
"$BUILDER" --win nsis portable --x64 --arm64 "${COMMON[@]}"
hdiutil verify "$OUTPUT_DIR/MT-Point-Map-GMT-$VERSION_TEXT-mac-arm64.dmg"
cd "$OUTPUT_DIR"
shasum -a 256 "MT-Point-Map-GMT-$VERSION_TEXT-mac-arm64.dmg" \
  "MT-Point-Map-GMT-$VERSION_TEXT-win-x64-setup.exe" \
  "MT-Point-Map-GMT-$VERSION_TEXT-win-x64-portable.exe" \
  "MT-Point-Map-GMT-$VERSION_TEXT-win-arm64-setup.exe" \
  "MT-Point-Map-GMT-$VERSION_TEXT-win-arm64-portable.exe" > "SHA256SUMS-v$VERSION_TEXT.txt"
printf 'Packages verified: %s\n' "$OUTPUT_DIR"
