#!/usr/bin/env bash
# Builds ReproducerApp's release APK, installs and launches it on the device adb reaches (ANDROID_SERIAL picks one),
# takes a screenshot and measures where the box's radial gradient turns from red to blue (measure.mjs).
# Exit 1 while the 40px stop lands where max(radiusX, radiusY) puts it, 0 once it lands where CSS puts it, 2 otherwise.
set -u
cd "$(dirname "$0")" || exit 2

application_id=com.reproducerapp

system="$(uname -sm)"
if ! node_version="$(node --version 2>&1)"; then
    echo "step failed: node --version: ${node_version}"
    exit 2
fi
if ! device="$(adb shell getprop ro.product.model 2>&1)" || ! android_version="$(adb shell getprop ro.build.version.release 2>&1)"; then
    echo "step failed: reading the device: ${device}"
    exit 2
fi
echo "${system}, node ${node_version}, device ${device//$'\r'/} on Android ${android_version//$'\r'/}"

if ! install_output="$(cd ReproducerApp && yarn install --frozen-lockfile --non-interactive 2>&1)"; then
    printf '%s\n' "${install_output}"
    echo "SUMMARY: yarn install failed"
    exit 2
fi
if ! react_native_version="$(cd ReproducerApp && node -p 'require("react-native/package.json").version' 2>&1)"; then
    echo "SUMMARY: reading react-native's version failed: ${react_native_version}"
    exit 2
fi
echo "react-native ${react_native_version}"
grep -o "radial-gradient([^']*)" ReproducerApp/App.tsx

echo "== ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a"
if ! build_output="$(cd ReproducerApp/android && ./gradlew --no-daemon --console=plain assembleRelease -PreactNativeArchitectures=arm64-v8a 2>&1)"; then
    printf '%s\n' "${build_output}" | tail -n 40
    echo "SUMMARY: the release build failed"
    exit 2
fi
grep -E "^BUILD SUCCESSFUL" <<<"${build_output}"

echo "== adb install, launch ${application_id}, screenshot"
if ! install_output="$(cd ReproducerApp/android && adb install -r app/build/outputs/apk/release/app-release.apk 2>&1)"; then
    printf '%s\n' "${install_output}"
    echo "SUMMARY: adb install failed"
    exit 2
fi
adb shell am force-stop "${application_id}"
if ! launch_output="$(adb shell am start -W -n "${application_id}/.MainActivity" 2>&1)"; then
    printf '%s\n' "${launch_output}"
    echo "SUMMARY: launching the app failed"
    exit 2
fi
# The first frame follows the launch's report; three seconds hold the box well past it.
sleep 3
if ! adb exec-out screencap -p > screenshot.png; then
    echo "SUMMARY: the screenshot failed"
    exit 2
fi
echo "screenshot: screenshot.png"
node measure.mjs screenshot.png
