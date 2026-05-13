#!/bin/bash
# test/install-hooks.test.sh

# Mock workspace and required variables
export WORKSPACE_ROOT="/tmp/workspace"
export TOOL_INSTALL_DIR="/tmp/workspace/.para/tools/para-graph"
export AGENTS_DIR="/tmp/workspace/.agents"
export MANIFEST_FILE="/tmp/workspace/tool.manifest.yml"
export TOOL_NAME="para-graph"
export TOOL_VERSION="0.15.0"

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
export NPM_CALLED=0
export NPM_ARGS=""
export NPM_CWD=""
npm() {
  NPM_CALLED=1
  NPM_ARGS="$*"
  NPM_CWD="$PWD"
  echo "Mock: npm $NPM_ARGS at $NPM_CWD"
}

# Ensure temporary dirs exist to bypass legacy tarball guard
mkdir -p "$TOOL_INSTALL_DIR"

# Source the hook script
source ./install-hooks.sh

# Execute post_install
post_install

# Assertions
if [ "$NPM_CALLED" -eq 1 ]; then
  if [[ "$NPM_ARGS" != "install --prefix $TOOL_INSTALL_DIR --omit=dev" ]]; then
    echo "❌ FAIL: npm was called with wrong args: $NPM_ARGS"
    exit 1
  else
    echo "✅ PASS: npm install --prefix was called correctly."
    exit 0
  fi
else
  echo "❌ FAIL: npm was not called."
  exit 1
fi
