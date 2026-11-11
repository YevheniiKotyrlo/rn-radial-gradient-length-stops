#!/usr/bin/env bash
# Builds ReproducerApp in Release, installs and launches it on the iPhone or iPad whose devicectl identifier is the
# first argument, takes a screenshot and measures where the box's radial gradient turns from red to blue (measure.mjs).
# Signing: DEVELOPMENT_TEAM, and BUNDLE_ID (org.reactjs.native.example.ReproducerApp by default), from the environment.
# Exit 1 while the 40px stop lands where max(radiusX, radiusY) puts it, 0 once it lands where CSS puts it, 2 otherwise.
set -uo pipefail
cd "$(dirname "$0")" || exit 2

device="${1:?usage: DEVELOPMENT_TEAM=<team> ./reproduce-ios.sh <devicectl device identifier>}"
team="${DEVELOPMENT_TEAM:?set DEVELOPMENT_TEAM to the team that signs the app}"
bundle_id="${BUNDLE_ID:-org.reactjs.native.example.ReproducerApp}"
mkdir -p logs

if ! macos="$(sw_vers -productVersion)" || ! xcode="$(xcodebuild -version | tr '\n' ' ')" ||
    ! node_version="$(node --version)" || ! pod_version="$(pod --version)" ||
    ! device_line="$(xcrun devicectl list devices 2>/dev/null | grep -F "${device}")"; then
    echo "SUMMARY: a tool the run needs is missing, or devicectl does not list ${device}"
    exit 2
fi
model="$(sed -E 's/ {2,}/|/g' <<<"${device_line}" | cut -d '|' -f 4)"
echo "macOS ${macos}; ${xcode}; node ${node_version}; pod ${pod_version}; device ${model}"

echo "\$ yarn install --frozen-lockfile"
if ! (cd ReproducerApp && npx --yes yarn@1 install --frozen-lockfile --non-interactive > ../logs/yarn-install.log 2>&1); then
    tail -n 20 logs/yarn-install.log
    echo "SUMMARY: yarn install failed"
    exit 2
fi
react_native_version="$(cd ReproducerApp && node -p 'require("react-native/package.json").version')" || exit 2
echo "react-native ${react_native_version}"
grep -o "radial-gradient([^']*)" ReproducerApp/App.tsx

echo "\$ pod install"
if ! (cd ReproducerApp/ios && pod install > ../../logs/pod-install.log 2>&1); then
    tail -n 20 logs/pod-install.log
    echo "SUMMARY: pod install failed"
    exit 2
fi

# Xcode adds the device to the profile it makes only when the destination names the device.
echo "\$ xcodebuild -workspace ReproducerApp.xcworkspace -scheme ReproducerApp -configuration Release -destination id=${device} build"
if ! (cd ReproducerApp/ios && xcodebuild -workspace ReproducerApp.xcworkspace -scheme ReproducerApp -configuration Release \
    -destination "id=${device}" -derivedDataPath ../../derived-data DEVELOPMENT_TEAM="${team}" \
    CODE_SIGN_STYLE=Automatic PRODUCT_BUNDLE_IDENTIFIER="${bundle_id}" -allowProvisioningUpdates -allowProvisioningDeviceRegistration build \
    > ../../logs/build.log 2>&1); then
    grep -E 'error:|\*\* BUILD' logs/build.log | head -n 20
    echo "SUMMARY: the Release build failed"
    exit 2
fi
echo "** BUILD SUCCEEDED **"

echo "== devicectl install, launch, screenshot"
if ! xcrun devicectl device install app --device "${device}" derived-data/Build/Products/Release-iphoneos/ReproducerApp.app \
    > logs/install.log 2>&1; then
    cat logs/install.log
    echo "SUMMARY: installing the app failed"
    exit 2
fi
if ! xcrun devicectl device process launch --device "${device}" --terminate-existing "${bundle_id}" > logs/launch.log 2>&1; then
    cat logs/launch.log
    echo "SUMMARY: launching the app failed"
    exit 2
fi
# devicectl returns once the process starts; five seconds hold the box well past its first frame.
sleep 5
if ! xcrun devicectl device capture screenshot --device "${device}" --destination screenshot.png > logs/screenshot.log 2>&1; then
    cat logs/screenshot.log
    echo "SUMMARY: the screenshot failed"
    exit 2
fi
echo "screenshot: screenshot.png"
node measure.mjs screenshot.png
