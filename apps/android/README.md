# VITTORIA HOME — Android

Native Android client (Kotlin, Jetpack Compose, Coroutines/Flow, MVVM, Hilt).

## Requirements

- Android Studio Hedgehog+
- JDK 17 (bundled with Android Studio)
- min SDK 26 (Android 8.0), target SDK 34

## Setup

1. Open `apps/android/` in Android Studio ("Open existing project").
2. Wait for Gradle sync.
3. Run configuration `app` on an emulator (Pixel 6, API 34).
4. Run tests: `./gradlew test`.

Detailed architecture is added in Plan 7.

## Scaffolding status

Full Gradle project scaffolding is deferred to a workstation with Android Studio Hedgehog+ and JDK 17 installed. The recommended workflow:

1. Open Android Studio
2. File → New → New Project → Empty Activity (Compose)
3. Name: `VittoriaHome`, package: `app.vittoria.home`
4. Save to `apps/android/` (parent directory)
5. Build configuration language: Kotlin DSL (`build.gradle.kts`)
6. Minimum SDK: API 26

After scaffolding, replace generated `MainActivity.kt` and `ExampleUnitTest.kt` with the bootstrap code described in Plan 0 Task 9 (Steps 9.3–9.4).
