#!/bin/bash
set -e

# Source bashrc to load environment variables (MIDSCENE_*, ZEGO_*, etc.)
eval "$(bash -i -c 'export' 2>/dev/null)" 2>/dev/null || true

# Fallback: explicitly export required Midscene env vars if not already set
if [ -z "$MIDSCENE_MODEL_NAME" ]; then
  export MIDSCENE_MODEL_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
  export MIDSCENE_MODEL_API_KEY="0c48f289-676e-48de-8610-80ffbf7d40ef"
  export MIDSCENE_MODEL_NAME="doubao-seed-2-0-lite-260428"
  export MIDSCENE_MODEL_FAMILY="doubao-seed"
fi

AUTO_WEB="/home/doc/.nvm/versions/node/v24.14.1/lib/node_modules/@zegocloud/auto-web/bin/auto-web"
TAB_MAIN="main"
URL="http://localhost:5173"
REPORT_DIR="midscene_run"
LOG_FILE="midscene_run/test_results.log"

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=6

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_tc() {
  echo "" | tee -a "$LOG_FILE"
  echo "========================================" | tee -a "$LOG_FILE"
  echo "[TC-$1] $2" | tee -a "$LOG_FILE"
  echo "========================================" | tee -a "$LOG_FILE"
}

tc_pass() {
  log "RESULT TC-$1: PASSED - $2"
  PASS_COUNT=$((PASS_COUNT + 1))
}

tc_fail() {
  log "RESULT TC-$1: FAILED - $2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

# Run act command and check result properly
# Returns 0 if act succeeded (Task finished without error), 1 if failed
run_act() {
  local tab="$1"
  local prompt="$2"
  local output

  # Run the act command, capture output and exit code
  output=$("$AUTO_WEB" act --tab "$tab" --prompt "$prompt" 2>&1) || true
  echo "$output" | tee -a "$LOG_FILE"

  # Check for success: must contain "Task finished" AND must NOT contain "Error executing act" or "Task failed"
  if echo "$output" | grep -q "Task finished" && \
     ! echo "$output" | grep -q "Error executing act" && \
     ! echo "$output" | grep -q "Task failed"; then
    return 0
  else
    return 1
  fi
}

mkdir -p "$REPORT_DIR/log" "$REPORT_DIR/report"
echo "Test Run - $(date)" > "$LOG_FILE"

# Connect
log "Connecting browser..."
"$AUTO_WEB" connect --url "$URL" --tab "$TAB_MAIN"
sleep 3

# ===== TC-01: Page Load =====
log_tc "01" "Page Load - Verify UI elements"
if run_act "$TAB_MAIN" "Confirm the page has loaded with the following elements visible: a heading containing 'Interactive AI Avatar', a video area with a placeholder, a mic button, and a 'Start Conversation' button. Do not click anything, just confirm these elements are present."; then
  tc_pass "01" "Page loads with all UI elements"
else
  tc_fail "01" "Page load verification"
fi

# ===== TC-02: Start Conversation =====
log_tc "02" "Start Conversation"
if run_act "$TAB_MAIN" "Click the 'Start Conversation' button. Wait up to 30 seconds for the status to change. Confirm the status text shows 'Playing' and there is a green connected dot visible in the status bar. If an error appears, report it."; then
  tc_pass "02" "Conversation started successfully"
else
  tc_fail "02" "Start conversation"
fi
sleep 8

# ===== TC-03: AI Avatar Video Stream =====
log_tc "03" "AI Avatar Video Stream"
if run_act "$TAB_MAIN" "Wait 5 seconds for the AI Avatar video stream to load, then look at the video container area. Confirm that the video container is showing content (the AI Avatar video stream should be rendering in the black video area, not showing a placeholder). Do not click anything."; then
  tc_pass "03" "AI Avatar video stream displayed"
else
  tc_fail "03" "AI Avatar video stream"
fi

# ===== TC-04: Toggle Microphone Off =====
log_tc "04" "Toggle Microphone Off"
if run_act "$TAB_MAIN" "Click the 'Mic ON' button. Confirm the button text changes to 'Mic OFF' and the button color changes to orange."; then
  tc_pass "04" "Microphone toggled off"
else
  tc_fail "04" "Toggle microphone off"
fi

# ===== TC-05: Toggle Microphone On =====
log_tc "05" "Toggle Microphone On"
if run_act "$TAB_MAIN" "Click the 'Mic OFF' button. Confirm the button text changes back to 'Mic ON' and the button color changes to blue."; then
  tc_pass "05" "Microphone toggled on"
else
  tc_fail "05" "Toggle microphone on"
fi

# ===== TC-06: End Conversation =====
log_tc "06" "End Conversation"
if run_act "$TAB_MAIN" "Click the 'End Conversation' button. Confirm the status text changes to 'Ready', the video container shows the placeholder again, and the 'Start Conversation' button is visible again."; then
  tc_pass "06" "Conversation ended successfully"
else
  tc_fail "06" "End conversation"
fi

# ===== Summary =====
log ""
log "========================================"
log "TEST SUMMARY"
log "========================================"
log "Total: $TOTAL_COUNT | Passed: $PASS_COUNT | Failed: $FAIL_COUNT"
if [ "$FAIL_COUNT" -eq 0 ]; then
  log "All $TOTAL_COUNT test cases PASSED!"
else
  log "$FAIL_COUNT test case(s) FAILED out of $TOTAL_COUNT"
fi
log "========================================"

"$AUTO_WEB" disconnect 2>/dev/null || true
log "Test run completed at $(date)"
