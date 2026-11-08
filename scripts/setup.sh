#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Installing Node dependencies..."
npm install

echo "Installing Python audio-analysis dependencies..."
(
  cd scripts/audio-analysis
  uv sync --group dev
)

echo
if command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg: $(ffmpeg -version | head -1)"
else
  echo "ffmpeg: missing. Install it for footage import and loudness normalization."
  echo "  Ubuntu/Debian: sudo apt-get install ffmpeg"
  echo "  macOS: brew install ffmpeg"
fi

echo
echo "Setup complete."
echo "Next: npm run demo"
