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
import { mountedRootOf } from "./mountedRoots.js";
import { ignoredOptionMessages } from "../nodes/optionDiagnostics.js";
import { isRenderableModelNode } from "./observations.js";
import { createAssetProvenance } from "../diagnostics.js";
import { applyModelTintBridge } from "./modelMaterials.js";
import { createProductionRuntimePrimitiveEntries } from "./primitives.js";
import { qrPrimitiveGeometryOptions } from "./geometry.js";
import { createProductionRuntimeRendererInput } from "./renderInput.js";
import type { CollectedLight, EnvironmentLightingOptions, ProductionRendererInput, RenderDevice, RenderItem, RenderSource } from "@aura3d/rendering";
import type { EnvironmentProbe } from "@aura3d/rendering/contracts";
import { environmentProbeFactorySlot, isEnvironmentProbeFactoryPending } from "@aura3d/rendering/contracts";
import { EnvironmentCache, defaultProbeLoader } from "../../../../rendering/src/environment/EnvironmentCache.js";
import { bindPrd02EnvironmentProbe, prd02ProbeBindIntensities, runtimeEnvironmentIntensity, scaleEnvironmentLighting } from "./environment.js";
import { resolveEnvironment, type AuraEnvironmentSourceResolution } from "../../contracts/environment.js";
import { prd02LightingOn } from "./lights.js";
import { colorToLinearRgb } from "../colorUtils.js";
import { isKnownNodeKind, resolveNodeHandler } from "./handlers.js";
import { AuraRuntimeError } from "./errors.js";
import { bindRuntimeCompiled, compilerSlot } from "../../contracts/compiler.js";
import type { RuntimeCompiledSceneInternals } from "../../contracts/compiler.js";
export { asRuntimeCompiled } from "../../contracts/compiler.js";

