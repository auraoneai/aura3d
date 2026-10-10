/**
 * C-36 — SceneCompiler extension points (CONTRACTS.md). Provider: PRD 15.
 * Seam: `agent-api/compiler/` and `agent-api/nodes/` (PR 0b). Flag: A3D_QR_COMPILER,
 * sub-flag A3D_QR_STRICT.
 */

import type { PrdId, QrFlagName, QrFlags } from "@aura3d/rendering/contracts";
import { defineContractSlot, type ContractSlot } from "@aura3d/rendering/contracts";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { AuraSceneSnapshot, AuraRuntimeNodeHandle, AuraRuntimeNodeRegistry } from "../agent-api/index";
import { resolveQrFlags } from "./flags.js";

export type AuraDegradationCode = "renderer-mount-failed" | "texture-upgrade-failed" | "sdf-text-fallback" | "pose-apply-failed" | "clip-apply-failed" | "clip-resolve-timeout" | "clip-resolve-failed" | "morph-apply-failed" | "foot-planting-failed" | "extension-lobe-pending" | "capability-degraded" | "option-ignored";
export interface AuraDegradation { readonly code: AuraDegradationCode; readonly nodeId?: string; readonly message: string; readonly cause?: unknown; readonly frame: number; readonly ownerPrd?: number; }
export type AuraCompiledFeature = "lights.directional" | "lights.point" | "lights.spot" | "lights.ambient" | "lights.hemisphere" | "environment.ibl" | "environment.background" | "shadows.directional" | "shadows.csm" | "shadows.spot" | "shadows.point" | "fog" | "post.bloom" | "post.ao" | "post.ssr" | "post.dof" | "post.taa" | "post.smaa" | "post.fxaa" | "post.colorGrade" | "instancing" | "skinning" | "morph" | "text.sdf" | "particles" | "water" | "sky.dayNight" | "weather" | `${"world" | "vfx" | "look"}.${string}`;
export interface SceneCompileContext { readonly renderer: unknown /* Renderer */; readonly assets: unknown /* AuraAssetResolver */; readonly quality: unknown /* AuraQualityTierSettings */ & { readonly tier: AuraQualityTier }; readonly strict: boolean; readonly flags: QrFlags; degrade(d: Omit<AuraDegradation, "frame">): void; }
export interface CompiledActor { readonly nodeId: string; dispose(): void; }
export interface CompiledScene { readonly snapshotVersion: number; readonly source: unknown /* RenderSource */; readonly actors: readonly CompiledActor[]; readonly features: ReadonlySet<AuraCompiledFeature>; readonly degradations: readonly AuraDegradation[]; dispose(): void; }
export interface NodeHandler<N extends { readonly kind: string }> {
  readonly kind: N["kind"]; readonly owner: PrdId; readonly flag?: QrFlagName;
  compile(node: N, ctx: SceneCompileContext, out: RenderSourceContributions): void | Promise<void>;
  update?(node: N, handle: AuraRuntimeNodeHandle | undefined, ctx: SceneCompileContext, out: RenderSourceContributions, timeSeconds: number): void;
  dispose?(node: N): void;
}
export interface RenderSourceContributions { addItems(items: readonly unknown[] /* RenderItem */): void; addLights(lights: readonly unknown[] /* CollectedLight */): void; set<K extends string>(field: K, value: unknown): void; feature(f: AuraCompiledFeature): void; }
/** Node kinds: open registry via declaration merging (PR 0a declares every kind in the catalog). */
export interface AuraNodeKindMap { model: unknown; primitive: unknown; group: unknown; light: unknown; effect: unknown; interaction: unknown; label: unknown; environment: unknown;  // existing (index.ts:1474-1482)
  sky: unknown; look: unknown; probe: unknown; biome: unknown; "time-of-day": unknown; wind: unknown; terrain: unknown; water: unknown; scatter: unknown; grass: unknown; }

