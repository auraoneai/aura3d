/**
 * Structural mirrors of the `@aura3d/navigation-recast` value-object shapes,
 * kept LOCAL (never imported) so the packed engine carries no hard link —
 * type-level or runtime — to the optional peer. The peer stays resolvable
 * through the bare specifier in `loadNavigationPeer` below (dynamic import,
 * fail-closed when absent) and through workspace aliases in source builds.
 * If the peer shapes change, update these mirrors to match; assignability
 * with the real peer holds structurally (loader returns are covariant).
 */
type NavigationVec3 = readonly [number, number, number];
interface NavigationTriangleSoup {
  readonly positions: readonly number[] | Float32Array;
  readonly indices: readonly number[] | Uint32Array;
}
interface NavigationPathResult {
  readonly success: boolean;
  readonly points: readonly NavigationVec3[];
  readonly error?: string;
}
interface NavigationCrowdAgentOptions {
  readonly radius?: number;
  readonly height?: number;
  readonly maxAcceleration?: number;
  readonly maxSpeed?: number;
  readonly collisionQueryRange?: number;
  readonly pathOptimizationRange?: number;
  readonly separationWeight?: number;
}
interface RecastCrowdAgentState {
  readonly position: NavigationVec3;
  readonly velocity: NavigationVec3;
  readonly speed: number;
}
interface RecastNavigationOptions {
  readonly moduleLoader?: () => Promise<unknown>;
  readonly generatorLoader?: () => Promise<unknown>;
}

/**
 * Root navigation + crowds builders (muse3jsparity-PRD O1).
 *
 * Recast stays an OPTIONAL peer: this module never statically imports
 * `@aura3d/navigation-recast` (the optional-boundary test forbids it from
 * engine manifests, and a static value import would hard-require the peer for
 * every route). The peer loads through an injected loader — tests inject
 * fakes, routes rely on the default dynamic import — and every failure keeps
 * the package's fail-closed "optional peer unavailable + install step" error.
 * Nothing here falls back to a silent no-op navigator.
 */

/**
 * Minimal structural peer surface: the real `createRecastNavigation` return
 * satisfies this (extra methods allowed); fakes implement only what the root
 * builders call. This keeps unit tests hermetic without importing the
 * optional package.
 */
export interface AuraNavigationPeer {
  createRecastNavigation(options?: RecastNavigationOptions): Promise<{
    generateSolo(
      input: NavigationTriangleSoup,
      config: Record<string, number | string | boolean>
    ): {
      computePath(from: NavigationVec3, to: NavigationVec3): NavigationPathResult;
      dispose(): void;
      createCrowd(maxAgents: number, maxAgentRadius: number): {
        readonly maxAgents: number;
        count(): number;
        addAgent(
          position: NavigationVec3,
          options?: NavigationCrowdAgentOptions
        ): unknown;
        setTarget(agent: unknown, target: NavigationVec3): boolean;
        update(dt: number): void;
        agentStates(): readonly RecastCrowdAgentState[];
        dispose(): void;
      };
    };
  }>;
}

export interface AuraNavigationPeerLoaders extends RecastNavigationOptions {
  /**
   * Fully hermetic peer injection for tests: when supplied, no dynamic
   * import runs at all, so the suite never needs the optional package.
   */
  readonly peer?: AuraNavigationPeer;
}

async function loadNavigationPeer(loaders?: AuraNavigationPeerLoaders): Promise<AuraNavigationPeer> {
  if (loaders?.peer) return loaders.peer;
  // Literal bare specifier (never rewritten: finalize-dist exempts the
  // optional peer). Workspace source builds resolve it through the
  // `@aura3d/navigation-recast` alias and bundle it; installed consumers
  // keep it external (the scaffold vite config marks it
  // `build.rollupOptions.external`) so builds pass without shipping the
  // peer, and it resolves via node_modules only if a route actually uses
  // crowds — otherwise the fail-closed error below fires.
  const peer = (await import("@aura3d/navigation-recast")) as unknown as AuraNavigationPeer;
  if (typeof peer.createRecastNavigation !== "function") {
    throw new Error("Recast navigation peer unavailable: the optional \"@aura3d/navigation-recast\" package did not export createRecastNavigation.");
  }
  return peer;
}

export interface AuraNavMeshBakeOptions {
  readonly positions: readonly number[] | Float32Array;
  readonly indices: readonly number[] | Uint32Array;
  readonly settings?: Record<string, number | string | boolean>;
}

export interface AuraCrowdCreateOptions {
  readonly maxAgents: number;
  readonly maxAgentRadius: number;
}

export type AuraNavMeshHandle = Awaited<
  ReturnType<AuraNavigationPeer["createRecastNavigation"]>
> extends { generateSolo(input: NavigationTriangleSoup, config: Record<string, number | string | boolean>): infer M }
  ? M
  : never;

