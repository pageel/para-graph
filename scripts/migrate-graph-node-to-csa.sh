#!/bin/bash
# migrate-graph-node-to-csa.sh — Migrate legacy @graph-node markers to unified CSA span anchors.
# Usage:
#   ./migrate-graph-node-to-csa.sh <target-dir> [--write]

set -euo pipefail

TARGET_DIR="${1:-}"
WRITE_MODE=false

if [ -z "$TARGET_DIR" ]; then
  echo "Error: Target directory is required."
  echo "Usage: $0 <target-dir> [--write]"
  exit 1
fi

if [ "${2:-}" = "--write" ]; then
  WRITE_MODE=true
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: Directory not found: $TARGET_DIR"
  exit 1
fi

echo "Scanning for legacy <!-- @graph-node: nodeId --> markers in $TARGET_DIR..."
if [ "$WRITE_MODE" = false ]; then
  echo "⚠️ DRY RUN MODE: No files will be modified. Run with --write to apply changes."
fi

# Find all markdown files
FILES=$(find "$TARGET_DIR" -type f -name "*.md")

modified_count=0

for FILE in $FILES; do
  # Check if file has the marker
  if grep -q "<!--[[:space:]]*@graph-node:" "$FILE"; then
    echo "Found markers in: $FILE"
    if [ "$WRITE_MODE" = true ]; then
      # Perform the replacement using perl (cross-platform friendly, handles regex groups reliably)
      perl -pi -e 's/<!--\s*@graph-node:\s*([^\s>]+)\s*-->/<span id="csa-$1"><\/span>/g' "$FILE"
      echo "  -> Migrated."
    else
      # Just show what would be replaced
      grep -o "<!--[[:space:]]*@graph-node:[[:space:]]*[^[:space:]>]*[[:space:]]*-->" "$FILE" | while read -r line; do
        node_id=$(echo "$line" | sed -E 's/<!--[[:space:]]*@graph-node:[[:space:]]*([^[:space:]]*)[[:space:]]*-->/\1/')
        echo "  [Would replace] '$line' -> '<span id=\"csa-$node_id\"></span>'"
      done
    fi
    ((modified_count++))
  fi
done

echo "Done. Total files processed/modified: $modified_count"
