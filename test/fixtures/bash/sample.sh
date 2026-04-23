#!/bin/bash
# Sample Bash fixture for para-graph SSEC testing.
# Tests: functions, source imports, command calls.

source ./config.sh
. ./utils.sh

LOG_DIR="/var/log/app"
BUILD_TARGET="production"

setup_dirs() {
  mkdir -p "$LOG_DIR"
  chmod 755 "$LOG_DIR"
  echo "Directories created"
}

function build_project {
  local target=${1:-$BUILD_TARGET}
  echo "Building target: $target"
  npm run build --target "$target"
  return $?
}

function run_tests {
  echo "Running test suite..."
  npm run test
  grep -r "FAIL" test-results/ && exit 1
}

deploy() {
  build_project production
  run_tests
  rsync -avz dist/ server:/app/
  echo "Deployment complete"
}

# Main execution
setup_dirs
deploy
