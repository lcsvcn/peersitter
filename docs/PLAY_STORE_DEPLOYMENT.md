# PeerSitter — Google Play Store Deployment: Full Orientation

Self-contained briefing for whoever (human or agent) picks up Play Store
deployment next. Every fact below was verified directly against this repo
and this machine's environment — nothing here is guessed. Where a step
needs a human decision or a secret only the project owner has, it's
flagged explicitly as **[HUMAN]**.

iOS/AltStore deployment is a separate, unrelated track — not covered here.

---

## 0. Current state (as of this writing)

**Done:**
- Android project builds and runs: `apps/mobile/android/` is a working
  Capacitor project, confirmed building (`./gradlew assembleDebug`),
  installing, and launching on a real emulator, with Maestro UI tests
  passing (`apps/mobile/maestro/smoke-*.yaml`).
- Package name, app name, and all branding identifiers are finalized
  (see §1).
- Privacy Policy and Terms of Use are live, public, and ready to paste
  into Play Console (see §1).
- Codemagic MCP tools are already connected in this environment
  (`mcp__codemagic__*` — list_devices-equivalent is `list_applications`,
  plus `start_build`, `get_builds`, `get_build_status`, etc.). Source:
  https://github.com/stefanoamorelli/codemagic-mcp

**Not done / blocking a real store submission:**
1. **No release signing is configured.** `build.gradle`'s `release`
   buildType has no `signingConfig` — `./gradlew bundleRelease` today
   produces an **unsigned** AAB. See §6 — this is the critical path item.
2. **No custom app icon.** The app currently ships Capacitor's generic
   default icon/splash assets (`apps/mobile/android/app/src/main/res/mipmap-*/ic_launcher*.png`),
   not real PeerSitter branding. Play Console requires a 512×512 icon
   and a 1024×500 feature graphic for the store listing — neither exists
   yet. **[HUMAN]** — needs actual design input, not something to
   fabricate.
3. **No screenshots.** Play Console requires at least 2 phone
   screenshots. The Maestro flows already produce real in-app
   screenshots as a side effect (`takeScreenshot` steps in
   `apps/mobile/maestro/smoke-*.yaml`) — those are usable raw material,
   but should be retaken deliberately for store-listing quality rather
   than reused as-is from a test run.
4. **No `codemagic.yaml`** in the repo yet — Codemagic needs this to
   know how to build/sign/publish. Template in §7.
5. **The actual Play Console app has not been created yet** — §3 is the
   literal form to fill in.

---

## 1. Reference values (copy these exactly — don't re-derive them)

