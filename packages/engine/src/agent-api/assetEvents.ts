/**
 * threejs-parity ST-06 (L4, docs/workflows/threejs-parity-gaps.md §5.4/§6):
 * app-level asset progress/error callbacks.
 *
 * `createAuraApp` wires `options.onAssetProgress`/`options.onAssetError` into
 * this registry inside `region parity:L4`; loaders that run through the
 * engine (currently `texture.load` in `nodes/texture.ts`, which loads over
 * `@aura3d/assets`' `AssetManager`) emit into it. Broadcasting mirrors
 * three's `DefaultLoadingManager` — the callbacks describe loads belonging
 * to the app, and apps that register no handlers cost one Set lookup.
 */

import type { AuraAssetErrorEvent, AuraAssetProgressEvent } from "./nodes/types/runtime.js";

export interface AuraAppAssetEventHandlers {
  readonly onAssetProgress?: (event: AuraAssetProgressEvent) => void;
  readonly onAssetError?: (event: AuraAssetErrorEvent) => void;
}

const appAssetEventHandlers = new Set<AuraAppAssetEventHandlers>();

/**
 * Register app asset event handlers. Returns an unregister function; app
 * lifecycles keep handlers for the app's lifetime (the createAuraApp parity
 * region has no dispose hook), and unit tests use the return to isolate.
 */
export function registerAppAssetEventHandlers(handlers: AuraAppAssetEventHandlers): () => void {
  if (!handlers.onAssetProgress && !handlers.onAssetError) return () => {};
  appAssetEventHandlers.add(handlers);
  return () => {
    appAssetEventHandlers.delete(handlers);
  };
}

export function emitAppAssetProgress(event: AuraAssetProgressEvent): void {
  for (const handlers of appAssetEventHandlers) {
    handlers.onAssetProgress?.(event);
  }
}

export function emitAppAssetError(event: AuraAssetErrorEvent): void {
  for (const handlers of appAssetEventHandlers) {
    handlers.onAssetError?.(event);
  }
}