/** Internal context fields the mount supplies beyond the frozen C-36 shape. */
export interface MountSceneCompileContext extends SceneCompileContext {
  readonly canvas: HTMLCanvasElement;
  /**
   * Live accessor — the HDRI upgrade swaps the lighting object per frame. LIGHT-07: the live snapshot (mount nodes
   * plus runtime adds) lets the mount recompute the environment knob when its environment or light nodes change.
   */
  environmentLighting(liveSnapshot?: AuraSceneSnapshot): EnvironmentLightingOptions;
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

/** What one handled node's compile() put into the persistent contributions, so a subtree removal can take it back out. */
interface NodeCompileRecord {
  readonly items: RenderItem[];
  readonly lights: CollectedLight[];
  readonly overrides: Map<string, unknown>;
}

/** Writes through to `state` like `SourceContributions` and records what was written for `removeSubtree`. */
class RecordingContributions extends SourceContributions {
  readonly record: NodeCompileRecord = { items: [], lights: [], overrides: new Map() };
  addItems(items: readonly unknown[]): void {
    super.addItems(items);
    this.record.items.push(...(items as readonly RenderItem[]));
  }
  addLights(lights: readonly unknown[]): void {
    super.addLights(lights);
    this.record.lights.push(...(lights as readonly CollectedLight[]));
  }
  set<K extends string>(field: K, value: unknown): void {
    super.set(field, value);
    this.record.overrides.set(field, value);
  }
}

/**
 * Flattens each top-level node on its own. The concatenation equals `groups.flatten(nodes)` (flatten walks the list in order
 * with an identity parent transform), and each top-level runtime id keeps its own flattened descendants, so
 * `app.nodes.remove(id)` on a mounted group or look can find them: groups themselves vanish in the flatten.
 */
function flattenPerRoot(nodes: readonly AuraSceneNode[]): { flat: AuraSceneNode[]; byRoot: Map<string, AuraSceneNode[]> } {
  const flat: AuraSceneNode[] = [];
  const byRoot = new Map<string, AuraSceneNode[]>();
  for (const node of nodes) {
    const part = groups.flatten([node]).slice();
    flat.push(...part);
    // A node the app already flattened out of a mounted group or look carries that root's id (see mountedRoots.ts).
    const id = mountedRootOf(node) ?? ("runtime" in node ? node.runtime?.id : undefined);
    if (id) byRoot.set(id, (byRoot.get(id) ?? []).concat(part));
  }
  return { flat, byRoot };
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
  /** Mutable entry lists — C-37 add/remove grow and shrink them without remount. */
  actorEntries: ProductionRuntimeActorEntry[];
  primitiveEntries: ProductionRuntimePrimitiveEntry[];
  handledNodes: { node: AuraSceneNode; handler: AnyNodeHandler }[];
  actors: CompiledActor[];
  /** Flattened node set the per-frame update draws from (base + dynamically added). */
  liveNodes: AuraSceneNode[];
  /** Raw (pre-flatten) nodes added via the C-37 subtree path, keyed by their root runtime id. */
  dynamicRoots = new Map<string, AuraSceneNode>();
  /**
   * Flattened nodes belonging to each runtime root (for subtree dispose): dynamic roots added through `addSubtree`, and the
   * top-level mounted nodes that carry a runtime id (from `mountedFlat`).
   */
  dynamicFlat = new Map<string, AuraSceneNode[]>();
  /** What each handled node's compile() contributed to `persistentContributions` (taken back out by `removeSubtree`). */
  compileRecords = new Map<AuraSceneNode, NodeCompileRecord>();
  /** RenderItem reuse cache for A3D_QR_COMPILER frames (T3.12): `${runtimeId}:${itemIndex}` → {version, item}. */
  itemCache = new Map<string, { version: number; item: RenderItem }>();
  /** Source contributions made by dynamically added subtree handlers. */
  persistentContributions = createContributions();
  /** T0-24: one shared C-09 environment cache per mounted app. */
  environmentCache: EnvironmentCache | null = null;
  /** Currently bound probe — the neutral floor until an async request lands. */
  environmentProbe: EnvironmentProbe | null = null;
  /** Fingerprint of the `resolution.probe` request the live binding was made for. */
  environmentProbeRequest: string | undefined;
  /**
   * #1142: state of the async C-09 probe acquire. Flag-on (compiler +
   * lighting) the probe owns IBL, so readiness must wait for it like the
   * legacy HDR chain; `undefined` = no probe binding (legacy path owns IBL).
   */
  environmentProbeStatus: "pending" | "ready" | "fallback" | undefined;
  private disposed = false;
  private readonly rawSceneNodes: readonly AuraSceneNode[];

  constructor(
    readonly snapshotVersion: number,
    source: RenderSource | null,
    actors: CompiledActor[],
    readonly features: ReadonlySet<AuraCompiledFeature>,
    readonly degradations: readonly AuraDegradation[],
    actorEntries: ProductionRuntimeActorEntry[],
    primitiveEntries: ProductionRuntimePrimitiveEntry[],
    handledNodes: { node: AuraSceneNode; handler: AnyNodeHandler }[],
    readonly mountCtx: MountSceneCompileContext,
    sceneNodes: readonly AuraSceneNode[],
    flatNodes: AuraSceneNode[],
    mountedFlat?: ReadonlyMap<string, AuraSceneNode[]>
  ) {
    this.source = source;
    this.actors = actors;
    this.actorEntries = actorEntries;
    this.primitiveEntries = primitiveEntries;
    this.handledNodes = handledNodes;
    this.rawSceneNodes = sceneNodes;
    this.liveNodes = flatNodes;
    if (mountedFlat) for (const [id, nodes] of mountedFlat) this.dynamicFlat.set(id, nodes.slice());
    bindRuntimeCompiled(this as unknown as import("../../contracts/compiler.js").CompiledScene, this as unknown as RuntimeCompiledSceneInternals);
  }

  /**
   * C-37 subtree compile (no remount): flatten the incoming node, run the same
   * per-node pipeline mount used (entries, actors, handlers), and merge into the
   * live entry lists. Model actors resolve asynchronously and join when loaded.
   */
  addSubtree(node: AuraSceneNode, parentId?: string): void {
    const parent = parentId ? findNodeByRuntimeId(this.rawSceneNodes, parentId) ?? findDynamicRoot(this.dynamicRoots, parentId) : undefined;
    const effective = parent && parent.kind === "group"
      ? ({ ...parent, children: [node] } as AuraSceneNode)
      : node;
    const flatNodes = groups.flatten([effective]).slice();
    this.dynamicRoots.set(runtimeIdOf(node), node);
    this.dynamicFlat.set(runtimeIdOf(node), flatNodes);
    // A node added under a live root goes with that root when the root is removed.
    const parentFlat = parentId && parent ? this.dynamicFlat.get(parentId) : undefined;
    if (parentFlat && parentId !== runtimeIdOf(node)) parentFlat.push(...flatNodes);
    this.liveNodes = this.liveNodes.concat(flatNodes);

    const contributions = this.persistentContributions;
    const ctx = this.mountCtx;
    const extraPrimitive = createProductionRuntimePrimitiveEntries(flatNodes, qrPrimitiveGeometryOptions(ctx.flags, ctx.quality, ctx));
    this.primitiveEntries.push(...extraPrimitive);

    const newModelNodes = flatNodes.filter((candidate): candidate is AuraModelNode =>
      isRenderableModelNode(candidate) && createAssetProvenance(candidate.asset).source === "typed-aura-assets-manifest"
    );
    for (const [index, modelNode] of newModelNodes.entries()) {
      void (async () => {
        const { createTypedGLBActor } = await import("../../production-runtime/TypedGLBActor.js");
        const { typedGLBActorDecoderOptions } = await import("../AssetDecoders.js"); // Q-15-1 (#461)
        const actor = await createTypedGLBActor({
          asset: modelNode.asset,
          id: modelNode.runtime?.id ?? modelNode.asset.id ?? `added-model-${index + 1}`,
          name: modelNode.name ?? modelNode.asset.id ?? `added-model-${index + 1}`,
          width: ctx.canvas.width,
          height: ctx.canvas.height,
          ...(modelNode.hiddenNodeNames ? { hiddenNodeNames: modelNode.hiddenNodeNames } : {}),
          ...(modelNode.role === "primaryWorld" ? { consolidateStaticMeshes: true } : {}),
          ...typedGLBActorDecoderOptions(ctx.flags, undefined),
          ...applyModelTintBridge(modelNode)
        });
        if (this.disposed || !runtimeIdStillLive(this, runtimeIdOf(modelNode))) {
          actor.dispose();
          return;
        }
        this.actorEntries.push({ node: modelNode, actor });
        this.actors.push({ nodeId: actor.id, dispose: () => actor.dispose() });
      })();
    }

    for (const flatNode of flatNodes) {
      const kind = String((flatNode as { kind?: string }).kind ?? "");
      if (!isKnownNodeKind(kind)) {
        if (ctx.strict) {
          throw new AuraRuntimeError("unknown-node-kind", `Aura3D scene node kind "${kind}" is not in the C-36 catalog and has no registered handler.`);
        }
        ctx.degrade({ code: "option-ignored", nodeId: runtimeIdOf(flatNode), message: `scene node kind "${kind}" is unknown to the compiler; node ignored` });
        continue;
      }
      const handler = resolveNodeHandler(kind, ctx.flags);
      // Bridge defaults (owner "prd15", no flag) keep the legacy path. A
      // resolved lane handler always runs; a flagged default is the
      // parityPending sentinel whose compile throws `parity-not-implemented`.
      if (handler && (handler.owner !== "prd15" || handler.flag !== undefined)) {
        this.handledNodes.push({ node: flatNode, handler });
        const out = new RecordingContributions(contributions);
        this.compileRecords.set(flatNode, out.record);
        void handler.compile(flatNode, ctx, out);
      }
    }
    this.itemCache.clear();
  }

  /** C-37 subtree dispose (no remount). */
  removeSubtree(runtimeId: string): boolean {
    const flatForRoot = this.dynamicFlat.get(runtimeId);
    const targets: AuraSceneNode[] = flatForRoot ?? this.liveNodes.filter((n) => runtimeIdOf(n) === runtimeId);
    if (targets.length === 0) return false;
    const targetSet = new Set(targets);
    this.dynamicRoots.delete(runtimeId);
    this.dynamicFlat.delete(runtimeId);
    this.liveNodes = this.liveNodes.filter((n) => !targetSet.has(n));
    const keepPrimitive: ProductionRuntimePrimitiveEntry[] = [];
    for (const entry of this.primitiveEntries) {
      if (targetSet.has(entry.node)) {
        for (const { geometry, shadowGeometry, material, texturedMaterial, textureDisposer } of entry.resources) {
          textureDisposer?.();
          geometry.dispose();
          shadowGeometry?.dispose();
          material.dispose();
          texturedMaterial?.dispose();
        }
      } else keepPrimitive.push(entry);
    }
    this.primitiveEntries = keepPrimitive;
    const keepActors: ProductionRuntimeActorEntry[] = [];
    for (const entry of this.actorEntries) {
      if (targetSet.has(entry.node)) entry.actor.dispose();
      else keepActors.push(entry);
    }
    this.actorEntries = keepActors;
    this.actors = this.actors.filter((a) => keepActors.some((e) => e.actor.id === a.nodeId));
    this.handledNodes = this.handledNodes.filter(({ node, handler }) => {
      if (!targetSet.has(node)) return true;
      handler.dispose?.(node);
      return false;
    });
    this.dropCompileContributions(targets);
    this.itemCache.clear();
    return true;
  }

  /** Takes the removed nodes' compile-time items, lights and source overrides back out of the persistent contributions. */
  private dropCompileContributions(targets: readonly AuraSceneNode[]): void {
    const items = new Set<RenderItem>();
    const lights = new Set<CollectedLight>();
    const persistent = this.persistentContributions;
    for (const node of targets) {
      const record = this.compileRecords.get(node);
      if (!record) continue;
      this.compileRecords.delete(node);
      for (const item of record.items) items.add(item);
      for (const light of record.lights) lights.add(light);
      // An override goes only while it still holds this node's value; a later node that set the same field keeps its value.
      for (const [field, value] of record.overrides) {
        if (persistent.overrides.get(field) === value) persistent.overrides.delete(field);
      }
    }
    if (items.size > 0) {
      const keep = persistent.items.filter((item) => !items.has(item));
      persistent.items.length = 0;
      persistent.items.push(...keep);
    }
    if (lights.size > 0) {
      const keep = persistent.lights.filter((light) => !lights.has(light));
      persistent.lights.length = 0;
      persistent.lights.push(...keep);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.environmentCache?.dispose();
    this.environmentCache = null;
    this.environmentProbe = null;
    for (const actor of this.actors) actor.dispose();
    for (const { resources } of this.primitiveEntries) {
      for (const { geometry, shadowGeometry, material, texturedMaterial, textureDisposer } of resources) {
        textureDisposer?.();
        geometry.dispose();
        shadowGeometry?.dispose();
        material.dispose();
        texturedMaterial?.dispose();
      }
    }
    for (const { handler, node } of this.handledNodes) handler.dispose?.(node);
  }
}

const runtimeIdOf = (node: AuraSceneNode): string =>
  ("runtime" in node ? node.runtime?.id : undefined) ?? (node as { name?: string }).name ?? "";

const findNodeByRuntimeId = (nodes: readonly AuraSceneNode[], runtimeId: string): AuraSceneNode | undefined => {
  for (const node of nodes) {
    if (("runtime" in node ? node.runtime?.id : undefined) === runtimeId) return node;
    if (node.kind === "group") {
      const inner = findNodeByRuntimeId(node.children, runtimeId);
      if (inner) return inner;
    }
  }
  return undefined;
};

const findDynamicRoot = (roots: Map<string, AuraSceneNode>, runtimeId: string): AuraSceneNode | undefined =>
  roots.get(runtimeId) ?? [...roots.values()].map((n) => findNodeByRuntimeId([n], runtimeId)).find(Boolean);

const runtimeIdStillLive = (impl: CompiledSceneImpl, runtimeId: string): boolean =>
  impl.liveNodes.some((n) => runtimeIdOf(n) === runtimeId);



async function compileSceneReal(snapshot: AuraSceneSnapshot, ctx: SceneCompileContext): Promise<CompiledScene> {
  const mount = ctx as MountSceneCompileContext;
  const canvas = mount.canvas;
  const { flat: flattened, byRoot: mountedFlat } = flattenPerRoot(snapshot.nodes);
  const compileRecords = new Map<AuraSceneNode, NodeCompileRecord>();
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
        const { typedGLBActorDecoderOptions } = await import("../AssetDecoders.js"); // Q-15-1 (#461)
        const decoderOptions = typedGLBActorDecoderOptions(ctx.flags, undefined);
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
            ...decoderOptions,
            ...applyModelTintBridge(node)
          })
        })));
      })()
    : [];
  const primitiveEntries = createProductionRuntimePrimitiveEntries(flattened, qrPrimitiveGeometryOptions(ctx.flags, ctx.quality, ctx));

  const handledNodes: { node: AuraSceneNode; handler: AnyNodeHandler }[] = [];
  const contributions = createContributions();
  // Beat-three.js WP-S.1: options a builder was given but does not read. Non-throwing (strict mode throws via degrade).
  for (const { node, message } of ignoredOptionMessages(flattened)) {
    recordDegrade({ code: "option-ignored", nodeId: runtimeIdOf(node), message });
  }
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
        nodeId: runtimeIdOf(node),
        message: `scene node kind "${kind}" is unknown to the compiler; node ignored`
      });
      continue;
    }
    const handler = resolveNodeHandler(kind, ctx.flags);
    // Defaults are bridge markers (kind stays on the legacy path); only a
    // lane handler distinct from the default runs its compile/update hooks.
    // A flagged default is the parityPending sentinel — it is not a bridge,
    // and its compile must run so flag-off fails closed (parity-not-implemented).
    if (handler && (handler.owner !== "prd15" || handler.flag !== undefined)) {
      handledNodes.push({ node, handler });
      const out = new RecordingContributions(contributions);
      compileRecords.set(node, out.record);
      await handler.compile(node, ctx, out);
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
    mount,
    snapshot.nodes,
    flattened.slice(),
    mountedFlat
  );
  for (const [node, record] of compileRecords) compiled.compileRecords.set(node, record);
  // C36-DROP: contributions made by handlers' compile() (addItems/addLights/
  // set — e.g. prd02 lights/environment/probe, prd10 world) were dropped before
  // the t=0 frame. They are persistent for the scene's life: merge them into
  // the same bucket the dynamic-subtree path extends.
  compiled.persistentContributions.items.push(...contributions.items);
  compiled.persistentContributions.lights.push(...contributions.lights);
  for (const [field, value] of contributions.overrides) compiled.persistentContributions.overrides.set(field, value);
  for (const feature of contributions.features) compiled.persistentContributions.features.add(feature);
  // Build the t=0 frame so `compiled.source` is a real RenderSource at mount.
  updateCompiledSceneReal(compiled, snapshot, mount.runtimeNodes as AuraRuntimeNodeRegistry, 0);
  return compiled;
}

