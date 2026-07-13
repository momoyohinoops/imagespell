#!/usr/bin/env bash
# strip-exif.sh — remove ALL metadata (EXIF/GPS/XMP/IPTC/ICC) from image files
# before they go anywhere near public/. See README "素材ルール".
#
# Usage:
#   scripts/strip-exif.sh photo.jpg another.png ...
#   scripts/strip-exif.sh public/depth-map-generator/assets/*.jpg
#
# Prefers exiftool (thorough, keeps pixels byte-identical). Falls back to a
# Pillow re-save (opens the image, copies ONLY the pixel data into a brand-new
# Image object with no .info/exif/icc carried over, then saves) if exiftool
# isn't installed. Files are stripped in place.
#
# Why this exists: macOS Preview's "Export…" does NOT reliably strip GPS from
# photos (confirmed on a real iPhone photo that still had exif:GPSLatitude /
# GPSLongitude in its Adobe XMP block after "Export"). Don't rely on it —
# always run this script (or regenerate the file via canvas toBlob, which
# strips metadata as a side effect) before publishing.

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <image file> [image file ...]" >&2
  exit 1
fi

if command -v exiftool >/dev/null 2>&1; then
  echo "Using exiftool to strip metadata..."
  exiftool -all= -overwrite_original "$@"
  exit 0
fi

echo "exiftool not found; falling back to Pillow (pixel-only re-save)..." >&2
python3 - "$@" <<'PY'
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit(
        "Neither exiftool nor Pillow is available.\n"
        "Install one of:\n"
        "  brew install exiftool\n"
        "  pip3 install Pillow"
    )

for path in sys.argv[1:]:
    img = Image.open(path)
    img.load()
    # Copy ONLY the decoded pixels into a fresh Image — this drops every
    # metadata chunk (EXIF, GPS, XMP, IPTC, ICC profile) on the original,
    # since a new Image() has no .info dict to carry any of that forward.
    clean = Image.new(img.mode, img.size)
    clean.putdata(list(img.getdata()))
    clean.save(path)
    print(f"stripped: {path}")
PY
