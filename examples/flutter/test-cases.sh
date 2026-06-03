#!/bin/bash
set -e

export ANDROID_HOME=/home/doc/Android/Sdk
export PATH="$ANDROID_HOME/platform-tools:$PATH"
export MIDSCENE_MODEL_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
export MIDSCENE_MODEL_NAME="doubao-seed-2-0-lite-260428"
export MIDSCENE_MODEL_FAMILY="doubao-seed"
export MIDSCENE_MODEL_API_KEY=$(grep 'export MIDSCENE_MODEL_API_KEY' ~/.bashrc | tail -1 | sed 's/.*export MIDSCENE_MODEL_API_KEY=//' | tr -d '"' | tr -d "'")

DEVICE_ID="emulator-5554"
PACKAGE="com.zego.ai_avatar_demo"
REPORT_DIR="midscene_run"

mkdir -p "$REPORT_DIR"

echo "=== TC-01: Login Page Display ==="
npx @midscene/android connect "$DEVICE_ID" --report-dir "$REPORT_DIR" -- <<'TEST'
const { connectDevice } = require('@midscene/android');
const device = await connectDevice();
await device.snapshot();
await device.assertTextVisible('AI Avatar');
await device.assertTextVisible('Username');
await device.assertTextVisible('Login');
console.log('TC-01 PASSED: Login page displayed correctly');
TEST

echo "=== TC-02: Login Navigation ==="
npx @midscene/android connect "$DEVICE_ID" --report-dir "$REPORT_DIR" -- <<'TEST'
const { connectDevice } = require('@midscene/android');
const device = await connectDevice();
await device.inputText('Username', 'TestUser');
await device.tap('Login');
await device.waitFor(3000);
await device.snapshot();
await device.assertTextVisible('Start Conversation');
console.log('TC-02 PASSED: Login and navigation successful');
TEST

echo "=== TC-03: Main Page Initial State ==="
npx @midscene/android connect "$DEVICE_ID" --report-dir "$REPORT_DIR" -- <<'TEST'
const { connectDevice } = require('@midscene/android');
const device = await connectDevice();
await device.assertTextVisible('Start Conversation');
await device.snapshot();
console.log('TC-03 PASSED: Main page initial state correct');
TEST

echo "=== TC-04: Start Conversation ==="
npx @midscene/android connect "$DEVICE_ID" --report-dir "$REPORT_DIR" -- <<'TEST'
const { connectDevice } = require('@midscene/android');
const device = await connectDevice();
await device.tap('Start Conversation');
await device.waitFor(5000);
await device.snapshot();
await device.assertTextVisible('Mic');
await device.assertTextVisible('End');
console.log('TC-04 PASSED: Conversation started');
TEST

echo "=== TC-05: End Conversation ==="
npx @midscene/android connect "$DEVICE_ID" --report-dir "$REPORT_DIR" -- <<'TEST'
const { connectDevice } = require('@midscene/android');
const device = await connectDevice();
await device.tap('End Conversation');
await device.waitFor(3000);
await device.snapshot();
await device.assertTextVisible('Start Conversation');
console.log('TC-05 PASSED: Conversation ended');
TEST

echo "=== All tests completed ==="