export type AuraCrowdHandle = AuraNavMeshHandle extends {
  createCrowd(maxAgents: number, maxAgentRadius: number): infer C;
}
  ? C
  : never;

async function bakeNavMesh(
  options: AuraNavMeshBakeOptions,
  loaders?: AuraNavigationPeerLoaders
): Promise<AuraNavMeshHandle> {
  const peer = await loadNavigationPeer(loaders);
  const baked = await peer.createRecastNavigation(loaders ?? {});
  const soup: NavigationTriangleSoup = { positions: options.positions, indices: options.indices };
  return baked.generateSolo(soup, options.settings ?? {});
}

function queryPath(
  mesh: AuraNavMeshHandle,
  from: NavigationVec3,
  to: NavigationVec3
): NavigationPathResult {
  // Retained waypoints: the caller owns the returned array; empty + error on failure.
  const result = mesh.computePath(from, to);
  return { success: result.success, points: [...result.points], ...(result.error ? { error: result.error } : {}) };
}

async function navigationIsAvailable(loaders?: AuraNavigationPeerLoaders): Promise<boolean> {
  try {
    const peer = await loadNavigationPeer(loaders);
    await peer.createRecastNavigation(loaders ?? {});
    return true;
  } catch {
    return false;
  }
}

export const navigation = {
  bake: bakeNavMesh,
  path: queryPath,
  dispose: (mesh: AuraNavMeshHandle): void => mesh.dispose(),
  isAvailable: navigationIsAvailable
} as const;

function createCrowd(
  mesh: AuraNavMeshHandle,
  options: AuraCrowdCreateOptions
): AuraCrowdHandle {
  return mesh.createCrowd(options.maxAgents, options.maxAgentRadius);
}

function crowdAgents(crowd: AuraCrowdHandle): readonly RecastCrowdAgentState[] {
  // Rendered from live Detour state, never the fixture sampler.
  return crowd.agentStates();
}

export const crowds = {
  create: createCrowd,
  dispose: (crowd: AuraCrowdHandle): void => crowd.dispose(),
  addAgent: (
    crowd: AuraCrowdHandle,
    position: NavigationVec3,
    options: NavigationCrowdAgentOptions = {}
  ) => crowd.addAgent(position, options),
  setTarget: (
    crowd: AuraCrowdHandle,
    agent: unknown,
    target: NavigationVec3
  ) => crowd.setTarget(agent, target),
  update: (crowd: AuraCrowdHandle, dt: number): void => {
    if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Crowd dt must be positive and finite.");
    crowd.update(dt);
  },
  agents: crowdAgents,
  count: (crowd: AuraCrowdHandle): number => crowd.count(),
  maxAgents: (crowd: AuraCrowdHandle): number => crowd.maxAgents,
  bindRepresentations: bindCrowdRepresentations,
  diagnostics: describeCrowd
} as const;

/** LOD tier per agent: full actors near, billboard/marker impostors past `farDistance`. */
export type AuraCrowdLodTier = "near" | "mid" | "impostor" | "unknown";

export interface AuraCrowdLodOptions {
  /** Camera position in the same space as agent positions. Without it every tier is "unknown". */
  readonly camera?: NavigationVec3;
  /** At or below this distance an agent renders full (default 6). */
  readonly nearDistance?: number;
  /** Past this distance an agent falls back to an impostor/marker (default 14). */
  readonly farDistance?: number;
}

export interface AuraCrowdAgentLod {
  readonly position: NavigationVec3;
  readonly distance: number | null;
  readonly tier: AuraCrowdLodTier;
}

export interface AuraCrowdDiagnostics {
  readonly count: number;
  readonly maxAgents: number;
  /** True once `addAgent` would throw instead of spawning (fail-closed cap). */
  readonly atCap: boolean;
  /** Present exactly when `atCap` — the over-budget warning for route evidence. */
  readonly capWarning?: string;
  readonly tiers: Record<AuraCrowdLodTier, number>;
  readonly agents: readonly AuraCrowdAgentLod[];
}

/**
 * O1 crowd LOD + cap diagnostics over LIVE crowd state (never the fixture sampler).
 *
 * Distances are Euclidean from `camera` to each live agent position; tiers split at
 * `nearDistance`/`farDistance`. Throws on inverted bounds so a misconfigured LOD
 * can never silently report every agent as near.
 */
