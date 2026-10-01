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
  (`mcp__codemagic__*` — `get_all_applications`, `start_build`,
  `get_builds`, `get_build_status`, `get_build_step_log`, etc.). Source:
  https://github.com/stefanoamorelli/codemagic-mcp
- **The repo is registered in Codemagic**: app `peersitter`, id
  `6abe835187354fde5a07a2cc`, `settingsSource: "file"` (meaning it reads
  `codemagic.yaml` from the repo, not the UI workflow editor — the
  auto-created default UI workflow is a generic Flutter template and is
  irrelevant/superseded now that the yaml file exists).
- **`codemagic.yaml` exists at the repo root**, defining an
  `android-release` workflow: builds the web app, `cap sync`s Android,
  builds a signed `bundleRelease` AAB, and publishes it to Play Console's
  **internal** track as a draft. It's gated on pushing a git tag matching
  `android-v*` (not on every commit) — see §7 for exactly how to trigger
  it.
- **`apps/mobile/android/app/build.gradle` has a conditional
  `signingConfigs.release`** that reads
  `CM_KEYSTORE_PATH`/`CM_KEYSTORE_PASSWORD`/`CM_KEY_ALIAS`/`CM_KEY_PASSWORD`
  — the exact env vars Codemagic auto-injects when a workflow's
  `android_signing` references an uploaded keystore. Local
  `assembleDebug` is unaffected (those vars are unset locally, so
  `release` just stays unsigned for local builds, same as before).

**Not done / blocking a real store submission:**
1. **No keystore uploaded to Codemagic yet.** The yaml references a
   keystore reference named `peersitter_keystore` that doesn't exist in
   Codemagic until someone uploads it. See §6 — this is now the single
   critical path item, and it's a **[HUMAN]** step (needs the GitLab
   `android_keys` repo access + the Codemagic dashboard, neither of
   which any agent has).
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
4. **The Play service account credentials aren't in Codemagic yet.** The
   yaml references a `google_play` environment variable group with
   `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` — see §7.
5. **The actual Play Console app has not been created yet** — §3 is the
   literal form to fill in. (The `google_play` publishing step in
   `codemagic.yaml` will fail until this exists, since there's nothing
   on Play's side to publish to.)

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
| Codemagic app | `peersitter`, id `6abe835187354fde5a07a2cc` — https://codemagic.io/app/6abe835187354fde5a07a2cc |
| Codemagic keystore reference name | `peersitter_keystore` (referenced in `codemagic.yaml`'s `android_signing` — must be uploaded with exactly this name, or update the yaml to match whatever name is actually used) |
| Codemagic env var group for Play publishing | `google_play`, must contain `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` |
| Release trigger | push a git tag matching `android-v*` (e.g. `android-v1.0.0`) — see §7 |
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

## 6. Release signing — the one remaining blocker

This is now **the only step standing between a tagged commit and a
published internal-track release.** Everything else (the yaml, the
Gradle config, the Codemagic app registration) is already done.

**Current state:**
- `apps/mobile/android/app/build.gradle` has a conditional
  `signingConfigs.release` that reads
  `CM_KEYSTORE_PATH`/`CM_KEYSTORE_PASSWORD`/`CM_KEY_ALIAS`/`CM_KEY_PASSWORD`
  — these are the exact env var names Codemagic auto-populates when a
  workflow references an uploaded keystore via `android_signing`.
- `codemagic.yaml`'s `android-release` workflow references
  `android_signing: [peersitter_keystore]` — but no keystore named
  `peersitter_keystore` has been uploaded to Codemagic yet, so this
  reference currently resolves to nothing and the build will fail at the
  `bundleRelease` step.

**What needs to happen — [HUMAN, requires GitLab SSH access +
Codemagic dashboard access, neither available to any agent]:**

1. Pull the keystore from `git@gitlab.com:boring-development-team/utils/android_keys.git`
   (need its password + key alias + key password too — not stored
   anywhere in this repo, by design, since this repo is public).
2. In the Codemagic dashboard → this app
   (https://codemagic.io/app/6abe835187354fde5a07a2cc) → **Code signing
   identities** → **Android keystores** → upload it, naming the
   reference **exactly** `peersitter_keystore` (or, if you name it
   something else, update the single line in `codemagic.yaml` that says
   `- peersitter_keystore` to match).
3. **Recommended: enroll in [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)**
   (Play Console prompts for this on first release) — Google then
   manages the actual signing key, and the keystore uploaded to
   Codemagic only needs to be an **upload key**, which is lower-stakes
   to rotate if it's ever compromised than the app's real signing key.

Once this is done, the `android-release` workflow is fully live — no
further yaml or Gradle changes needed.

---

## 7. Codemagic CI/CD — what's already done, what's left

**Already done (no further action needed for these):**
- The repo is registered in Codemagic as app `peersitter`
  (id `6abe835187354fde5a07a2cc`), added via
  `mcp__codemagic__add_application` pointed at
  `https://github.com/lcsvcn/peersitter.git`.
- `codemagic.yaml` exists at the repo root defining the
  `android-release` workflow (install deps → build web app → `cap sync`
  → `gradlew bundleRelease` → publish to Play's `internal` track as a
  draft). It only runs on a pushed git tag matching `android-v*`, not on
  every commit — see the trigger command below.
- `build.gradle` is wired to consume Codemagic's injected signing env
  vars (§6).

**Still needed — both [HUMAN]:**
1. **Upload the keystore** — §6, the one true blocker left.
2. **Add the `google_play` environment variable group** in the Codemagic
   dashboard for this app, containing `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`
   (the full JSON key of a Google Cloud service account that's been
   granted **Release manager** permission in Play Console → Setup → API
   access). Without this, the `publishing.google_play` step in
   `codemagic.yaml` has nothing to authenticate with.

**How to trigger a release build once both of the above are done:**
```sh
git tag android-v1.0.0
git push origin android-v1.0.0
```
Or trigger it directly via the already-connected MCP tools without
waiting for a tag push:
```
mcp__codemagic__start_build(app_id="6abe835187354fde5a07a2cc", workflow_id="android-release", branch="main")
```
(Exact `start_build` argument names should be confirmed against its
current schema when actually calling it — fetch it via
`ToolSearch("select:mcp__codemagic__start_build")` first, same as was
done for `add_application` in this session.)

Then monitor with `mcp__codemagic__get_build_status` /
`get_build_step_log` using the build ID the start call returns.

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
