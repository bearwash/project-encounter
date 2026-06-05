const COMMANDS: &[&str] = &[
    "registerListener",
    "removeListener",
    "checkPermissions",
    "requestPermissions",
    "drainPending",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
