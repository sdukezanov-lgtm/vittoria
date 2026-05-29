# VittoriaClient — iOS

Unverified scaffold authored on Windows.

## Setup on a Mac

1. Install XcodeGen: `brew install xcodegen`
2. Generate the Xcode project:
   ```
   cd apps/ios
   xcodegen generate
   ```
3. Open `VittoriaClient.xcodeproj` in Xcode 15+.
4. Select your signing team under Signing & Capabilities.
5. Choose an iOS Simulator target and press Run (Cmd+R).

## Dev API

Base URL: `http://localhost:3000/api/v1`

`NSAllowsArbitraryLoads` is enabled for development so the app can reach the local HTTP server.

## Requirements

- macOS Sonoma+
- Xcode 15+
- iOS deployment target: 16.0+
