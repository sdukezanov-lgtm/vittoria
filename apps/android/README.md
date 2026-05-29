# Vittoria Client — Android

Unverified scaffold authored on Windows (no Android SDK/emulator available at time of writing).

Open in Android Studio Koala (2024.1) or newer, let Gradle sync, run on an emulator. Dev API base URL is `http://10.0.2.2:3000/api/v1/` (standard AVD alias for localhost on the host machine).

## Requirements

- Android Studio Koala (2024.1.1) or newer
- JDK 17+ (bundled with Android Studio)
- Android SDK Platform 34 (API 34), build-tools 34.x

## Setup

1. Open `apps/android/` in Android Studio ("Open existing project").
2. Wait for Gradle sync.
3. Start the backend API server locally (`http://localhost:3000`).
4. Run configuration `app` on an AVD (API 26+).

## Known issue: Cyrillic (non-ASCII) characters in user profile path

Gradle fails when its user-home directory (`%USERPROFILE%\.gradle`) contains non-ASCII characters. Workaround (PowerShell, one-time):

```powershell
[Environment]::SetEnvironmentVariable("GRADLE_USER_HOME", "C:\gradle_home", "User")
```

Then restart terminals. Android Studio reads this variable automatically.

## Stack

- Kotlin + Jetpack Compose (Material 3)
- Retrofit 2.11 + OkHttp 4.12 + kotlinx-serialization 1.6.3
- Navigation Compose 2.7
- AndroidX Security (EncryptedSharedPreferences) for token storage
- Coroutines / Flow
- MVVM + manual DI (no Hilt)
- Min SDK 26 / Target SDK 34 / AGP 8.5.0 / Kotlin 2.0.0
