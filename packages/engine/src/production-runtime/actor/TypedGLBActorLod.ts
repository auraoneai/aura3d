// PRD-05 §6.3.6 / §7.3 — MSFT_lod runtime selection for TypedGLBActor.
// File: packages/engine/src/production-runtime/actor/TypedGLBActorLod.ts — owner lane 05.
//
// `onLoad` indexes each holder node's parsed lod chain (`SceneNode.userData.gltfLods`,
// written by GLTFLoader.resolveMsftLods from `extensions.MSFT_lod.ids` +
// `extras.MSFT_screencoverage`) against the pipeline's geometry/material libraries —
// level geometries are out-of-scene glTF meshes already decoded by the loader.
// `collectRenderItems` swaps the holder's geometry to the active level each frame
// (both levels while a `lodFade` window is open). Selection math lives in
// `../LodSelector.ts`; the C-27 `lodBias` multiplier lands through `setMode`
// once the Q-15-1 compile seam forwards tier settings.

import type { RenderItem } from "@aura3d/rendering";
import type { ProductionGLTFRenderPipeline } from "@aura3d/assets/gltf-runtime";
import type { SceneNode } from "@aura3d/scene";
import type { TypedGLBActor } from "../TypedGLBActor";
import { registerTypedGLBActorExtension } from "./extensions";
import { LodSelector, projectedSphereCoverage } from "../LodSelector.js";

export interface TypedGLBActorLodHandle {
  readonly levels: number;
  readonly level: number;
  /** Per-chain active levels in scene-node order (one entry per `MSFT_lod` chain). */
  chainLevels(): readonly number[];
  /** Force "fixed" mode at `level`; `fadeSeconds` emits the outgoing level for that window. */
  setLevel(level: number, fadeSeconds?: number): void;
  setMode(mode: "auto" | "fixed", options?: { readonly bias?: number; readonly crossFadeSeconds?: number }): void;
}

interface ParsedLodEntry {
  readonly nodeIndex: number;
  readonly meshIndex?: number;
  readonly screenCoverage?: number;
}

interface LodLevelEntry {
  /** base geometry object → level geometry; absent value means the primitive is dropped at this level. */
  readonly geometry: ReadonlyMap<RenderItem["geometry"], RenderItem["geometry"] | undefined>;
  /** Extra level primitives beyond the base count, cloned from the holder's first item each frame. */
  readonly overflow: readonly { readonly geometry: RenderItem["geometry"]; readonly material?: RenderItem["material"] }[];
}

interface LodChain {
  readonly holder: SceneNode;
  /** Level-0 geometry objects in primitive order (the instances the pipeline emits). */
  readonly baseGeometry: readonly RenderItem["geometry"][];
  /** Levels 1..N-1, in `lods` order. */
  readonly levels: readonly LodLevelEntry[];
  readonly selector: LodSelector;
  /** Level-0 bounding sphere in holder-local space. */
  readonly center: readonly [number, number, number];
  readonly radius: number;
}

interface ActorLodState {
  readonly chains: readonly LodChain[];
  mode: "auto" | "fixed";
  fixedLevel: number;
  bias: number;
  crossFadeSeconds: number;
  /** Outgoing level emitted during a fade window (seconds, performance.now-based). */
  fade: { outgoingLevel: number; start: number; until: number } | undefined;
  lastLevel: number;
}

const states = new WeakMap<TypedGLBActor, ActorLodState>();

const nowSeconds = (): number =>
  (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

function asLodEntries(value: unknown): readonly ParsedLodEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ParsedLodEntry =>
      typeof entry === "object" && entry !== null && Number.isInteger((entry as ParsedLodEntry).nodeIndex)
  );
}

function holderScreenCoverage(node: SceneNode, lods: readonly ParsedLodEntry[]): readonly number[] {
  const extras = node.userData.gltfExtras as Record<string, unknown> | undefined;
  const raw = extras?.MSFT_screencoverage;
  if (Array.isArray(raw) && raw.every((v) => typeof v === "number")) {
    return raw.slice(0, lods.length + 1) as number[];
  }
  // Derive defaults when the writer skipped coverage: halve per level from 0.5.
  return [0.5, ...lods.map((lod, i) => lod.screenCoverage ?? 0.5 / 2 ** (i + 1))];
}

function levelLocalSphere(
  pipeline: ProductionGLTFRenderPipeline,
  baseGeometryKeys: readonly string[]
): { readonly center: readonly [number, number, number]; readonly radius: number } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const key of baseGeometryKeys) {
    const mesh = pipeline.asset.meshes.find((entry) => entry.name === key);
    for (const [x, y, z] of mesh?.positions ?? []) {
      min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
    }
  }
  if (!Number.isFinite(min[0])) return { center: [0, 0, 0], radius: 0.001 };
  const center: readonly [number, number, number] = [
    (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2
  ];
  let radius = 0;
  for (const key of baseGeometryKeys) {
    const mesh = pipeline.asset.meshes.find((entry) => entry.name === key);
    for (const [x, y, z] of mesh?.positions ?? []) {
      radius = Math.max(radius, Math.hypot(x - center[0], y - center[1], z - center[2]));
    }
  }
  return { center, radius: Math.max(radius, 0.001) };
}