/** Typed impl cast for this module and tests (external callers use `asRuntimeCompiled`). */
export const asRuntimeImpl = (compiled: CompiledScene): CompiledSceneImpl | null =>
  compiled instanceof CompiledSceneImpl ? compiled : null;

function updateCompiledSceneReal(
  compiled: CompiledScene,
  snapshot: AuraSceneSnapshot,
  runtime: AuraRuntimeNodeRegistry,
  timeSeconds: number
): unknown {
  const impl = asRuntimeImpl(compiled);
  if (!impl) return compiled.source; // flag-off compiled / foreign impl: no-op

  const ctx = impl.mountCtx;
  ctx.runtimeWarnings.clear();

  const contributions = createContributions();
  const out = new SourceContributions(contributions);
  for (const { node, handler } of impl.handledNodes) {
    const runtimeId = (node as { runtime?: { id?: string } }).runtime?.id;
    handler.update?.(node, runtimeId ? runtime?.get(runtimeId) : undefined, ctx, out, timeSeconds);
  }

  const liveSnapshot = impl.liveNodes === undefined ? snapshot : { ...snapshot, nodes: impl.liveNodes };
  // app.lighting.setEnvironmentIntensity: a live scale on the environment term (legacy map path here, probe bind below).
  const environmentScale = runtimeEnvironmentIntensity(runtime);
  const knobLightingBase = ctx.environmentLighting(liveSnapshot);
  const knobLightingScaled = scaleEnvironmentLighting(knobLightingBase, environmentScale);
  const input = createProductionRuntimeRendererInput(
    liveSnapshot,
    ctx.canvas,
    impl.actorEntries,
    impl.primitiveEntries,
    timeSeconds,
    runtime,
    ctx.runtimeWarnings,
    knobLightingScaled,
    ctx.collectedLights,
    // T4.1: the mounted ctx's C-36 degrade handler owns pose/foot/morph
    // failures on the flag-on path (strict throws; non-strict warns once).
    (d) => ctx.degrade(d)
  );
  const reusedSource = reuseRenderItems(impl, input.source, runtime);
  const mergedSource = mergeContributions(mergeContributions(reusedSource, impl.persistentContributions), contributions);
  // T0-24: bind the C-09 environment probe (one shared cache per app). The
  // resolution runs every update so an authored environments.* node flips the
  // binding live; an hdri/preset request keeps the neutral floor until the
  // async acquire lands and `onUpgrade` swaps it.
  if (prd02LightingOn(ctx.flags)) {
    const device = (ctx.renderer as { readonly device?: RenderDevice } | undefined)?.device;
    if (device) {
      const tier = ctx.quality.tier;
      const resolution = resolveEnvironment(liveSnapshot, tier, ctx.flags);
      if (resolution.kind !== "legacy") {
        // The loader resolves the C-09 factory per load (getter), so a
        // provider registered after this cache exists is still used.
        impl.environmentCache ??= new EnvironmentCache(
          device,
          environmentProbeFactorySlot.get(ctx.flags)(device),
          defaultProbeLoader(() => environmentProbeFactorySlot.get(ctx.flags)(device))
        );
        const requestKey = JSON.stringify(resolution.probe);
        // `pending:<key>` = the last bind hit the C-09 stub; rebind once the
        // provider is real (no per-frame retry while it stays pending).
        const awaitingProvider = impl.environmentProbeRequest === `pending:${requestKey}`
          && isEnvironmentProbeFactoryPending(environmentProbeFactorySlot.get(ctx.flags)(device));
        if (impl.environmentProbeRequest !== requestKey && !awaitingProvider) {
          impl.environmentProbeRequest = requestKey;
          const binding = bindPrd02EnvironmentProbe(resolution, {
            device,
            tier,
            flags: ctx.flags,
            cache: impl.environmentCache,
            onUpgrade: (probe) => { impl.environmentProbe = probe; },
            // Probe still pending: keep the floor and bind again next update.
            onUpgradeFailed: (_error, retryable) => {
              if (retryable && impl.environmentProbeRequest === requestKey) impl.environmentProbeRequest = `pending:${requestKey}`;
            }
          });
          impl.environmentProbe = binding.probe;
          if (binding.pending) {
            impl.environmentProbeStatus = "pending";
            const key = requestKey;
            binding.pending.then(
              () => { if (impl.environmentProbeRequest === key) impl.environmentProbeStatus = "ready"; },
              () => { if (impl.environmentProbeRequest === key) impl.environmentProbeStatus = "fallback"; }
            );
          } else {
            impl.environmentProbeStatus = "ready";
          }
        }
        const probed = mergedSource as RenderSource & {
          environmentLighting?: EnvironmentLightingOptions | false;
          environmentProbe?: EnvironmentProbe | null;
          environmentProbeDiffuseIntensity?: number;
          environmentProbeSpecularIntensity?: number;
          environmentProbeAmbient?: { readonly color: readonly [number, number, number]; readonly intensity: number } | null;
          environmentProbeHemisphere?: AuraEnvironmentSourceResolution["hemisphere"];
          environmentProbeBackground?: boolean;
        };
        // E3 stage-2b (step 3): capture the stage-2a knob object BEFORE it
        // is discarded below — under the conjunction it, not the resolution,
        // is the single IBL intensity source the probe bind carries (see
        // prd02ProbeBindIntensities). This block already runs only under
        // prd02LightingOn, so COMPILER completes the conjunction.
        // The knob is read unscaled; the runtime environment scale multiplies the bound intensities once, below.
        const knobLighting = probed.environmentLighting === knobLightingScaled ? knobLightingBase : probed.environmentLighting;
        // Flag-on the C-09 probe owns environment lighting — the legacy studio
        // procedural object would early-return `collectEnvironmentLighting`.
        probed.environmentLighting = undefined;
        probed.environmentProbe = impl.environmentProbe;
        // The resolution decides whether the probe is also the background: the
        // neutral-room floor (`background: false`) lights the scene but must not
        // paint a grey room over the authored `scene().background(colour)`.
        probed.environmentProbeBackground = resolution.background !== false && resolution.background.visible;
        const probeIntensities = prd02ProbeBindIntensities(knobLighting, resolution, ctx.flags.on("A3D_QR_COMPILER"));
        probed.environmentProbeDiffuseIntensity = probeIntensities.diffuseIntensity * environmentScale;
        probed.environmentProbeSpecularIntensity = probeIntensities.specularIntensity * environmentScale;
        probed.environmentProbeAmbient = resolution.ambient
          ? { color: colorToLinearRgb(resolution.ambient.color), intensity: resolution.ambient.intensity }
          : null;
        // LIGHT-05/08: authored hemisphere lights reach the PRD-02 IBL chunk as its directional sky/ground pair.
        probed.environmentProbeHemisphere = resolution.hemisphere ?? null;
      }
    }
  }
  impl.lastInput = { ...input, source: mergedSource };
  impl.source = mergedSource;
  return mergedSource;
}