export interface AnyNodeHandler {
  readonly kind: string;
  readonly owner: PrdId;
  readonly flag?: QrFlagName;
  compile(node: { readonly kind: string }, ctx: SceneCompileContext, out: RenderSourceContributions): void | Promise<void>;
  update?(node: { readonly kind: string }, handle: AuraRuntimeNodeHandle | undefined, ctx: SceneCompileContext, out: RenderSourceContributions, timeSeconds: number): void;
  dispose?(node: { readonly kind: string }): void;
}

const nodeHandlers = new Map<string, AnyNodeHandler>();

export function registerNodeHandler<K extends keyof AuraNodeKindMap>(handler: NodeHandler<{ readonly kind: K & string }>): () => void {   // duplicate kind throws unless flag differs and only one is active
  const kind = String(handler.kind);
  const existing = nodeHandlers.get(kind);
  if (existing && existing.flag === handler.flag) {
    throw new Error(`NODE_HANDLER_DUPLICATE:${kind}`);
  }
  nodeHandlers.set(kind, handler as AnyNodeHandler);
  return () => {
    if (nodeHandlers.get(kind) === handler) nodeHandlers.delete(kind);
  };
}

export function nodeHandlerFor(kind: string): AnyNodeHandler | undefined {
  return nodeHandlers.get(kind);
}

export function nodeHandlersAll(): readonly AnyNodeHandler[] {
  return [...nodeHandlers.values()];
}

export const DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
  // Merged from `agent-api/compiler/diagnosticOnly.prdNN.ts`; lanes clear their
  // entries as they wire them. PR 0a seeds the known-unconsumed additions.
  "transform.rotationOrder": { reason: "C-06: composeWorldMatrix stub lowers to ZYX", ownerPrd: 1 },
  "transform.quaternion": { reason: "C-06: composeWorldMatrix stub lowers to euler", ownerPrd: 1 },
  "light.power": { reason: "C-10: lumen conversion is PRD 02's", ownerPrd: 2 },
  "material.alphaToCoverage": { reason: "C-15: MSAA alpha-to-coverage is PRD 04's", ownerPrd: 4 },
  "material.doubleSided": { reason: "C-15: double-sided pipeline variant is PRD 04's", ownerPrd: 4 },
  "material.unlit": { reason: "C-15: unlit lobe is PRD 04's", ownerPrd: 4 },
  "model.materialOverrides": { reason: "C-15: override seam is PRD 04's", ownerPrd: 4 },
  "model.variant": { reason: "C-15: variant seam is PRD 04's", ownerPrd: 4 },
  "model.lod": { reason: "C-17: LOD resolution is PRD 05's", ownerPrd: 5 },
  "model.collider": { reason: "C-17: collider resolution is PRD 05's", ownerPrd: 5 },
  "animation.fallback": { reason: "C-19: fallback semantics are PRD 06's", ownerPrd: 6 },
  "animation.layer": { reason: "C-19: layered mixer is PRD 06's", ownerPrd: 6 },
  "animation.blendMode": { reason: "C-19: blend modes are PRD 06's", ownerPrd: 6 },
  "animation.additiveReference": { reason: "C-19: additive reference is PRD 06's", ownerPrd: 6 },
  "animation.mask": { reason: "C-19: bone masks are PRD 06's", ownerPrd: 6 },
  "animation.weight": { reason: "C-19: layer weights are PRD 06's", ownerPrd: 6 },
  "animation.restPoseReset": { reason: "C-19: rest-pose reset is PRD 06's", ownerPrd: 6 }
};

export interface OptionCoverageRow { readonly builder: string; readonly field: string; readonly probeValueA: unknown; readonly probeValueB: unknown; readonly ownerPrd: number; readonly beforeOptions?: readonly string[]; }

const optionCoverage = new Map<string, OptionCoverageRow>();

export function registerOptionCoverage(rows: readonly OptionCoverageRow[]): void {
  for (const row of rows) {
    optionCoverage.set(`${row.builder}.${row.field}`, row);
  }
}

export function optionCoverageRows(): readonly OptionCoverageRow[] {
  return [...optionCoverage.values()];
}

export interface CompilerImpl {
  compile(snapshot: AuraSceneSnapshot, ctx: SceneCompileContext): Promise<CompiledScene>;
  update(compiled: CompiledScene, snapshot: AuraSceneSnapshot, runtime: AuraRuntimeNodeRegistry, timeSeconds: number): unknown;
}

