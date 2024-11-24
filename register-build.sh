#!/bin/bash
set -eu

BUILD_ID=$1

if [[ ! "BUILD_ID" =~ ^[[:print:]]+$ || "$BUILD_ID" =~ [[:space:]] || -z "$BUILD_ID" || ${#BUILD_ID} -ge 256 ]]; then
  echo "Build ID must be between 1 and 255 characters long and contain no spaces, newlines, or control characters" >&2
  exit 1
fi

# Check if the string is valid UTF-8
if ! printf "%s" "$BUILD_ID" | iconv -f UTF-8 -t UTF-8 >/dev/null 2>&1; then
  echo "Build ID is not valid (not UTF-8): '$BUILD_ID'" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d)

# Create a file with the build ID
echo "$BUILD_ID" > "$WORK_DIR/.dot-deploy-build-id.txt"

# Output the build ID
echo "build-id=$BUILD_ID" >> "$GITHUB_OUTPUT"
echo "build-id-file=$WORK_DIR/.dot-deploy-build-id.txt" >> "$GITHUB_OUTPUT"
