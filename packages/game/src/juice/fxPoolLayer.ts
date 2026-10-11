/**
 * §6.7 GameFxLayer wired to the real primitive pool (backend A). createGame
 * used a counting stub, so `fx.burst` and juice presets with `fx` rendered
 * nothing. This layer:
 *
 * - appends one instanced pool node per kind (`a3g-fx-<kind>`, unlit-looking
 *   emissive material, `castShadow:false`, every slot zero-scaled) to the
 *   authored scene snapshot, built through the public `instances.*` builders
 *   so the nodes are in normalized snapshot form;
 * - ticks `FxPrimitivePool` once per presented frame on session-scaled dt
 *   (hit-stop / slow-mo freeze FX with the world);
 * - writes live matrices through the C-37 `setInstanceTransforms` member on
 *   the pool node's runtime handle and toggles `setVisible(count > 0)`, so
 *   idle pools cost no draws (1 draw per kind while live).
 */
import { instances, material, normalizeSceneSnapshot, scene, type AuraSceneSnapshot } from "@aura3d/engine";
import type { GameFxKind, Vec3Like } from "./Juice.js";
import { FX_PRESETS, FxPrimitivePool, fxKindCapacity, type FxNodeSink, type FxQualityTier } from "./fx.js";

export const FX_POOL_NODE_PREFIX = "a3g-fx-";
const FX_KINDS = Object.keys(FX_PRESETS) as GameFxKind[];

/** Pool node name and runtime id for a kind (`app.nodes.get(id)`). */
export const fxPoolNodeName = (kind: GameFxKind): string => `${FX_POOL_NODE_PREFIX}${kind}`;

/** Snapshot nodes for every kind's pool (all slots zero-scaled). */
export function fxPoolSnapshotNodes(tier: FxQualityTier = "high"): AuraSceneSnapshot["nodes"] {
  const cap = fxKindCapacity(tier);
  const builders = FX_KINDS.map((kind) => {
    const preset = FX_PRESETS[kind];
    const options = {
      name: fxPoolNodeName(kind),
      material: material.emissive({ name: `a3g fx ${kind}`, color: preset.color, emissive: preset.color, emissiveIntensity: 1.6 }),
      castShadow: false,
      receiveShadow: false,
      transforms: Array.from({ length: cap }, () => ({ position: [0, 0, 0] as const, scale: 0 })),
      colors: Array.from({ length: cap }, () => preset.color)
    };
    const node = preset.shape === "sphere" ? instances.sphere(options) : instances.plane(options);
    // Runtime id = name, so `app.nodes.get(name)` returns the C-37 handle.
    return node.runtime({ id: fxPoolNodeName(kind) });
  });
  return normalizeSceneSnapshot(scene().addMany(builders)).nodes;
}

/** Returns `snapshot` with the pool nodes appended (idempotent per snapshot). */
export function withFxPool(snapshot: AuraSceneSnapshot, tier: FxQualityTier = "high"): AuraSceneSnapshot {
  if (snapshot.nodes.some((n) => (n as { name?: string }).name?.startsWith(FX_POOL_NODE_PREFIX))) return snapshot;
  return { ...snapshot, nodes: [...snapshot.nodes, ...fxPoolSnapshotNodes(tier)] };
}

export interface PoolNodeHandle {
  setInstanceTransforms?: (matrices: Float32Array, count: number, colors?: Float32Array) => unknown;
  setVisible?: (visible: boolean) => unknown;
}

export interface PoolFxLayerDeps {
  /** Resolves a runtime node handle by id (`app.nodes.get`). */
  readonly node: (name: string) => PoolNodeHandle | undefined;
  readonly tier?: FxQualityTier;
  readonly seed?: number;
  readonly warn?: (message: string) => void;
}

export interface PoolFxLayer {
  burst(kind: GameFxKind, position: Vec3Like, options?: { count?: number; speed?: number; color?: string; normal?: Vec3Like; seed?: number }): void;
  trail(target: string, options: { width: number; life: number; color?: string }): { stop(): void };
  readonly liveCount: number;
  readonly backend: "primitive-pool";
  /** Advance on session-scaled dt and write the pool nodes. */
  tick(dt: number): void;
  /** Re-resolve node handles (after `setScene`) and re-hide idle pools. */
  reset(): void;
}

export function createPoolFxLayer(deps: PoolFxLayerDeps): PoolFxLayer {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const handles = new Map<GameFxKind, PoolNodeHandle | null>();
  let hidden = false;
  let trails = 0;

  const handleFor = (kind: GameFxKind): PoolNodeHandle | null => {
    if (!handles.has(kind)) {
      let h: PoolNodeHandle | null = null;
      try {
        h = deps.node(fxPoolNodeName(kind)) ?? null;
      } catch {
        h = null;
      }
      if (h && typeof h.setInstanceTransforms !== "function") {
        warn(`a3g-fx: pool node ${fxPoolNodeName(kind)} has no setInstanceTransforms (C-37); bursts of "${kind}" will not render`);
        h = null;
      }
      handles.set(kind, h);
    }
    return handles.get(kind) ?? null;
  };

  const sinks = new Map<GameFxKind, FxNodeSink>();
  const sinkFor = (kind: GameFxKind): FxNodeSink | undefined => {
    const h = handleFor(kind);
    if (!h) return undefined;
    let sink = sinks.get(kind);
    if (!sink) {
      sink = {
        setInstanceTransforms: (m, count, colors) => { h.setInstanceTransforms!(m, count, colors); },
        setVisible: (v) => { h.setVisible?.(v); }
      };
      sinks.set(kind, sink);
    }
    return sink;
  };

  const pool = new FxPrimitivePool({ tier: deps.tier ?? "high", seed: deps.seed ?? 1, sinkFor });

  const hideIdle = () => {
    for (const kind of FX_KINDS) if (pool.liveCountFor(kind) === 0) handleFor(kind)?.setVisible?.(false);
    hidden = true;
  };

  return {
    backend: "primitive-pool",
    get liveCount() {
      return pool.liveCount + trails;
    },
    burst(kind, position, options) {
      pool.burst(kind, position, options);
    },
    trail(_target, _options) {
      // Trails stay on the particle-pass backend (C-20); the pool counts them
      // so evidence liveCount is honest about requested-but-unrendered work.
      trails += 1;
      return { stop: () => { trails = Math.max(0, trails - 1); } };
    },
    tick(dt) {
      if (!hidden) hideIdle();
      pool.tick(dt);
    },
    reset() {
      handles.clear();
      sinks.clear();
      hidden = false;
    }
  };
}
