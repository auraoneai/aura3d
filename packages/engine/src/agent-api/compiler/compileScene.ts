// C-36 real implementation (PRD-15 T3.11) — `compileScene`/`updateCompiledScene`
// wrapping the moved legacy bridge functions, active under `A3D_QR_COMPILER`.
//
// The real path owns the mount-time assembly the bridge used to do inline in
// `createProductionRuntimeSceneRenderer` (typed-GLB actor entries + primitive
// entries) and runs the C-36 handler table per node kind. Existing kinds keep
// the legacy path; a lane handler registered via `registerNodeHandler` takes
// over its kind when its flag is on; a kind unknown to the C-36 catalog is a
// strict throw (`AuraRuntimeError("unknown-node-kind")`) or a recorded
// `option-ignored` degradation.
//
// `CompiledSceneImpl` carries the mount state `updateCompiledScene` needs each
// frame so the flag-off path through `renderer.ts` stays byte-identical.

import type {
  AuraSceneNode,
  AuraSceneSnapshot,
  AuraModelNode,
  AuraRuntimeNodeRegistry,
  ProductionRuntimeActorEntry,
  ProductionRuntimePrimitiveEntry
} from "../nodes/types.js";
import type {
  AnyNodeHandler,
  AuraDegradation,
  CompiledActor,
  CompiledScene,
  RenderSourceContributions,
  SceneCompileContext,
  AuraCompiledFeature,
  CompilerImpl
} from "../../contracts/compiler.js";
import { groups } from "../nodes/groups.js";
import { isRenderableModelNode } from "./observations.js";
import { createAssetProvenance } from "../diagnostics.js";
import { applyModelTintBridge } from "./modelMaterials.js";
import { createProductionRuntimePrimitiveEntries } from "./primitives.js";
import { createProductionRuntimeRendererInput } from "./renderInput.js";
import type { CollectedLight, EnvironmentLightingOptions, ProductionRendererInput, RenderItem, RenderSource } from "@aura3d/rendering";
import { isKnownNodeKind, resolveNodeHandler } from "./handlers.js";
import { AuraRuntimeError } from "./errors.js";

/** Internal context fields the mount supplies beyond the frozen C-36 shape. */
export interface MountSceneCompileContext extends SceneCompileContext {
  readonly canvas: HTMLCanvasElement;
  /** Live accessor — the HDRI upgrade swaps the lighting object per frame. */
  environmentLighting(): EnvironmentLightingOptions;
  readonly collectedLights: readonly CollectedLight[];
  readonly runtimeWarnings: Set<string>;
  /** The registry the mount was created with (t=0 source build only). */
  readonly runtimeNodes?: AuraRuntimeNodeRegistry;
}

interface ContributionState {
  readonly items: RenderItem[];
  readonly lights: CollectedLight[];
  readonly overrides: Map<string, unknown>;
  readonly features: Set<AuraCompiledFeature>;
}

function createContributions(): ContributionState {
  return { items: [], lights: [], overrides: new Map(), features: new Set() };
}

class SourceContributions implements RenderSourceContributions {
  constructor(private readonly state: ContributionState) {}
  addItems(items: readonly unknown[]): void {
    this.state.items.push(...(items as readonly RenderItem[]));
  }
  addLights(lights: readonly unknown[]): void {
    this.state.lights.push(...(lights as readonly CollectedLight[]));
  }
  set<K extends string>(field: K, value: unknown): void {
    this.state.overrides.set(field, value);
  }
  feature(f: AuraCompiledFeature): void {
    this.state.features.add(f);
  }
}

function mergeContributions(source: RenderSource, contributions: ContributionState): RenderSource {
  if (!contributions.items.length && !contributions.lights.length && !contributions.overrides.size) {
    return source;
  }
  const baseCollect = source.collectRenderItems?.bind(source);
  const baseItems = source.renderItems;
  const baseLights = source.collectedLights;
  const merged: RenderSource = {
    ...source,
    collectRenderItems(): Iterable<RenderItem> {
      const base = baseCollect ? [...baseCollect()] : baseItems ? [...baseItems] : [];
      return [...base, ...contributions.items];
    },
    collectedLights: [...(baseLights ? [...baseLights] : []), ...contributions.lights]
  };
  for (const [field, value] of contributions.overrides) {
    (merged as Record<string, unknown>)[field] = value;
  }
  return merged;
}

/** Public surface of the real impl — the bridge consumable per frame. */
export class CompiledSceneImpl implements CompiledScene {
  source: RenderSource | null;
  /** Latest frame input (source + camera) for `renderer.ts`'s render calls. */
  lastInput: ProductionRendererInput | null = null;
  private disposed = false;

  constructor(
    readonly snapshotVersion: number,
    source: RenderSource | null,
    readonly actors: readonly CompiledActor[],
    readonly features: ReadonlySet<AuraCompiledFeature>,
    readonly degradations: readonly AuraDegradation[],
    readonly actorEntries: readonly ProductionRuntimeActorEntry[],
    readonly primitiveEntries: readonly ProductionRuntimePrimitiveEntry[],
    readonly handledNodes: readonly { node: AuraSceneNode; handler: AnyNodeHandler }[],
    readonly mountCtx: MountSceneCompileContext
  ) {
    this.source = source;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const actor of this.actors) actor.dispose();
    for (const { resources } of this.primitiveEntries) {
      for (const { geometry, material, texturedMaterial, textureDisposer } of resources) {
        textureDisposer?.();
        geometry.dispose();
        material.dispose();
        texturedMaterial?.dispose();
      }
    }
    for (const { handler, node } of this.handledNodes) handler.dispose?.(node);
  }
}