function columnScale(m: Float32Array | readonly number[]): number {
  const sx = Math.hypot(m[0] ?? 1, m[1] ?? 0, m[2] ?? 0);
  const sy = Math.hypot(m[4] ?? 0, m[5] ?? 1, m[6] ?? 0);
  const sz = Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 1);
  return Math.max(sx, sy, sz, 1e-8);
}

function buildChains(pipeline: ProductionGLTFRenderPipeline): readonly LodChain[] {
  const chains: LodChain[] = [];
  for (const { node } of pipeline.resources.scene.collectRenderables()) {
    const lods = asLodEntries(node.userData.gltfLods);
    if (lods.length === 0) continue;
    // Level-0 primitives: the holder's own renderable, plus its primitive-child
    // nodes (multi-primitive glTF meshes attach as children without gltfNodeIndex).
    const baseRenderables = [
      ...(node.renderable ? [node] : []),
      ...node.children.filter((child) => child.renderable && child.userData.gltfNodeIndex === undefined)
    ].map((n) => n.renderable!);
    const baseGeometry = baseRenderables.map((renderable) =>
      pipeline.resources.geometryLibrary.get(renderable.geometry)
    );
    if (baseGeometry.some((geometry) => !geometry)) continue;
    const levels: LodLevelEntry[] = [];
    for (const lod of lods) {
      const lodMeshes = pipeline.asset.meshes
        .filter((mesh) => mesh.sourceMeshIndex === lod.meshIndex)
        .sort((a, b) => a.primitiveIndex - b.primitiveIndex);
      if (lodMeshes.length === 0) continue;
      const geometry = new Map<RenderItem["geometry"], RenderItem["geometry"] | undefined>();
      for (const [i, base] of baseGeometry.entries()) {
        const lodGeometry = lodMeshes[i]
          ? pipeline.resources.geometryLibrary.get(lodMeshes[i].name)
          : undefined;
        geometry.set(base!, lodGeometry);
      }
      const overflow = lodMeshes.slice(baseGeometry.length).flatMap((mesh) => {
        const lodGeometry = pipeline.resources.geometryLibrary.get(mesh.name);
        const material = pipeline.resources.materialLibrary.get(mesh.material);
        return lodGeometry ? [{ geometry: lodGeometry, ...(material ? { material } : {}) }] : [];
      });
      levels.push({ geometry, overflow });
    }
    if (levels.length === 0) continue;
    const sphere = levelLocalSphere(pipeline, baseRenderables.map((renderable) => renderable.geometry));
    chains.push({
      holder: node,
      baseGeometry: baseGeometry as readonly RenderItem["geometry"][],
      levels,
      selector: new LodSelector({ screenCoverage: holderScreenCoverage(node, lods) }),
      center: sphere.center,
      radius: sphere.radius
    });
  }
  return chains;
}

/** Swap a base item's geometry to `level` (0 = base); `undefined` drops the primitive. */
function remapItem(item: RenderItem, chain: LodChain, level: number): RenderItem | undefined {
  const entry = chain.levels[level - 1];
  if (level === 0 || !entry) return item;
  const geometry = entry.geometry.get(item.geometry);
  if (!geometry) return undefined;
  return { ...item, geometry };
}

function collectChainItems(chain: LodChain, baseItems: readonly RenderItem[], level: number): RenderItem[] {
  const items = baseItems
    .map((item) => remapItem(item, chain, level))
    .filter((item): item is RenderItem => item !== undefined);
  if (level > 0) {
    const template = baseItems[0];
    for (const extra of chain.levels[level - 1]?.overflow ?? []) {
      if (template) items.push({ ...template, geometry: extra.geometry, ...(extra.material ? { material: extra.material } : {}) });
    }
  }
  return items;
}

