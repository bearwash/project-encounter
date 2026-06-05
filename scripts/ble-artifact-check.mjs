import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const apk = join(root, 'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk');
const ipa = join(root, 'src-tauri/gen/apple/build/arm64/Project Encounter.ipa');
const plist = join(root, 'src-tauri/gen/apple/project_encounter_iOS/Info.plist');
const capability = join(root, 'src-tauri/capabilities/default.json');

const aaptCandidates = [
  '/opt/homebrew/share/android-commandlinetools/build-tools/36.0.0/aapt',
  '/opt/homebrew/share/android-commandlinetools/build-tools/35.0.0/aapt',
  '/opt/homebrew/share/android-commandlinetools/build-tools/34.0.0/aapt',
];

function fail(message) {
  console.error(`BLE artifact check failed: ${message}`);
  process.exit(1);
}

function requireFile(path) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  if (statSync(path).size === 0) fail(`empty file: ${path}`);
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' });
}

requireFile(apk);
requireFile(ipa);
requireFile(plist);

const aapt = aaptCandidates.find((path) => existsSync(path));
if (!aapt) fail('aapt not found under Android command line tools');

const permissions = run(aapt, ['dump', 'permissions', apk]);
for (const permission of [
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_ADVERTISE',
  'android.permission.BLUETOOTH_CONNECT',
]) {
  if (!permissions.includes(permission)) fail(`APK missing ${permission}`);
}

const manifestTree = run(aapt, ['dump', 'xmltree', apk, 'AndroidManifest.xml']);
if (!manifestTree.includes('android.hardware.bluetooth_le')) {
  fail('APK missing android.hardware.bluetooth_le feature');
}
if (!manifestTree.includes('usesPermissionFlags') || !manifestTree.includes('0x10000')) {
  fail('BLUETOOTH_SCAN is missing neverForLocation flag');
}

const bluetoothUsage = run('/usr/libexec/PlistBuddy', [
  '-c',
  'Print :NSBluetoothAlwaysUsageDescription',
  plist,
]);
if (!bluetoothUsage.includes('BLE')) fail('Info.plist missing Bluetooth usage text');

const backgroundModes = run('/usr/libexec/PlistBuddy', ['-c', 'Print :UIBackgroundModes', plist]);
for (const mode of ['bluetooth-central', 'bluetooth-peripheral']) {
  if (!backgroundModes.includes(mode)) fail(`Info.plist missing ${mode}`);
}

const fullScreen = run('/usr/libexec/PlistBuddy', ['-c', 'Print :UIRequiresFullScreen', plist]);
if (!fullScreen.includes('true')) fail('Info.plist missing UIRequiresFullScreen');

const capabilities = readFileSync(capability, 'utf8');
if (!capabilities.includes('encounter-ble:default')) {
  fail('capability missing encounter-ble:default');
}

console.log('BLE artifact check passed');
console.log(`APK: ${apk}`);
console.log(`IPA: ${ipa}`);