/**
 * T3.12 RenderItem reuse: an item produced from an entry whose node version (and
 * ancestor versions — group transforms are baked at flatten/compile time) has not
 * changed keeps its object identity, so unchanged nodes cost no re-allocation.
 */
function reuseRenderItems(
  impl: Pick<CompiledSceneImpl, "primitiveEntries" | "actorEntries" | "itemCache">,
  source: RenderSource,
  runtime: AuraRuntimeNodeRegistry
): RenderSource {
  const collect = source.collectRenderItems ?? (() => source.renderItems ?? []);
  const items = [...collect()];
  const nextCache = new Map<string, { version: number; item: RenderItem }>();
  const nodeForItem = (item: RenderItem): AuraSceneNode | undefined => {
    const label = item.label ?? "";
    const primitive = /^primitive-(\d+):/.exec(label);
    if (primitive) return impl.primitiveEntries[Number(primitive[1])]?.node;
    const actor = /^actor-(\d+):/.exec(label);
    if (actor) return impl.actorEntries[Number(actor[1])]?.node;
    return undefined;
  };
  // T0-19: a node can emit several items — key on `${runtimeId}:${itemIndex}`
  // (the per-node emission order) so multi-item nodes don't collide on
  // `runtimeId` alone. Volatile nodes (animation/skin/morph/clips) are never
  // reused: their item content changes without a version bump.
  const perNodeIndex = new Map<string, number>();
  const isVolatile = (node: AuraSceneNode): boolean => {
    const n = node as { animation?: unknown; skin?: unknown; morph?: unknown; clips?: unknown; skeleton?: unknown };
    return n.animation !== undefined || n.skin !== undefined || n.morph !== undefined || n.clips !== undefined || n.skeleton !== undefined;
  };
  const reused = items.map((item) => {
    const node = nodeForItem(item);
    const runtimeId = node ? runtimeIdOf(node) : "";
    const handle = runtimeId ? runtime?.get(runtimeId) : undefined;
    // #1142: volatility is also an item property. A skinned/morphed GLB with
    // no authored animation (08-skinned-character, bind pose) still carries a
    // per-frame skin palette / morph state, so its item is never reused.
    if (!handle || (node && isVolatile(node)) || isVolatileItem(item)) return item;
    const index = perNodeIndex.get(runtimeId) ?? 0;
    perNodeIndex.set(runtimeId, index + 1);
    const key = `${runtimeId}:${index}`;
    const version = handle.version ?? 0;
    const cached = impl.itemCache.get(key);
    // #1142: async upgrades (GLB/primitive texture upload, HDRI) rebuild an
    // item's material or geometry without bumping the node version. Reuse
    // only while the fresh item still points at the same resources; else the
    // first-frame (untextured) item would be presented forever.
    if (cached && cached.version === version && sameItemResources(cached.item, item)) {
      nextCache.set(key, cached);
      return cached.item;
    }
    nextCache.set(key, { version, item });
    return item;
  });
  impl.itemCache = nextCache;
  return { ...source, collectRenderItems: () => reused };
}

/** Items whose content changes every frame without a node version bump. */
function isVolatileItem(item: RenderItem): boolean {
  return item.skinning !== undefined || (item.morphTargets?.length ?? 0) > 0 || (item.morphWeights?.length ?? 0) > 0;
}

/** Same geometry and material objects → the cached item is still current. */
function sameItemResources(cached: RenderItem, fresh: RenderItem): boolean {
  return (
    cached.geometry === fresh.geometry &&
    cached.material === fresh.material &&
    cached.instanceTransforms === fresh.instanceTransforms &&
    cached.instanceColors === fresh.instanceColors
  );
}

/** @internal test seam for the T3.12 reuse rules (#1142). */
export const reuseRenderItemsForTest = reuseRenderItems;

/** The real C-36 impl, provided once from `lanes/prd15.ts` (and self-registered here for agent-api builds). */
export const realCompilerImpl: CompilerImpl = {
  compile: compileSceneReal,
  update: updateCompiledSceneReal
};
if (!compilerSlot.provided) {
  compilerSlot.provide(realCompilerImpl);
}
