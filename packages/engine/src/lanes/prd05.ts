/**
 * Lane prd05 barrel — owned by lane 05 (CONTRACTS.md §3.8).
 *
 * C-16 §7.3 wiring surface: the app-scoped decoder registry factory and the
 * per-model `prepareModelDecoders` seam. `attachAppAssetDecoders`/`getAppAssetDecoders`
 * give the Q-15-1 compiler request a per-app registry slot without touching
 * `createAuraApp` itself (owner-15 file) — lane tests and the eventual wiring
 * both go through these.
 */
import type { AssetDecoderRegistry } from "@aura3d/assets/browser";
import "../agent-api/compiler/diagnosticOnly.prd05.js";

export {
  createAppAssetDecoders,
  prepareModelDecoders,
  sniffGLBRequiredDecoders,
  WEBGPU_COMPRESSED_CAPS,
  AssetDecoderUnavailable,
  type AppAssetDecoders
} from "../agent-api/AssetDecoders.js";

const appAssetDecoders = new WeakMap<object, AssetDecoderRegistry>();

/** Associates a decoder registry with an app instance (Q-15-1 exposure slot). */
export function attachAppAssetDecoders(app: object, registry: AssetDecoderRegistry): void {
  appAssetDecoders.set(app, registry);
}

/** The per-app registry created by `createAppAssetDecoders`, or `undefined`. */
export function getAppAssetDecoders(app: object): AssetDecoderRegistry | undefined {
  return appAssetDecoders.get(app);
}
