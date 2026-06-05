// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-encounter-ble",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v14),
  ],
  products: [
    .library(
      name: "tauri-plugin-encounter-ble",
      type: .static,
      targets: ["tauri-plugin-encounter-ble"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-encounter-ble",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
