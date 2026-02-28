#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIBRARY_DIR="$ROOT_DIR/Library"
MUSIC_DIR="$ROOT_DIR/Music library"

: "${CLOUDINARY_CLOUD_NAME:?Set CLOUDINARY_CLOUD_NAME}"
: "${CLOUDINARY_API_KEY:?Set CLOUDINARY_API_KEY}"
: "${CLOUDINARY_API_SECRET:?Set CLOUDINARY_API_SECRET}"

MEDIA_PREFIX="${CLOUDINARY_MEDIA_PREFIX:-shortform/library}"
MUSIC_PREFIX="${CLOUDINARY_MUSIC_PREFIX:-shortform/music}"

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
  local safe_name
  safe_name="$(sanitize_name "$name")"
  local base="${safe_name%.*}"
  local public_id="${prefix}/${base}"
  local ts
  ts="$(date +%s)"
  local to_sign="public_id=${public_id}&timestamp=${ts}"
  local signature
  signature="$(printf '%s' "${to_sign}${CLOUDINARY_API_SECRET}" | shasum | awk '{print $1}')"

  echo "Uploading: $name -> $public_id"
  curl -sS --fail "https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload" \
    -F "file=@${file_path}" \
    -F "public_id=${public_id}" \
    -F "overwrite=true" \
    -F "api_key=${CLOUDINARY_API_KEY}" \
    -F "timestamp=${ts}" \
    -F "signature=${signature}" \
    > /dev/null
}

upload_folder() {
  local folder="$1"
  local prefix
  prefix="$(normalize_prefix "$2")"
  shift 2
  local exts=("$@")

  shopt -s nullglob
  local files=()
  local ext
  for ext in "${exts[@]}"; do
    files+=("$folder"/*"$ext")
    files+=("$folder"/*"${ext^^}")
  done
  shopt -u nullglob

  if [[ ${#files[@]} -eq 0 ]]; then
    echo "No files found in $folder for upload."
    return
  fi

  local file
  for file in "${files[@]}"; do
    [[ -f "$file" ]] || continue
    upload_file "$file" "$prefix"
  done
}

upload_folder "$LIBRARY_DIR" "$MEDIA_PREFIX" \
  .mp4 .mov .mkv .webm .avi .m4v .jpg .jpeg .png .webp .bmp

upload_folder "$MUSIC_DIR" "$MUSIC_PREFIX" \
  .mp3 .wav .m4a .aac .flac .ogg

echo "Cloudinary upload complete."
