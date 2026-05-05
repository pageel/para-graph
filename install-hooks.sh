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

  return 0
}

post_install() {
  echo "  📊 para-graph: install hooks executed successfully."
}
