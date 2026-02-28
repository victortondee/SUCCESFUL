#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIBRARY_DIR="$ROOT_DIR/Library"
MUSIC_DIR="$ROOT_DIR/Music library"
MAX_UPLOAD_BYTES="${CLOUDINARY_MAX_UPLOAD_BYTES:-100000000}"

: "${CLOUDINARY_CLOUD_NAME:?Set CLOUDINARY_CLOUD_NAME}"
: "${CLOUDINARY_API_KEY:?Set CLOUDINARY_API_KEY}"
: "${CLOUDINARY_API_SECRET:?Set CLOUDINARY_API_SECRET}"

MEDIA_PREFIX="${CLOUDINARY_MEDIA_PREFIX:-shortform/library}"
MUSIC_PREFIX="${CLOUDINARY_MUSIC_PREFIX:-shortform/music}"

UPLOADED=0
SKIPPED=0
FAILED=0

normalize_prefix() {
  echo "$1" | sed -E 's#^/+##; s#/+$##'
}

sanitize_name() {
  local input="$1"
  echo "$input" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//'
}

upload_file() {
  local file_path="$1"
  local prefix="$2"
  local name
  name="$(basename "$file_path")"
  local size
  size="$(stat -f %z "$file_path")"

  if [[ "$size" -gt "$MAX_UPLOAD_BYTES" ]]; then
    echo "Skipping (too large: ${size} bytes): $name"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  local safe_name
  safe_name="$(sanitize_name "$name")"
  local base="${safe_name%.*}"
  local public_id="${prefix}/${base}"
  local ts
  ts="$(date +%s)"
  local to_sign="overwrite=true&public_id=${public_id}&timestamp=${ts}"
  local signature
  signature="$(printf '%s' "${to_sign}${CLOUDINARY_API_SECRET}" | shasum | awk '{print $1}')"

  echo "Uploading: $name -> $public_id"
  if curl -sS --fail "https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload" \
    -F "file=@${file_path}" \
    -F "public_id=${public_id}" \
    -F "overwrite=true" \
    -F "api_key=${CLOUDINARY_API_KEY}" \
    -F "timestamp=${ts}" \
    -F "signature=${signature}" \
    > /dev/null; then
    UPLOADED=$((UPLOADED + 1))
  else
    echo "Failed upload: $name"
    FAILED=$((FAILED + 1))
  fi
}

upload_folder() {
  local folder="$1"
  local prefix
  prefix="$(normalize_prefix "$2")"
  shift 2
  local exts=("$@")

  if [[ ! -d "$folder" ]]; then
    echo "Folder not found: $folder"
    return
  fi

  local files=()
  while IFS= read -r -d '' file; do
    files+=("$file")
  done < <(find "$folder" -maxdepth 1 -type f \( \
      -iname "*.mp4" -o -iname "*.mov" -o -iname "*.mkv" -o -iname "*.webm" -o -iname "*.avi" -o -iname "*.m4v" \
      -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o -iname "*.bmp" \
      -o -iname "*.mp3" -o -iname "*.wav" -o -iname "*.m4a" -o -iname "*.aac" -o -iname "*.flac" -o -iname "*.ogg" \
    \) -print0)

  if [[ ${#files[@]} -eq 0 ]]; then
    echo "No files found in $folder for upload."
    return
  fi

  local file
  for file in "${files[@]}"; do
    [[ -f "$file" ]] || continue
    local lower
    lower="$(echo "$file" | tr '[:upper:]' '[:lower:]')"
    local allowed=0
    local ext
    for ext in "${exts[@]}"; do
      if [[ "$lower" == *"$ext" ]]; then
        allowed=1
        break
      fi
    done
    if [[ "$allowed" -eq 1 ]]; then
      upload_file "$file" "$prefix"
    fi
  done
}

upload_folder "$LIBRARY_DIR" "$MEDIA_PREFIX" \
  .mp4 .mov .mkv .webm .avi .m4v .jpg .jpeg .png .webp .bmp

upload_folder "$MUSIC_DIR" "$MUSIC_PREFIX" \
  .mp3 .wav .m4a .aac .flac .ogg

echo "Cloudinary upload complete. Uploaded=$UPLOADED Skipped=$SKIPPED Failed=$FAILED"
if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
