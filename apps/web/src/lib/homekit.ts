// HomeKit is only available inside the desktop (Tauri) shell, which runs the
// bridge from apps/homekit. In a plain browser/Capacitor build these are
// all no-ops.

export interface HomeKitStatus {
  running: boolean;
  starting?: boolean;
  error?: string | null;
  name?: string;
  pincode?: string;
  setupURI?: string;
  paired?: boolean;
  streaming?: boolean;
  video?: string;
  audio?: string | null;
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function invoker(): Invoke | null {
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return tauri?.core?.invoke ?? null;
}

export const homekitAvailable = () => invoker() !== null;

export async function homekitStart(): Promise<void> {
  await invoker()?.("homekit_start");
}

export async function homekitStop(): Promise<void> {
  await invoker()?.("homekit_stop");
}

export async function homekitStatus(): Promise<HomeKitStatus> {
  return (await invoker()?.<HomeKitStatus>("homekit_status")) ?? { running: false };
}

/** Mirrors PeerSitter's motion detection onto the HomeKit motion sensor. Never throws. */
export function homekitMotion(detected: boolean): void {
  void invoker()?.("homekit_motion", { detected }).catch(() => {});
}
