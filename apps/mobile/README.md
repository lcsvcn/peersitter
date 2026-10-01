# Mobile shell (Capacitor) — iOS + Android

Packages `apps/web`'s build output as a real iOS/Android app. `ios/` and
`android/` are checked in and build out of the box on a machine with Xcode
and Android Studio installed.

## iOS (Simulator + AltStore sideload)

Requires Xcode + CocoaPods (`brew install cocoapods`).

```sh
npm --prefix ../web run build
npx cap sync ios
cd ios/App && pod install     # only needed again if Podfile changes
```

Run in Simulator (proven working — boots, installs, launches):

```sh
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'id=<simulator-udid>' \
  -derivedDataPath ios/App/build build
xcrun simctl install <simulator-udid> ios/App/build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch <simulator-udid> dev.peersitter.app
```

(`xcrun simctl list devices` prints UDIDs. Or just `open ios/App/App.xcworkspace` and hit Run in Xcode.)

**For AltStore** (installing on your own iPhone without the App Store):
build and run once on a connected real device from Xcode with your free
Apple ID selected as the signing team (Xcode → Signing & Capabilities →
your personal team), which produces a 7-day, ad-hoc-signed build. Point
[AltServer](https://altstore.io) at the same `.ipa` (Xcode → Product →
Archive → Distribute App → Development, or grab it from
`ios/App/build/Build/Products/Debug-iphoneos/App.app` after a device
build) to install and keep it resigned automatically while AltServer is
running on your computer. This step needs your own Apple ID logged into
Xcode and a real device plugged in — it isn't something that can be
scripted headlessly.

`ios/App/App/Info.plist` already declares `NSCameraUsageDescription` /
`NSMicrophoneUsageDescription`, so the permission prompt appears
correctly; camera/mic worked as expected in Simulator testing.

## Android (emulator or Google Play)

Requires Android Studio / SDK, and **JDK 21** specifically — newer JDKs
(23+) fail with `invalid source release: 21` against Capacitor's Gradle
config, and Gradle 8.11 itself can't run on JDK 26. Install with
`brew install openjdk@21` and point `JAVA_HOME` at it for Gradle
commands rather than changing your default `java`:

```sh
npm --prefix ../web run build
npx cap sync android
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Run on an emulator or connected device: `adb install -r app/build/outputs/apk/debug/app-debug.apk`,
then `adb shell am start -n dev.peersitter.app/.MainActivity`.

`AndroidManifest.xml` already declares `CAMERA`/`RECORD_AUDIO` and the
camera `<uses-feature>`. Confirmed working: the app builds, installs, and
launches on a real emulator, and tapping "Be a Camera" does trigger
Android's native camera and microphone permission dialogs.

**Known issue:** on the emulator, granting both the camera and
microphone dialogs in sequence still sometimes resulted in
`getUserMedia` rejecting with `NotAllowedError` ("Permission denied") —
a timing race in how Capacitor's `BridgeWebViewClient.onPermissionRequest`
resolves a combined video+audio request against two sequential Android
runtime-permission results. If this reproduces on a real device too, the
reliable fix is to pre-request `android.permission.CAMERA` /
`RECORD_AUDIO` explicitly (e.g. via `@capacitor/camera`'s
`checkPermissions`/`requestPermissions`, or a small custom permissions
plugin) *before* calling `getUserMedia`, rather than relying solely on
the WebView's built-in bridging.

## Testing

`maestro/` has three Maestro UI flows (Camera, Viewer, Gallery) confirmed
passing against the real installed app on both iOS Simulator and an
Android emulator — see `maestro/README.md`.

**Publishing to Google Play** needs your own Google Play Console account,
which has an unavoidable one-time $25 registration fee from Google (not
from this project) — building and sideloading the free APK directly
(above) has zero cost either way.