const stubCompiledScene = (): CompiledScene => ({
  snapshotVersion: 0,
  source: null,
  actors: [],
  features: new Set<AuraCompiledFeature>(),
  degradations: [{ code: "capability-degraded", message: "compiler stub: no impl bound", frame: 0 }],
  dispose(): void { /* noop */ }
});

const stubCompilerImpl: CompilerImpl = {
  compile: async () => stubCompiledScene(),
  update: (compiled) => compiled.source
};

/**
 * C-36 slot (PRD-15 T3.11): `packages/engine/src/lanes/prd15.ts` calls
 * `compilerSlot.provide(real)` once; `compileScene` selects real iff
 * `ctx.flags.on("A3D_QR_COMPILER")`, else the stub. `updateCompiledScene`
 * routes to the real impl once provided — the real impl no-ops on compiled
 * scenes it did not produce, so flag-off mounts keep stub semantics.
 */
export const compilerSlot: ContractSlot<CompilerImpl> = defineContractSlot(
  "C-36", "prd15", "A3D_QR_COMPILER", stubCompilerImpl
);

let compileSceneImpl: ((snapshot: AuraSceneSnapshot, ctx: SceneCompileContext) => Promise<CompiledScene>) | null = null;

/** PR 0b seam: `agent-api/compiler/` binds the moved createProductionRuntime* path. */
export function setCompilerImpl(
  compile: (snapshot: AuraSceneSnapshot, ctx: SceneCompileContext) => Promise<CompiledScene>,
  update: (compiled: CompiledScene, snapshot: AuraSceneSnapshot, runtime: AuraRuntimeNodeRegistry, timeSeconds: number) => unknown
): void {
  compileSceneImpl = compile;
  void update; // superseded by compilerSlot; retained for export-surface parity
}

export async function compileScene(snapshot: AuraSceneSnapshot, ctx: SceneCompileContext): Promise<CompiledScene> {
  const flags = ctx?.flags ?? resolveQrFlags({});
  const impl = compilerSlot.get(flags);
  if (impl !== stubCompilerImpl) return impl.compile(snapshot, ctx);
  if (compileSceneImpl) return compileSceneImpl(snapshot, ctx);
  return stubCompilerImpl.compile(snapshot, ctx);
}

export function updateCompiledScene(compiled: CompiledScene, snapshot: AuraSceneSnapshot, runtime: AuraRuntimeNodeRegistry, timeSeconds: number): unknown /* RenderSource */ {
  if (compilerSlot.provided) {
    const impl = compilerSlot.get(resolveQrFlags({ options: "all" }));
    return impl.update(compiled, snapshot, runtime, timeSeconds);
  }
  return compiled.source;
}

/**
 * The mounted state a real C-36 compiled scene carries (agent-api/compiler/compileScene.ts).
 * Declared here so the renderer and the runtime-node registry can consume it without
 * importing the impl — importing the impl would close an agent-api import cycle.
 */
export interface RuntimeCompiledSceneInternals {
  source: unknown /* RenderSource */ | null;
  lastInput: unknown /* ProductionRendererInput */ | null;
  actorEntries: readonly unknown[];
  primitiveEntries: readonly unknown[];
  liveNodes: readonly import("../agent-api/nodes/types.js").AuraSceneNode[];
  addSubtree(node: import("../agent-api/nodes/types.js").AuraSceneNode, parentId?: string): void;
  removeSubtree(runtimeId: string): boolean;
  dispose(): void;
}

const runtimeCompiledInternals = new WeakMap<CompiledScene, RuntimeCompiledSceneInternals>();

/** Called by the real impl's constructor — self-binds its mounted internals. */
export function bindRuntimeCompiled(scene: CompiledScene, internals: RuntimeCompiledSceneInternals): void {
  runtimeCompiledInternals.set(scene, internals);
}

/** Runtime internals of a real-compiled scene, or null for stubs/foreign impls. */
export function asRuntimeCompiled(compiled: CompiledScene): RuntimeCompiledSceneInternals | null {
  return runtimeCompiledInternals.get(compiled) ?? null;
}
