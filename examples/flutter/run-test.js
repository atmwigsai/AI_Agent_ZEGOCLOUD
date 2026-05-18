const { agentFromAdbDevice } = require('@midscene/android');

const DEVICE_ID = 'emulator-5554';
const PKG = 'com.zego.ai_avatar_demo';

const results = [];

function record(tc, passed, detail = '') {
  results.push({ tc, passed, detail });
  const status = passed ? 'PASSED' : 'FAILED';
  console.log(`${tc} ${status}${detail ? ': ' + detail : ''}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function ensureAppForeground(agent) {
  // Force app to foreground via ADB
  await agent.launch(PKG);
  await sleep(2000);
}

async function main() {
  const agent = await agentFromAdbDevice(DEVICE_ID);

  // Force restart app to get clean login page state
  console.log('Restarting app to get clean state...');
  await agent.terminate(PKG);
  await agent.launch(PKG);
  await sleep(4000);

  // TC-01: Login Page Display
  console.log('=== TC-01: Login Page Display ===');
  try {
    await agent.aiAssert('This screen shows a login page for an AI Avatar Demo app with a Username input field and a Login button');
    record('TC-01', true, 'Login page displayed correctly');
  } catch (e) {
    record('TC-01', false, e.message);
  }

  // TC-02: Login Navigation
  console.log('=== TC-02: Login Navigation ===');
  try {
    // Use adb commands directly for reliable text input and button tap
    const { execSync } = require('child_process');
    // Focus and type in username field
    execSync(`adb -s ${DEVICE_ID} shell input tap 672 1606`);
    await sleep(500);
    execSync(`adb -s ${DEVICE_ID} shell input text TestUser`);
    await sleep(1000);
    // Close keyboard
    execSync(`adb -s ${DEVICE_ID} shell input keyevent KEYCODE_BACK`);
    await sleep(500);
    // Tap Login button
    execSync(`adb -s ${DEVICE_ID} shell input tap 672 1834`);
    await sleep(4000);
    // Verify we navigated to main page
    await agent.aiAssert('This screen shows a main page with a Start Conversation button visible');
    record('TC-02', true, 'Login and navigation successful');
  } catch (e) {
    record('TC-02', false, e.message);
  }

  // TC-03: Main Page Initial State
  console.log('=== TC-03: Main Page Initial State ===');
  try {
    await agent.aiAssert('This screen shows a main page with a Start Conversation button and a video placeholder area showing "AI Avatar Video Will Appear Here"');
    record('TC-03', true, 'Main page initial state correct');
  } catch (e) {
    record('TC-03', false, e.message);
  }

  // TC-04: Start Conversation
  console.log('=== TC-04: Start Conversation ===');
  try {
    const { execSync } = require('child_process');
    // Tap Start Conversation button using coordinates
    execSync(`adb -s ${DEVICE_ID} shell input tap 892 2812`);
    await sleep(4000);
    // Handle mic permission dialog if present - tap "While using the app"
    try {
      execSync(`adb -s ${DEVICE_ID} shell input tap 672 1576`);
      await sleep(3000);
    } catch (_) { /* permission already granted */ }
    // Wait for connection
    await sleep(10000);
    // Re-launch app to foreground if it went to background
    await ensureAppForeground(agent);
    // Check result - End Conversation button means conversation started successfully
    await agent.aiAssert('This screen shows an End Conversation button');
    record('TC-04', true, 'Start Conversation interaction works correctly');
  } catch (e) {
    record('TC-04', false, e.message);
  }

  // TC-05: End Conversation / Return to Initial State
  console.log('=== TC-05: End Conversation / Return to Initial State ===');
  try {
    const { execSync } = require('child_process');
    // Try to end conversation if connected
    try {
      execSync(`adb -s ${DEVICE_ID} shell input tap 892 2812`);
      await sleep(4000);
    } catch (_) { /* not in connected state */ }
    // Ensure app is in foreground
    await ensureAppForeground(agent);
    // Verify initial state
    await agent.aiAssert('This screen shows a main page with a Start Conversation button and Ready status visible');
    record('TC-05', true, 'App returns to initial state correctly');
  } catch (e) {
    record('TC-05', false, e.message);
  }

  await agent.destroy();

  // Print summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  for (const r of results) {
    console.log(`  ${r.tc}: ${r.passed ? 'PASSED' : 'FAILED'}${r.detail ? ' - ' + r.detail : ''}`);
  }
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Result: ${failed === 0 ? 'ALL PASSED' : 'SOME FAILED'}`);

  // Write report JSON
  const fs = require('fs');
  const path = require('path');
  const reportDir = path.join(__dirname, 'midscene_run');
  const report = {
    timestamp: new Date().toISOString(),
    version: '1.3.0+3',
    device: DEVICE_ID,
    package: PKG,
    total: results.length,
    passed,
    failed,
    results,
  };
  fs.writeFileSync(path.join(reportDir, 'test-report.json'), JSON.stringify(report, null, 2));
  console.log(`Report saved to ${path.join(reportDir, 'test-report.json')}`);
}

main().catch(console.error);