#!/usr/bin/env bash
# Expose your own signaling server to the internet with a free Cloudflare
# quick tunnel — no hosting account, no port forwarding. Prints the public
# wss:// address to paste into PeerSitter → Settings → Signaling server.
# Video still flows peer-to-peer; the tunnel only carries connection setup.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v cloudflared >/dev/null || { echo "Install cloudflared first: brew install cloudflared" >&2; exit 1; }

PORT="${PORT:-8787}"
LOG="$(mktemp)"
npm run build:signal --silent
PORT="$PORT" node signaling-server/dist/index.js &
SIGNAL_PID=$!
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill $SIGNAL_PID $TUNNEL_PID 2>/dev/null; rm -f "$LOG"' EXIT INT TERM

URL=""
for _ in $(seq 1 40); do
  URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 0.5
done
[ -n "$URL" ] || { echo "Tunnel did not start; see: cloudflared tunnel --url http://localhost:$PORT" >&2; exit 1; }

echo
echo "  Signaling server (public): wss://${URL#https://}"
echo "  Paste it into PeerSitter → Settings → Signaling server on the CAMERA device."
echo "  Viewers get it from the camera's QR code. Ctrl+C to stop."
echo
wait
