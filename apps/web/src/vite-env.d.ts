/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNALING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "jsqr" {
  interface QRCode {
    data: string;
    location: unknown;
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ): QRCode | null;
}
