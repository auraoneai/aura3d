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
