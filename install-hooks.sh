#!/bin/bash
# para-graph — Install Hooks
# Sourced by para-workspace install-tool.sh (v1.8.5+)
# Provides pre_install/post_install for decoupled tool lifecycle management.
#
# Hook Contract:
#   Available env vars (provided by install-tool.sh):
#     WORKSPACE_ROOT    — absolute path to workspace
#     TOOL_INSTALL_DIR  — .para/tools/{name}/
#     AGENTS_DIR        — .agents/
#     TOOL_NAME         — tool name from manifest
#     TOOL_VERSION      — tool version from manifest
#     MANIFEST_FILE     — path to tool.manifest.yml
#
#   Available functions (provided by install-tool.sh):
#     semver_gte A B    — returns 0 if A >= B (semver comparison)

# Node.js Path Resolution (BUG-10)
# Source shared resolver if available (backward compat with older para-workspace)
if [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/Projects/para-workspace/repo/cli/lib/node-resolver.sh" ]; then
  # shellcheck source=/dev/null
  . "$WORKSPACE_ROOT/Projects/para-workspace/repo/cli/lib/node-resolver.sh"
  resolve_node "$WORKSPACE_ROOT" 2>/dev/null || true
elif [ -n "$WORKSPACE_ROOT" ] && [ -f "$WORKSPACE_ROOT/Resources/references/para-workspace/cli/lib/node-resolver.sh" ]; then
  # Fallback: prod/sync reference path
  . "$WORKSPACE_ROOT/Resources/references/para-workspace/cli/lib/node-resolver.sh"
  resolve_node "$WORKSPACE_ROOT" 2>/dev/null || true
fi

pre_install() {
  # Version guard: check engine version vs min_engine_version
  local engine_ver
  engine_ver=$(grep '^version:' "$MANIFEST_FILE" | sed 's/version: *//; s/"//g; s/ *$//')

  # Read min_engine_version from agents entries (use first occurrence)
  local min_ver
  min_ver=$(grep 'min_engine_version:' "$MANIFEST_FILE" | head -1 | sed 's/.*min_engine_version: *//; s/"//g; s/ *$//')

  if [ -n "$min_ver" ] && [ -n "$engine_ver" ]; then
    if type semver_gte >/dev/null 2>&1; then
      if ! semver_gte "$engine_ver" "$min_ver"; then
        echo "  ⚠️  Engine v$engine_ver is older than required v$min_ver"
        echo "     Some intelligence artifacts may not work correctly."
        echo "     Consider updating: ./para install-tool para-graph --update"
      fi
    fi
  fi

  # Task 0.2: Node LTS guard for native addon compatibility (better-sqlite3)
  local node_version
  node_version=$(node -v | sed 's/v//' | cut -d'.' -f1)
  if [ "$node_version" -lt 18 ] || [ $((node_version % 2)) -ne 0 ]; then
    echo "  ❌  Installation blocked: Node.js LTS (18, 20, 22, 24+) is required."
    echo "      You are using Node.js v$node_version. This project relies on 'better-sqlite3'"
    echo "      which requires node-gyp C++ compilation best supported on LTS releases."
    echo "      Please switch to an even-numbered Node.js release (>= 18)."
    return 1
  fi

  return 0
}

post_install() {
  # Decoupled Distribution (v0.12.0+):
  # Tarball no longer bundles templates/. Fetch AI Intelligence from GitHub.
  # This hook runs AFTER install_agents() — which prints "Source not found"
  # warnings because templates/ is absent. We fetch and install correctly here.

  echo "  📊 para-graph: fetching AI Intelligence from GitHub..."

  # Guard: ensure fetch function is available in scope
  if ! type fetch_templates_from_git >/dev/null 2>&1; then
    echo "  ⚠️  fetch_templates_from_git not available (para-workspace < 1.8.5?)."
    echo "     Run: ./para install-tool para-graph --sync"
    return 0
  fi

  # Create temp directory for downloads
  local sync_temp
  sync_temp="$(mktemp -d)"

  if fetch_templates_from_git "$MANIFEST_FILE" "$sync_temp"; then
    # Re-parse manifest to populate AGENT_* arrays
    # (already populated by install-tool.sh, but re-parse to be safe)
    if type parse_manifest_agents >/dev/null 2>&1; then
      parse_manifest_agents
    fi

    # Install agents from fetched templates (same pattern as --sync mode)
    local i=0
    while [ $i -lt ${#AGENT_SOURCES[@]} ]; do
      local asource="${AGENT_SOURCES[$i]}"
      local atype="${AGENT_TYPES[$i]}"
      local atarget="${AGENT_TARGETS[$i]}"
      local src_path="$sync_temp/$asource"
      local dst_dir="$AGENTS_DIR/$atype"
      local dst_path="$dst_dir/$atarget"

      if [ -e "$src_path" ]; then
        mkdir -p "$dst_dir"
        if [ -d "$src_path" ]; then
          [ -d "$dst_path" ] && rm -rf "$dst_path"
          cp -r "$src_path" "$dst_path"
        elif [ -f "$src_path" ]; then
          cp "$src_path" "$dst_path"
        fi
        echo "  ✅ $atype/$atarget installed from GitHub."
      fi
      i=$((i + 1))
    done
  else
    echo ""
    echo "  ⚠️  Could not fetch AI Intelligence (no network or GitHub unreachable)."
    echo "     Core tool is installed and fully functional."
    echo "     Fetch intelligence later: ./para install-tool para-graph --sync"
    echo ""
  fi

  # Cleanup temp directory
  rm -rf "$sync_temp"

  # Fix: Ensure dependencies are installed in production
  echo "  📦 para-graph: installing production dependencies..."
  if ! npm install --prefix "$TOOL_INSTALL_DIR" --omit=dev; then
    echo "  ⚠️  Failed to install dependencies via npm."
  fi

  # SQLite Dynamic Dependency Fallback for Node < 22
  if command -v node >/dev/null 2>&1; then
    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d'.' -f1)
    if [ "$node_version" -lt 22 ]; then
      echo "  📦 para-graph: Node < 22 detected, installing native SQLite adapter fallback..."
      if ! npm install --prefix "$TOOL_INSTALL_DIR" better-sqlite3@^11.10.0 --no-save; then
        echo "  ❌  Failed to install better-sqlite3 fallback dependency."
        echo "      This is usually caused by missing C++ build tools (node-gyp compilation failed)."
        echo "      To resolve this issue, please try one of the following:"
        echo "      1) Upgrade Node.js to >= 22.5.0, which has built-in 'node:sqlite' support"
        echo "         and completely bypasses native C++ compilation."
        echo "      2) Install the required C++ build tools for your OS:"
        echo "         - Windows: Run 'npm install --global --production windows-build-tools'"
        echo "                    or install Visual Studio Build Tools with C++ workload."
        echo "         - macOS: Run 'xcode-select --install' to install Command Line Tools."
        echo "         - Linux: Install 'build-essential' and 'python3'."
        echo "      Running without better-sqlite3 may cause para-graph storage operations to fail on Node < 22."
      fi
    fi
  fi

  # Auto-sync Knowledge Items
  echo "  📚 para-graph: syncing Knowledge Items to IDE..."
  if node "$TOOL_INSTALL_DIR/dist/cli.js" ki sync 2>/dev/null; then
    echo "  ✅ Knowledge Items synchronized."
  else
    echo "  ⚠️  KI sync skipped. Run './para graph ki sync' manually."
  fi
}
