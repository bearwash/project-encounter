# BLE Real Device Test

Project Encounter の iPhone / Android 実機 BLE すれ違い検証手順。

## Build Artifacts

- Android debug APK:
  `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
- iOS unsigned IPA:
  `src-tauri/gen/apple/build/arm64/Project Encounter.ipa`

## Android

```bash
/opt/homebrew/share/android-commandlinetools/platform-tools/adb devices -l
pnpm ble:android:install
pnpm ble:android:logcat
```

Expected app state in the dev drawer:

- `BACKEND`: `TAURI-PLUGIN`
- `BT`: on
- `PERM`: on after Nearby devices permission is granted
- `ADV`: on after advertise starts
- `SCAN`: on after scan starts
- `SEEN`: increments when a peer `user_id` is emitted by native BLE

Useful Android logs:

- `EncounterBle: start completed`
- `EncounterBle: advertise started`
- `EncounterBle: scan started`
- `EncounterBle: scan result handled from service data ...`
- `EncounterBle: GATT read completed ...`
- `EncounterBle: encounter emitted user=...`

## iOS

Unsigned IPA build verifies compile only. Real-device install needs an Apple
Developer Team / signing setting.

```bash
pnpm tauri ios build --debug --target aarch64 --ci
xcrun xctrace list devices
```

Watch Xcode device console for:

- `[EncounterBle] start completed`
- `[EncounterBle] advertise started`
- `[EncounterBle] scan started`
- `[EncounterBle] scan result handled from service data ...`
- `[EncounterBle] GATT read completed ...`
- `[EncounterBle] encounter emitted user=...`

## Acceptance

- Two physical devices have different `my_profile.user_id` values.
- Both devices have Bluetooth enabled and BLE permissions granted.
- Each device shows `ADV` and `SCAN` enabled in the dev drawer.
- Bringing devices close causes at least one `encounter emitted user=...` log.
- `encounter_logs` receives the peer `user_id` on the receiving device.
- Repeated proximity within cooldown does not create duplicate rows.

## No-Device Preflight

実機接続前に、静的検査と成果物検査だけをまとめて実行する:

```bash
pnpm lint
pnpm typecheck
pnpm ble:check-artifacts
# or
pnpm ble:preflight
```