function createHandle(actor: TypedGLBActor, state: ActorLodState): TypedGLBActorLodHandle {
  const levels = 1 + Math.max(0, ...state.chains.map((chain) => chain.levels.length));
  return {
    levels,
    get level() {
      return state.lastLevel;
    },
    chainLevels() {
      return state.chains.map((chain) => chain.selector.activeLevel);
    },
    setLevel(level, fadeSeconds) {
      if (!Number.isInteger(level) || level < 0 || level >= levels) {
        throw new RangeError(`LOD level ${level} is outside 0..${levels - 1}`);
      }
      const fade = fadeSeconds ?? state.crossFadeSeconds;
      if (fade > 0 && state.lastLevel !== level) {
        state.fade = { outgoingLevel: state.lastLevel, start: nowSeconds(), until: nowSeconds() + fade };
      }
      state.mode = "fixed";
      state.fixedLevel = level;
      state.lastLevel = level;
      for (const chain of state.chains) chain.selector.setLevel(level);
    },
    setMode(mode, options = {}) {
      if (options.bias !== undefined) state.bias = options.bias;
      if (options.crossFadeSeconds !== undefined) state.crossFadeSeconds = options.crossFadeSeconds;
      state.mode = mode;
      if (mode === "fixed") state.fixedLevel = state.lastLevel;
    }
  };
}

/** §7.3 — `undefined` when the asset carries no `MSFT_lod`. */
export function getTypedGLBActorLod(actor: TypedGLBActor): TypedGLBActorLodHandle | undefined {
  const state = states.get(actor);
  return state ? createHandle(actor, state) : undefined;
}

let registered = false;

/** §7.3 — registers the flag-gated `prd05.lod` extension (idempotent). */
export function registerTypedGLBActorLodExtension(): () => void {
  const unregister = registerTypedGLBActorExtension({
    id: "prd05.typed-glb-actor-lod",
    owner: "05",
    flag: "A3D_QR_ASSETS_LOD",
    onLoad(actor, pipeline) {
      const chains = buildChains(pipeline);
      if (chains.length === 0) return;
      states.set(actor, {
        chains,
        mode: "auto",
        fixedLevel: 0,
        bias: 1,
        crossFadeSeconds: 0,
        fade: undefined,
        lastLevel: 0
      });
    },
    collectRenderItems(actor, items): RenderItem[] {
      const state = states.get(actor);
      if (!state) return [...items];
      const byChain = new Map<LodChain, RenderItem[]>();
      const consumed = new Set<RenderItem>();
      for (const chain of state.chains) {
        const baseSet = new Set(chain.baseGeometry);
        byChain.set(chain, items.filter((item) => baseSet.has(item.geometry)));
        for (const item of byChain.get(chain)!) consumed.add(item);
      }
      const passthrough = items.filter((item) => !consumed.has(item));
      const emitted: RenderItem[] = [...passthrough];
      const now = nowSeconds();
      if (state.fade !== undefined && now >= state.fade.until) state.fade = undefined;
      const withFade = (item: RenderItem, lodFade: number): RenderItem => ({ ...item, lodFade });
      for (const chain of state.chains) {
        const baseItems = byChain.get(chain)!;
        if (baseItems.length === 0) continue;
        const previous = chain.selector.activeLevel;
        let level: number;
        if (state.mode === "fixed") {
          level = state.fixedLevel;
        } else {
          const m: Float32Array | readonly number[] | undefined = baseItems[0].modelMatrix;
          const scale = m ? columnScale(m) : 1;
          const worldCenter: readonly [number, number, number] = m
            ? [
                m[0] * chain.center[0] + m[4] * chain.center[1] + m[8] * chain.center[2] + (m[12] ?? 0),
                m[1] * chain.center[0] + m[5] * chain.center[1] + m[9] * chain.center[2] + (m[13] ?? 0),
                m[2] * chain.center[0] + m[6] * chain.center[1] + m[10] * chain.center[2] + (m[14] ?? 0)
              ]
            : chain.center;
          const coverage = projectedSphereCoverage({
            center: worldCenter,
            radius: chain.radius * scale,
            camera: actor.pipeline.camera
          });
          level = chain.selector.select(coverage * state.bias);
        }
        if (level !== previous && state.crossFadeSeconds > 0 && state.fade === undefined) {
          state.fade = { outgoingLevel: previous, start: now, until: now + state.crossFadeSeconds };
        }
        level = Math.min(level, chain.levels.length);
        state.lastLevel = level;
        const inFade = state.fade !== undefined && now < state.fade.until;
        const t = state.fade ? Math.min(1, Math.max(0, (now - state.fade.start) / Math.max(state.fade.until - state.fade.start, 1e-6))) : 0;
        const active = collectChainItems(chain, baseItems, level);
        emitted.push(...(inFade && t > 0 ? active.map((item) => withFade(item, t)) : active));
        if (inFade && state.fade!.outgoingLevel !== level) {
          // Sign convention (lod-dither.glsl.ts): outgoing = -t, exact pixel complement.
          emitted.push(...collectChainItems(chain, baseItems, state.fade!.outgoingLevel).map((item) => withFade(item, -t)));
        }
      }
      return emitted;
    },
    dispose(actor) {
      states.delete(actor);
    }
  });
  return unregister;
}

if (!registered) {
  registered = true;
  registerTypedGLBActorLodExtension();
}
