#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/.tools/ffmpeg"

if command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is already on PATH: $(command -v ffmpeg)"
  exit 0
fi

if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
  echo "This installer supports Linux x86_64 only."
  echo "Install ffmpeg with your package manager instead."
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading a static ffmpeg build..."
curl -L --fail --progress-bar \
  -o "$TMP/ffmpeg.tar.xz" \
  "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"

echo "Extracting..."
tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP" --strip-components=1

mkdir -p "$DEST"
cp "$TMP/ffmpeg" "$TMP/ffprobe" "$DEST/"
chmod +x "$DEST/ffmpeg" "$DEST/ffprobe"

echo "Installed: $DEST/ffmpeg"
"$DEST/ffmpeg" -version | head -1
echo
echo "The coreslopper media commands check .tools/ffmpeg automatically."
echo "For other tools, add it to PATH: export PATH=\"$DEST:\$PATH\""
