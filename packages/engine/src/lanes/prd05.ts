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
import { registeredTypedGLBActors, typedGLBActorForNode } from "../production-runtime/actor/TypedGLBActorMaterials.js";
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

/**
 * PRD-05 §6.7 look-dev seam — reaches the compiled GLB actor through the
 * C-37 actor registry (`typedGLBActorForNode`, always-on bookkeeping) and
 * stamps `u_prd05DebugView`/`u_prd05TexelBand` on every material in the
 * loaded model. Pass channel `0` to clear.
 *
 * Note (Q-05-6): on the forward path the feature bit must additionally reach
 * `material.programFeatures().features` — the look-dev app does that by
 * cloning materials (`LookdevDebugMaterial`); this setter only stamps the
 * uniforms, so it activates once lane 01 wires `feature.select` into forward
 * draws (or a material declares the bit itself).
 */
export const PRD05_DEBUG_VIEW_CHANNELS = {
  texelDensity: 1,
  mipLevel: 2,
  facet: 3,
  lodLevel: 4,
  baseColor: 5,
  normal: 6,
  roughness: 7,
  metallic: 8,
  occlusion: 9,
  uvLayout: 10
} as const;

export type Prd05DebugViewName = keyof typeof PRD05_DEBUG_VIEW_CHANNELS;

/** Stamps the debug-view uniforms on an arbitrary material set (look-dev app pipeline path). */
export function applyPrd05DebugViewToMaterialLibrary(
  materials: Iterable<{ setParameter(name: string, value: unknown): unknown }>,
  channel: Prd05DebugViewName | 0,
  texelBand: readonly [number, number] = [0.5, 4]
): number {
  const value = channel === 0 ? 0 : PRD05_DEBUG_VIEW_CHANNELS[channel];
  let count = 0;
  for (const material of materials) {
    material.setParameter("u_prd05DebugView", value);
    material.setParameter("u_prd05TexelBand", [texelBand[0], texelBand[1]]);
    count += 1;
  }
  return count;
}

export function setPrd05DebugView(
  nodeIdOrName: string,
  channel: Prd05DebugViewName | 0,
  texelBand: readonly [number, number] = [0.5, 4]
): number {
  const actor = typedGLBActorForNode(nodeIdOrName)
    ?? registeredTypedGLBActors().find((a) => a.id === nodeIdOrName || a.id.includes(nodeIdOrName));
  if (!actor) return 0;
  return applyPrd05DebugViewToMaterialLibrary(actor.pipeline.resources.materialLibrary.values(), channel, texelBand);
}
