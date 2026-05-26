# VITTORIA HOME — Android

Native Android client (Kotlin, Jetpack Compose, Coroutines/Flow, MVVM, Hilt).

## Requirements

- Android Studio Hedgehog+ (project bootstrapped with Panda 4 / 2025.3.4 Patch 1)
- JDK 17 (bundled with Android Studio)
- Android SDK Platform 36 (API 36 "Baklava"), build-tools 36.1.0, platform-tools 37.0.0
- `min SDK 26` (Android 8.0)

## Setup

1. Open `apps/android/` in Android Studio ("Open existing project").
2. Wait for Gradle sync.
3. Run configuration `app` on an emulator.
4. Run unit tests from CLI: `./gradlew testDebugUnitTest`.

## Known issue: Cyrillic (non-ASCII) characters in user profile path

Gradle 9.x fails when its user-home directory (`%USERPROFILE%\.gradle`) contains non-ASCII characters — for example, when the Windows user is named `Сергей`. Symptom:

```
java.lang.ClassNotFoundException: worker.org.gradle.process.internal.worker.GradleWorkerMain
```

Workaround: point Gradle at an ASCII path before running any `./gradlew` command. One-time, persistent fix (PowerShell):

```powershell
[Environment]::SetEnvironmentVariable("GRADLE_USER_HOME", "C:\gradle_home", "User")
```

Then restart any open terminals. Android Studio itself is unaffected and reads this variable automatically once set.

The CI runner (GitHub Actions, ubuntu-latest) uses ASCII paths and does not need this workaround.

Detailed architecture is added in Plan 7.
