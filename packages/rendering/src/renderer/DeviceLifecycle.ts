// C-29 seam (PR 0b) — renderer-side device lifecycle delegates.
// File: packages/rendering/src/renderer/DeviceLifecycle.ts — owner lane 11.

import type { RenderDevice } from "../RenderDevice";
import type { ProgramFeatures } from "../contracts/program";
import { programCacheSlot } from "../contracts/program";
import type { QrFlags } from "../contracts/core";
import type { ResourceRegistryLike } from "../contracts/rendererFactory";
import { webgl2DeviceHost } from "../webgl2/Counters";

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

export interface DeviceRestoreRebuildOptions {
  /** C-29 registry whose `rebuild(device)` runs before restored listeners. */
  readonly registry: ResourceRegistryLike;
  /** Flags for `programCacheSlot.get` — real cache only under C-02's flag. */
  readonly flags: QrFlags;
  /** Active program feature keys for the C-02 warm-up after rebuild. */
  readonly activeProgramFeatures?: () => readonly ProgramFeatures[] | Promise<readonly ProgramFeatures[]>;
}

/**
 * PRD 11 Phase 5 (§6.9): install the restore-time rebuild on a WebGL2
 * device's `WebGL2ContextLifecycle`. The hook runs, in order:
 *   1. `invalidateGpuObjects?.()` — Q-01-1 seam; absent until lane 01 lands it.
 *   2. `registry.rebuild(device)` — eager recreation of registered resources.
 *   3. `programCache.precompile(activeProgramFeatures)` — C-02 warm-up.
 * `deviceRestoredListeners` (and therefore `app.onDeviceRestored`) fire only
 * after this resolves — `WebGL2ContextLifecycle` defers the notification.
 *
 * Returns an unsubscribe; no-ops and returns a stub on non-WebGL2 devices or
 * when the lifecycle host seam is unavailable.
 */
export function installDeviceRestoreRebuild(device: RenderDevice, options: DeviceRestoreRebuildOptions): () => void {
  const host = webgl2DeviceHost(device);
  const lifecycle = host?.lifecycle;
  if (!lifecycle) return () => {};
  return lifecycle.onRestoredHook(async () => {
    const invalidator = (host as { invalidateGpuObjects?: () => void }).invalidateGpuObjects;
    if (invalidator) {
      invalidator.call(host);
    }
    await options.registry.rebuild(device);
    const features = await options.activeProgramFeatures?.();
    if (features && features.length > 0) {
      await programCacheSlot.get(options.flags)(device).precompile(features);
    }
  });
}
