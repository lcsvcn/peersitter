/** True for URLs only this device or its own network can reach, which remote viewers can't use. */
export function isLocalOnlyUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

export type TestResult = { ok: true; ms: number } | { ok: false; error: string };

/** Opens (and immediately closes) a WebSocket to the signaling server to prove it is reachable from here. */
export function testSignaling(url: string, timeoutMs = 6000): Promise<TestResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : "Invalid URL" });
      return;
    }
    const timer = setTimeout(() => {
      ws.close();
      resolve({ ok: false, error: "No response — is the server running and the URL public?" });
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      ws.close();
      resolve({ ok: true, ms: Math.round(performance.now() - started) });
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve({ ok: false, error: "Could not connect. Use wss:// for a public server." });
    };
  });
}
