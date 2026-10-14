# Watching from outside your home

Video always goes **peer-to-peer and end-to-end encrypted**. Remote access
needs two small things so the two devices can find each other and connect
across different networks:

1. **A signaling server reachable from the internet** — a public `wss://`
   address. It only introduces the devices (it never sees video). The Viewer
   learns the address from the Camera's QR code, so **only the Camera device
   needs it configured**.
2. **A TURN relay (recommended)** — a fallback for networks where a direct
   connection is impossible (mobile data/CGNAT, strict firewalls). It
   forwards video that is *already encrypted*; it cannot see it.

The default `ws://localhost:8787` only works on one machine.

## 1. Public signaling server — pick one

### A. Your own Mac, zero hosting (free)

```sh
brew install cloudflared
npm run remote
```

Prints `wss://<random>.trycloudflare.com`. Paste it into **Settings →
Signaling server** on the Camera, then press *Test connection*. The address
changes each run, and your Mac must stay on while the camera runs. For a
permanent address use a [named Cloudflare tunnel](https://developers.cloudflare.com/cloudflare-tunnel/)
with your own domain.

### B. Always-on server (Fly.io, ~free tier)

```sh
cd signaling-server
# edit app name in fly.toml, then:
fly launch --copy-config --no-deploy && fly deploy
```

Your address is `wss://<app>.fly.dev`. Any host that runs the included
`Dockerfile` works (Railway, Render, a VPS behind Caddy/nginx for TLS, …).
The web app and Android require `wss://` (not `ws://`) for anything that
isn't localhost.

### C. Tailscale (no public server, no TURN)

Install Tailscale on both devices and use the Camera's tailnet address
(browsers and Android need HTTPS/`wss://`, e.g. via `tailscale serve`; not tested here). Devices on one tailnet can
connect directly, so no relay is needed.

## 2. TURN relay

Run [coturn](https://github.com/coturn/coturn) on any small VPS, or use a
managed free tier (Metered, Cloudflare Calls). Then on **every device**, add
one line under **Settings → Relay (TURN) servers**:

```
turns:turn.example.org:443?transport=tcp, username, password
```

Prefer `turns:` on port 443 — it passes nearly every firewall. Google's public STUN server is always
included, so direct connections are still tried first and the relay is only
used when needed.

## Checklist

- [ ] Camera: Settings → Signaling server = public `wss://…` → **Test connection** ✓
- [ ] Camera and Viewer: same TURN line (if you use one)
- [ ] Viewer (anywhere): *Be a Viewer* → scan the Camera's QR code
