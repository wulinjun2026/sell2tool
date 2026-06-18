#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -z "${ANDROID_HOME:-}" ] && [ ! -d "$HOME/Library/Android/sdk" ]; then
  echo "未检测到 Android SDK。请先安装 Android Studio，并设置 ANDROID_HOME。"
  echo "示例: export ANDROID_HOME=\$HOME/Library/Android/sdk"
  exit 1
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"
fi

echo "==> Generate PWA icons"
node scripts/generate-pwa-icons.js

echo "==> Sync Capacitor Android"
npx cap sync android

echo "==> Build debug APK"
cd "$ROOT/android"
./gradlew assembleDebug

mkdir -p "$ROOT/dist"
APK_SRC="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
APK_DST="$ROOT/dist/used-car-assistant.apk"
cp "$APK_SRC" "$APK_DST"

echo "==> APK ready: $APK_DST"
ls -lh "$APK_DST"