export function asRuntimeCompiled(compiled: CompiledScene): CompiledSceneImpl | null {
  return compiled instanceof CompiledSceneImpl ? compiled : null;
}

async function compileSceneReal(snapshot: AuraSceneSnapshot, ctx: SceneCompileContext): Promise<CompiledScene> {
  const mount = ctx as MountSceneCompileContext;
  const canvas = mount.canvas;
  const flattened = groups.flatten(snapshot.nodes);
  const degradations: AuraDegradation[] = [];
  const recordDegrade = (d: Omit<AuraDegradation, "frame">): void => {
    const entry: AuraDegradation = { ...d, frame: 0 };
    degradations.push(entry);
    ctx.degrade(entry);
  };
  const features = new Set<AuraCompiledFeature>();

  const modelNodes = flattened.filter((node): node is AuraModelNode =>
    isRenderableModelNode(node) && createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"
  );
  /*
   * Loaded here rather than imported at module scope (WS-2.2). This function is only reached when the
   * scene contains a typed GLB, so the glTF loader is downloaded exactly when it is needed.
   */
  const actorEntries: ProductionRuntimeActorEntry[] = modelNodes.length > 0
    ? await (async () => {
        const { createTypedGLBActor } = await import("../../production-runtime/TypedGLBActor.js");
        return await Promise.all(modelNodes.map(async (node, index) => ({
          node,
          actor: await createTypedGLBActor({
            asset: node.asset,
            id: node.runtime?.id ?? node.asset.id ?? `model-${index + 1}`,
            name: node.name ?? node.asset.id ?? `model-${index + 1}`,
            width: canvas.width,
            height: canvas.height,
            ...(node.hiddenNodeNames ? { hiddenNodeNames: node.hiddenNodeNames } : {}),
            ...(node.role === "primaryWorld" ? { consolidateStaticMeshes: true } : {}),
            ...applyModelTintBridge(node)
          })
        })));
      })()
    : [];
  const primitiveEntries = createProductionRuntimePrimitiveEntries(flattened);

  const handledNodes: { node: AuraSceneNode; handler: AnyNodeHandler }[] = [];
  const contributions = createContributions();
  for (const node of flattened) {
    const kind = String((node as { kind?: string }).kind ?? "");
    if (!isKnownNodeKind(kind)) {
      if (ctx.strict) {
        throw new AuraRuntimeError(
          "unknown-node-kind",
          `Aura3D scene node kind "${kind}" is not in the C-36 catalog and has no registered handler.`
        );
      }
      recordDegrade({
        code: "option-ignored",
        nodeId: (node as { runtime?: { id?: string } }).runtime?.id ?? (node as { name?: string }).name,
        message: `scene node kind "${kind}" is unknown to the compiler; node ignored`
      });
      continue;
    }
    const handler = resolveNodeHandler(kind, ctx.flags);
    // Defaults are bridge markers (kind stays on the legacy path); only a
    // lane handler distinct from the default runs its compile/update hooks.
    if (handler && handler.owner !== "prd15") {
      handledNodes.push({ node, handler });
      await handler.compile(node, ctx, new SourceContributions(contributions));
    }
  }

  const actors: CompiledActor[] = actorEntries.map((entry) => ({
    nodeId: entry.actor.id,
    dispose: () => entry.actor.dispose()
  }));
  if (primitiveEntries.some((entry) => entry.node.instances)) features.add("instancing");
  if (actorEntries.length > 0) features.add("skinning");
  for (const f of contributions.features) features.add(f);

  const compiled = new CompiledSceneImpl(
    0,
    null,
    actors,
    features,
    degradations,
    actorEntries,
    primitiveEntries,
    handledNodes,
    mount
  );
  // Build the t=0 frame so `compiled.source` is a real RenderSource at mount.
  updateCompiledSceneReal(compiled, snapshot, mount.runtimeNodes as AuraRuntimeNodeRegistry, 0);
  return compiled;
}

function updateCompiledSceneReal(
  compiled: CompiledScene,
  snapshot: AuraSceneSnapshot,
  runtime: AuraRuntimeNodeRegistry,
  timeSeconds: number
): unknown {
  const impl = asRuntimeCompiled(compiled);
  if (!impl) return compiled.source; // flag-off compiled / foreign impl: no-op

  const ctx = impl.mountCtx;
  ctx.runtimeWarnings.clear();

  const contributions = createContributions();
  const out = new SourceContributions(contributions);
  for (const { node, handler } of impl.handledNodes) {
    const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
    handler.update?.(node, runtimeId ? runtime?.get(runtimeId) : undefined, ctx, out, timeSeconds);
  }

  const input = createProductionRuntimeRendererInput(
    snapshot,
    ctx.canvas,
    impl.actorEntries,
    impl.primitiveEntries,
    timeSeconds,
    runtime,
    ctx.runtimeWarnings,
    ctx.environmentLighting(),
    ctx.collectedLights
  );
  const mergedSource = mergeContributions(input.source, contributions);
  impl.lastInput = { ...input, source: mergedSource };
  impl.source = mergedSource;
  return mergedSource;
}

/** The real C-36 impl, provided once from `lanes/prd15.ts`. */
export const realCompilerImpl: CompilerImpl = {
  compile: compileSceneReal,
  update: updateCompiledSceneReal
};
