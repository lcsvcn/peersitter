#!/usr/bin/env bash
# Multi-device integration run: N Android phones as named Cameras, M phones
# (any mix of iOS simulators and Android emulators) as Viewers that each
# watch every camera, all through one local signaling server.
#
#   CAMERAS="emulator-5554:Nursery emulator-5556:Garage" \
#   VIEWERS="ios:<udid> ios:<udid> android:emulator-5558" \
#   ./multi-device.sh
#
# Currently the viewer flow watches exactly two cameras (the first two in
# CAMERAS); extra cameras are still brought up and verified on the camera side.
#
# Why this works without TLS: iOS simulators share the host's loopback, and
# `adb reverse` maps each Android device's localhost:8787 to the host, and
# both platforms allow ws://localhost (Android only blocks ws:// to other hosts).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
APP=dev.peersitter.app
PORT=${SIGNAL_PORT:-8787}
OUT=${OUT_DIR:-/tmp/peersitter-multi-device}
mkdir -p "$OUT"

: "${CAMERAS:?set CAMERAS=\"serial:Name ...\"}"
: "${VIEWERS:?set VIEWERS=\"ios:<udid> android:<serial> ...\"}"

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[FAIL] %s\n' "$*"; exit 1; }

# --- signaling server ---------------------------------------------------
SIGNAL_PID=""
if ! curl -fs "localhost:$PORT/healthz" >/dev/null 2>&1; then
  step "starting signaling server on :$PORT"
  (cd ../../../signaling-server && PORT=$PORT npx tsx src/index.ts >"$OUT/signal.log" 2>&1 & echo $! >"$OUT/signal.pid")
  SIGNAL_PID=$(cat "$OUT/signal.pid")
  until curl -fs "localhost:$PORT/healthz" >/dev/null 2>&1; do sleep 1; done
fi
trap '[ -n "$SIGNAL_PID" ] && pkill -P "$SIGNAL_PID" 2>/dev/null; true' EXIT

prep_android() { # serial
  adb -s "$1" shell pm clear $APP >/dev/null
  adb -s "$1" shell pm grant $APP android.permission.CAMERA
  adb -s "$1" shell pm grant $APP android.permission.RECORD_AUDIO
  adb -s "$1" reverse tcp:$PORT tcp:$PORT >/dev/null
}

# Reads the pairing-code textarea out of the Android accessibility tree.
read_code() { # serial
  adb -s "$1" exec-out uiautomator dump /dev/tty 2>/dev/null | python3 -c '
import sys
import xml.etree.ElementTree as ET
raw = sys.stdin.read()
try:
    root = ET.fromstring(raw[raw.index("<?xml"):raw.rindex("</hierarchy>") + 12])
except Exception:
    sys.exit(0)
for n in root.iter("node"):
    t = n.get("text", "")
    if t.startswith("{") and "roomId" in t:
        print(t, end="")
        break'
}

# --- cameras ------------------------------------------------------------
declare -a CAM_SERIALS CAM_NAMES CAM_CODES
for spec in $CAMERAS; do
  serial=${spec%%:*}; name=${spec#*:}
  step "camera '$name' on $serial"
  prep_android "$serial"
  maestro --device "$serial" test -e NAME="$name" multi-camera.yaml >"$OUT/camera-$name.log" 2>&1 \
    || { tail -20 "$OUT/camera-$name.log"; fail "camera flow failed on $serial"; }
  code=$(read_code "$serial")
  [ -n "$code" ] || fail "could not read pairing code from $serial"
  CAM_SERIALS+=("$serial"); CAM_NAMES+=("$name"); CAM_CODES+=("$code")
  echo "    pairing code: ${code:0:60}..."
done
[ "${#CAM_CODES[@]}" -ge 2 ] || fail "need at least two cameras"

# --- viewers (in parallel) ------------------------------------------------
step "starting viewers in parallel"
pids=(); labels=()
for spec in $VIEWERS; do
  kind=${spec%%:*}; id=${spec#*:}
  if [ "$kind" = android ]; then prep_android "$id"; fi
  maestro --device "$id" test \
    -e CODE1="${CAM_CODES[0]}" -e NAME1="${CAM_NAMES[0]}" \
    -e CODE2="${CAM_CODES[1]}" -e NAME2="${CAM_NAMES[1]}" \
    --test-output-dir "$OUT/viewer-$id" multi-viewer.yaml >"$OUT/viewer-$id.log" 2>&1 &
  pids+=($!); labels+=("$kind:$id")
done
rc=0
for i in "${!pids[@]}"; do
  if wait "${pids[$i]}"; then echo "    [ok]   viewer ${labels[$i]}"; else echo "    [FAIL] viewer ${labels[$i]}"; tail -15 "$OUT/viewer-${labels[$i]#*:}.log"; rc=1; fi
done

# --- camera-side verification ---------------------------------------------
step "camera-side check: every camera should see every viewer"
NV=$(wc -w <<<"$VIEWERS" | tr -d ' ')
for i in "${!CAM_SERIALS[@]}"; do
  seen=""
  for _ in $(seq 1 30); do
    seen=$(adb -s "${CAM_SERIALS[$i]}" exec-out uiautomator dump /dev/tty 2>/dev/null | python3 -c '
import sys, re
import xml.etree.ElementTree as ET
raw = sys.stdin.read()
try:
    nodes = [n.get("text", "") for n in ET.fromstring(raw[raw.index("<?xml"):raw.rindex("</hierarchy>") + 12]).iter("node")]
except Exception:
    nodes = []
for i, t in enumerate(nodes):
    if t.startswith("Viewers watching"):
        m = re.search(r"\d+", t) or (re.fullmatch(r"\d+", nodes[i + 1]) if i + 1 < len(nodes) else None)
        print(m.group(0) if m else "", end="")
        break')
    [ "$seen" = "$NV" ] && break; sleep 2
  done
  if [ "$seen" = "$NV" ]; then echo "    [ok]   ${CAM_NAMES[$i]} sees $seen/$NV viewers"; else echo "    [FAIL] ${CAM_NAMES[$i]} sees '${seen:-?}'/$NV viewers"; rc=1; fi
done

[ $rc -eq 0 ] && echo -e "\nMULTI-DEVICE RUN PASSED" || echo -e "\nMULTI-DEVICE RUN FAILED"
exit $rc