export function describeCrowd(crowd: AuraCrowdHandle, options: AuraCrowdLodOptions = {}): AuraCrowdDiagnostics {
  const near = options.nearDistance ?? 6;
  const far = options.farDistance ?? 14;
  if (!Number.isFinite(near) || near <= 0) throw new RangeError("Crowd LOD nearDistance must be positive and finite.");
  if (!Number.isFinite(far) || far < near) throw new RangeError("Crowd LOD farDistance must be finite and >= nearDistance.");
  if (options.camera !== undefined && options.camera.some((entry) => !Number.isFinite(entry))) {
    throw new TypeError("Crowd LOD camera coordinates must be finite.");
  }
  const count = crowd.count();
  const maxAgents = crowd.maxAgents;
  const atCap = count >= maxAgents;
  const tiers: Record<AuraCrowdLodTier, number> = { near: 0, mid: 0, impostor: 0, unknown: 0 };
  const agents: AuraCrowdAgentLod[] = crowd.agentStates().map((state) => {
    if (options.camera === undefined) {
      tiers.unknown += 1;
      return { position: state.position, distance: null, tier: "unknown" as const };
    }
    const distance = Math.hypot(
      state.position[0] - options.camera[0],
      state.position[1] - options.camera[1],
      state.position[2] - options.camera[2]
    );
    const tier: AuraCrowdLodTier = distance <= near ? "near" : distance <= far ? "mid" : "impostor";
    tiers[tier] += 1;
    return { position: state.position, distance, tier };
  });
  return {
    count,
    maxAgents,
    atCap,
    ...(atCap ? { capWarning: `Recast crowd is at capacity (${count}/${maxAgents} agents). Raise maxAgents at creation; extra addAgent calls throw instead of silently dropping agents.` } : {}),
    tiers,
    agents
  };
}

/** A mounted render representation, retained across distance transitions. */
export interface AuraCrowdRepresentation {
  update(state: { readonly position: NavigationVec3; readonly heading: number; readonly selected: boolean }): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
export interface AuraCrowdRepresentationOptions {
  readonly nearDistance?: number;
  readonly farDistance?: number;
  /** Absolute world-space dead band around each distance boundary. */
  readonly hysteresis?: number;
  /** Create real mounted meshes/billboards, not a diagnostic counter. */
  readonly create: (agentIndex: number, tier: Exclude<AuraCrowdLodTier, "unknown">) => AuraCrowdRepresentation;
}

/** Lazily allocates each agent/tier once; switches visibility without resetting agent identity. */
export function bindCrowdRepresentations(crowd: AuraCrowdHandle, options: AuraCrowdRepresentationOptions) {
  const near = options.nearDistance ?? 6;
  const far = options.farDistance ?? 14;
  const band = options.hysteresis ?? 0.5;
  if (!Number.isFinite(near) || near <= 0 || !Number.isFinite(far) || far <= near ||
      !Number.isFinite(band) || band < 0 || band * 2 >= far - near) {
    throw new RangeError("Crowd representation thresholds require 0 < near < far and non-overlapping hysteresis.");
  }
  type Tier = Exclude<AuraCrowdLodTier, "unknown">;
  const entries = new Map<number, { tier: Tier; heading: number; resources: Map<Tier, AuraCrowdRepresentation> }>();
  let disposed = false;
  return {
    update(camera: NavigationVec3, selected: ReadonlySet<number> = new Set(), hidden: ReadonlySet<number> = new Set()) {
      if (disposed) throw new Error("Crowd representations have been disposed.");
      if (camera.some(value => !Number.isFinite(value))) throw new TypeError("Crowd camera must be finite.");
      const states = crowd.agentStates();
      const result: Tier[] = [];
      states.forEach((state, index) => {
        const distance = Math.hypot(...state.position.map((value, axis) => value - camera[axis]!));
        let entry = entries.get(index);
        let tier: Tier = distance <= near ? "near" : distance <= far ? "mid" : "impostor";
        if (entry) {
          if (entry.tier === "near" && distance <= near + band) tier = "near";
          if (entry.tier === "mid" && distance >= near - band && distance <= far + band) tier = "mid";
          if (entry.tier === "impostor" && distance >= far - band) tier = "impostor";
        } else {
          entry = { tier, heading: 0, resources: new Map() };
          entries.set(index, entry);
        }
        // Retain heading while stopped instead of snapping every stationary agent north.
        if (Math.hypot(state.velocity[0], state.velocity[2]) > 1e-6) entry.heading = Math.atan2(state.velocity[0], state.velocity[2]);
        let resource = entry.resources.get(tier);
        if (!resource) {
          resource = options.create(index, tier);
          resource.setVisible(false);
          entry.resources.set(tier, resource);
        }
        resource.update({ position: state.position, heading: entry.heading, selected: selected.has(index) });
        for (const [candidate, mounted] of entry.resources) mounted.setVisible(candidate === tier && !hidden.has(index));
        entry.tier = tier;
        result.push(tier);
      });
      for (const [index, entry] of entries) if (index >= states.length) {
        for (const resource of entry.resources.values()) resource.dispose();
        entries.delete(index);
      }
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) for (const resource of entry.resources.values()) resource.dispose();
      entries.clear();
    }
  };
}