| Field | Value |
|---|---|
| App name | `PeerSitter` |
| Package name / `applicationId` | `dev.peersitter.app` (**permanent once set on Play Console — do not typo it**) |
| GitHub repo | https://github.com/lcsvcn/peersitter |
| Android project path | `apps/mobile/android/` (Capacitor-generated, checked into git) |
| Current `versionCode` / `versionName` | `1` / `"1.0"` (in `apps/mobile/android/app/build.gradle`) |
| `minSdkVersion` / `targetSdkVersion` | 23 / 35 (in `apps/mobile/android/variables.gradle`) — Play's minimum target API requirement changes roughly yearly; confirm 35 still satisfies Play's current policy before submitting, bump `targetSdkVersion` if not |
| Privacy Policy URL | https://lcsvcn.github.io/peersitter/privacy.html |
| Terms of Use URL | https://lcsvcn.github.io/peersitter/terms.html |
| Signing keys location | `git@gitlab.com:boring-development-team/utils/android_keys.git` — private, SSH-only. **Not yet accessed by any agent.** Whoever executes §6 needs SSH access to this repo plus the keystore password/alias/key password (not stored anywhere in this repo). |
| CI/CD | Codemagic (https://codemagic.io/apps), MCP already connected this session |
| Google Play Console | https://play.google.com/console |

**Build commands** (from `apps/mobile/README.md`):
```sh
# from apps/mobile/
npm --prefix ../web run build
npx cap sync android
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug
# APK lands at android/app/build/outputs/apk/debug/app-debug.apk
```
**Must be JDK 21 specifically** — JDK 17 fails with `invalid source
release: 21` against Capacitor's Gradle config; JDK 23+ and Gradle
8.11 (this project's wrapper version) are mutually incompatible. Install
via `brew install openjdk@21` if missing; don't `brew link` it globally,
just pass `JAVA_HOME` per-command as shown.

For a release build, the command is `./gradlew bundleRelease` (produces
an `.aab`, which is what Play Console wants — not an APK) instead of
`assembleDebug`, and only works correctly once §6 is done.

---

## 2. Prerequisites checklist

- [ ] **[HUMAN]** Google Play Developer account — one-time $25 fee, paid
  directly to Google, not something any agent can do.
- [ ] **[HUMAN]** SSH access configured to
  `git@gitlab.com:boring-development-team/utils/android_keys.git` for
  whoever executes §6, plus the keystore's password/alias/key-password
  (these are secrets — never commit them to the `peersitter` repo, which
  is public).
- [ ] Codemagic account connected to the GitHub repo
  (https://github.com/lcsvcn/peersitter) — **[HUMAN]** OAuth step via
  Codemagic's UI, can't be scripted.

---

## 3. Create the app in Play Console

Play Console → **Create app**. Exact fields:

| Field | Value |
|---|---|
| App name | `PeerSitter` |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free |
| Declarations | ✅ Developer Program Policies, ✅ US export laws |

The package name is **not** entered here — it gets locked in on the
first AAB/APK upload. Make sure that first upload is built from this
repo with `applicationId "dev.peersitter.app"` unchanged.

---

## 4. Store listing

**Short description** (≤80 chars):
> Open-source, peer-to-peer camera monitoring — no cloud, no account, free.

**Full description** — draft from the README's "Why" section; expand to
Play's ~4000-char limit using `/README.md`'s "Why" and "Security model"
sections as source material.

**Graphics needed (missing — see §0.2/§0.3):**
- App icon: 512×512 PNG
- Feature graphic: 1024×500
- Phone screenshots: minimum 2, PNG/JPEG, 16:9 or 9:16

**Suggested category:** Tools (no dedicated "security camera" category
exists on Play; "Tools" or "House & Home" are the closest fits used by
comparable apps).

**Contact:** use the GitHub Issues URL
(https://github.com/lcsvcn/peersitter/issues) rather than a personal
email, consistent with the privacy policy's own contact method.

---

## 5. App content section

- **Privacy policy**: https://lcsvcn.github.io/peersitter/privacy.html
- **Ads**: declare **no ads** (there are none in the app).
- **App access**: all functionality is available without login — there
  is no account system at all, so declare "all functionality available
  without special access."
- **Content rating questionnaire**: answer honestly per the
  questionnaire's actual questions; nothing in the app (violence, UGC,
  gambling, etc.) should trigger anything above the lowest rating tier.
- **Target audience**: not designed for or directed at children; pick
  the appropriate adult/general age range per the questionnaire.
- **Data safety form** — this is the one section needing judgment, not
  just facts. The honest shape of the answer given what the app
  actually does: camera/microphone permissions are used, but audio/video
  streams **directly peer-to-peer to the device the user pairs with**;
  nothing is collected by or transmitted to the developer; there is no
  analytics, crash-reporting, or ad SDK anywhere in the codebase (check
  `apps/web/package.json` and `apps/mobile/package.json` dependencies to
  confirm this is still true before submitting — it was true as of this
  writing). This generally supports answering **"No data collected"**,
  but whoever submits should personally verify the dependency list
  hasn't changed before relying on that answer.

---

## 6. Release signing — the critical path item

**Current state:** `apps/mobile/android/app/build.gradle`'s `release`
buildType block has no `signingConfig`:
```gradle
buildTypes {
    release {
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

**What needs to happen**, once the keystore is retrieved from
`git@gitlab.com:boring-development-team/utils/android_keys.git`
**[HUMAN — requires the GitLab SSH access and keystore secrets]**:

1. Place the keystore file somewhere **outside** the public `peersitter`
   repo (e.g. reference it via Codemagic's encrypted file storage, not a
   path committed to git — this repo is public).
2. Add a `keystore.properties`-style approach, kept out of git via
   `.gitignore` (already present at the repo root as a pattern-matchable
   location — add `apps/mobile/android/keystore.properties` to
   `.gitignore` before creating it), or — **preferred for CI** — inject
   signing values as Codemagic environment variables instead of a
   committed file at all, since this repo is public and must never
   contain the keystore or its passwords.
3. Add a `signingConfigs` block to `build.gradle` referencing env vars
   (works both locally via exported shell vars and in Codemagic):
   ```gradle
   android {
       ...
       signingConfigs {
           release {
               storeFile file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "release.keystore")
               storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
               keyAlias System.getenv("ANDROID_KEY_ALIAS")
               keyPassword System.getenv("ANDROID_KEY_PASSWORD")
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               minifyEnabled false
               proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
           }
       }
   }
   ```
4. **Recommended: enroll in [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)**
   (Play Console will prompt for this on first release) — Google then
   manages the final signing key, and the keystore from the GitLab repo
   only needs to be an **upload key**, which is lower-stakes to rotate
   if it's ever compromised than the app's actual signing key.

---

## 7. Codemagic CI/CD setup

1. **[HUMAN]** Connect the `lcsvcn/peersitter` GitHub repo in the
   Codemagic dashboard (https://codemagic.io/apps) — OAuth step, can't
   be scripted from here.
2. **[HUMAN]** In Play Console → **Setup → API access**, create/link a
   Google Cloud service account, download its JSON key, and grant it
   **Release manager** permission in Play Console. Store that JSON as a
   Codemagic **encrypted environment variable** (e.g.
   `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`) — never commit it to the repo.
3. Add the keystore (from the GitLab `android_keys` repo) and its
   password/alias/key-password to Codemagic as encrypted environment
   variables or via Codemagic's encrypted file storage — again, never
   into this public repo.
4. Add a `codemagic.yaml` at the repo root. Starting template (fill in
   the env var group name used in step 2/3, and confirm paths once a
   real workflow is tested):
   ```yaml
   workflows:
     android-release:
       name: PeerSitter — Android release
       max_build_duration: 30
       environment:
         groups:
           - android_signing        # keystore + passwords (set up in Codemagic UI)
           - google_play             # GCLOUD_SERVICE_ACCOUNT_CREDENTIALS
         node: 22
         java: 21
       scripts:
         - name: Install root workspace deps
           script: npm install
         - name: Build web app
           script: npm --prefix apps/web run build
         - name: Capacitor sync
           script: cd apps/mobile && npx cap sync android
         - name: Build signed AAB
           script: |
             cd apps/mobile/android
             ./gradlew bundleRelease
       artifacts:
         - apps/mobile/android/app/build/outputs/**/*.aab
       publishing:
         google_play:
           credentials: $GCLOUD_SERVICE_ACCOUNT_CREDENTIALS
           track: internal   # promote to production manually after testing
   ```
   This template assumes §6's `signingConfigs` block reads from env vars
   that the `android_signing` group provides
   (`ANDROID_KEYSTORE_PATH`/`ANDROID_KEYSTORE_PASSWORD`/`ANDROID_KEY_ALIAS`/`ANDROID_KEY_PASSWORD`)
   — adjust names to match whatever Codemagic's UI generates.
5. The `mcp__codemagic__*` tools already connected in this environment
   (`start_build`, `get_build_status`, `get_builds`, `get_build_step_log`,
   etc.) can trigger and monitor builds once the workflow above exists
   and the app is registered with `mcp__codemagic__add_application`.

---

## 8. Recommended rollout path

1. Build a signed AAB (§6/§7) and upload to Play Console's **Internal
   testing** track first — fastest review, no public visibility.
2. Add yourself (and any testers) to the internal testing list, confirm
   the app installs and runs correctly from a real Play Store install
   (not just `adb install`).
3. Promote to **Closed testing** or straight to **Production** once
   satisfied — production review is the slow one (can take days).

---

## 9. Things already solved — don't re-debug these

- **JDK version**: must be 21, see §1. (JDK 17 → `invalid source
  release: 21`; JDK 26 default on this machine → Gradle itself can't
  run.)
- **iOS deployment target** was bumped to 15.0 in both the Podfile and
  Xcode project — irrelevant to Android but noted here so nobody
  confuses the two platforms' gotchas.
- **Capacitor's WebView permission-bridging race**: on Android,
  `getUserMedia` can occasionally report `Permission denied` even after
  granting both the camera and microphone system dialogs — a known
  timing issue, documented with a fix path in `apps/mobile/README.md`.
  Not a release blocker, but worth knowing if QA hits it.

---

## 10. Open decisions for the project owner (Lucas) — not inferable

- Final app icon / feature graphic design (currently generic Capacitor
  placeholder — **do not ship this to production** as the store icon).
- Whether the GitLab `android_keys` repo already contains an existing
  keystore to reuse, or a new one needs generating for this app
  specifically.
- Primary store listing language beyond English (the UI itself is
  English-only right now; Play Console store listings can be localized
  independently of the app UI).
