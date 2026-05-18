#!/bin/bash
# test/install-hooks.test.sh

# Mock workspace and required variables
export WORKSPACE_ROOT="/tmp/workspace"
export TOOL_INSTALL_DIR="/tmp/workspace/.para/tools/para-graph"
export AGENTS_DIR="/tmp/workspace/.agents"
export MANIFEST_FILE="/tmp/workspace/tool.manifest.yml"
export TOOL_NAME="para-graph"
export TOOL_VERSION="0.15.3"

# Mock fetch_templates_from_git to simulate successful fetch
fetch_templates_from_git() {
  echo "Mock: fetch_templates_from_git called"
  return 0
}

# Mock parse_manifest_agents
parse_manifest_agents() {
  echo "Mock: parse_manifest_agents called"
}

# Mock npm command
export NPM_LOG="$WORKSPACE_ROOT/npm.log"
rm -f "$NPM_LOG"
npm() {
  echo "install $*" >> "$NPM_LOG"
  echo "Mock: npm $* at $PWD"
}

# Mock node command
export MOCK_NODE_VERSION="24"
node() {
  if [ "$1" = "-v" ]; then
    echo "v$MOCK_NODE_VERSION.2.0"
  else
    command node "$@"
  fi
}

# Ensure temporary dirs exist to bypass legacy tarball guard
mkdir -p "$TOOL_INSTALL_DIR"

# Source the hook script
source ./install-hooks.sh

# Test 1: Node >= 22 (Should not install better-sqlite3)
export MOCK_NODE_VERSION="24"
rm -f "$NPM_LOG"
post_install

if grep -q "better-sqlite3" "$NPM_LOG"; then
  echo "❌ FAIL: better-sqlite3 was installed on Node 24."
  exit 1
else
  echo "✅ PASS: better-sqlite3 was NOT installed on Node 24."
fi

# Test 2: Node < 22 (Should install better-sqlite3)
export MOCK_NODE_VERSION="20"
rm -f "$NPM_LOG"
post_install

if grep -q "better-sqlite3" "$NPM_LOG"; then
  echo "✅ PASS: better-sqlite3 was correctly installed on Node 20."
else
  echo "❌ FAIL: better-sqlite3 was NOT installed on Node 20."
  exit 1
fi

exit 0
