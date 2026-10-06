// C-29 seam (PR 0b) — renderer-side device lifecycle delegates.
// File: packages/rendering/src/renderer/DeviceLifecycle.ts — owner lane 11.

import type { RenderDevice } from "../RenderDevice";

type DeviceLifecycle = RenderDevice & {
  readonly onDeviceLost?: (listener: () => void) => () => void;
  readonly onDeviceRestored?: (listener: () => void) => () => void;
  readonly isDeviceLost?: () => boolean;
};

export function subscribeRendererDeviceLost(device: RenderDevice, listener: () => void): () => void {
  return (device as DeviceLifecycle).onDeviceLost?.(listener) ?? (() => {});
}

export function subscribeRendererDeviceRestored(device: RenderDevice, listener: () => void): () => void {
  return (device as DeviceLifecycle).onDeviceRestored?.(listener) ?? (() => {});
}

export function rendererDeviceIsLost(device: RenderDevice): boolean {
  return (device as DeviceLifecycle).isDeviceLost?.() ?? false;
}
