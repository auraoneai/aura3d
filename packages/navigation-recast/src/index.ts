import type * as Recast from "recast-navigation";

export type NavigationVec3 = readonly [number, number, number];
export type RecastModule = typeof import("recast-navigation");
export type RecastGenerators = typeof import("recast-navigation/generators");

export interface NavigationTriangleSoup {
  readonly positions: readonly number[] | Float32Array;
  readonly indices: readonly number[] | Uint32Array;
}

export interface RecastNavigationOptions {
  readonly moduleLoader?: () => Promise<RecastModule>;
  readonly generatorLoader?: () => Promise<RecastGenerators>;
}

export interface NavigationPathResult {
  readonly success: boolean;
  readonly points: readonly NavigationVec3[];
  readonly error?: string;
}

/** Structural match for `AuraAssetRef<"navigation">` without coupling this optional package to the engine barrel. */
export interface NavigationAssetRef {
  readonly kind: "aura-asset-ref";
  readonly id: string;
  readonly type: "navigation";
  readonly format: "navmesh";
  readonly url: string;
  readonly hash?: string;
}

export interface NavigationAssetFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ImportNavigationAssetOptions {
  readonly fetch?: (url: string) => Promise<NavigationAssetFetchResponse>;
  readonly verifyHash?: boolean;
}

export interface NavigationCrowdAgentOptions {
  readonly radius?: number;
  readonly height?: number;
  readonly maxAcceleration?: number;
  readonly maxSpeed?: number;
  readonly collisionQueryRange?: number;
  readonly pathOptimizationRange?: number;
  readonly separationWeight?: number;
}

function vector(value: NavigationVec3): { x: number; y: number; z: number } {
  if (value.some((entry) => !Number.isFinite(entry))) throw new TypeError("Navigation coordinates must be finite.");
  return { x: value[0], y: value[1], z: value[2] };
}

export class RecastNavMeshHandle {
  readonly #module: RecastModule;
  readonly #navMesh: Recast.NavMesh;
  readonly #query: Recast.NavMeshQuery;
  #disposed = false;

  constructor(module: RecastModule, navMesh: Recast.NavMesh) {
    this.#module = module;
    this.#navMesh = navMesh;
    this.#query = new module.NavMeshQuery(navMesh);
  }

  get disposed(): boolean { return this.#disposed; }

  computePath(start: NavigationVec3, end: NavigationVec3): NavigationPathResult {
    this.#assertAlive();
    const result = this.#query.computePath(vector(start), vector(end));
    if (!result.success) return { success: false, points: [], error: String(result.error ?? "Detour path query failed.") };
    return { success: true, points: result.path.map((point) => [point.x, point.y, point.z] as const) };
  }

  createCrowd(maxAgents: number, maxAgentRadius: number): RecastCrowdHandle {
    this.#assertAlive();
    return new RecastCrowdHandle(this.#module, this.#navMesh, maxAgents, maxAgentRadius);
  }

  serialize(): Uint8Array { this.#assertAlive(); return this.#module.exportNavMesh(this.#navMesh); }
  /** Stable escape hatch. The handle retains ownership and frees this object. */
  unsafeRecastNavMesh(): Recast.NavMesh { this.#assertAlive(); return this.#navMesh; }

  dispose(): void {
    if (this.#disposed) return;
    this.#query.destroy();
    this.#navMesh.destroy();
    this.#disposed = true;
  }

  #assertAlive(): void { if (this.#disposed) throw new Error("RecastNavMeshHandle is disposed."); }
}

/** Per-agent crowd telemetry (O1): real Detour agent state for engine crowds. */
export interface RecastCrowdAgentState {
  readonly position: NavigationVec3;
  readonly velocity: NavigationVec3;
  readonly speed: number;
}

export class RecastCrowdHandle {
  readonly #crowd: Recast.Crowd;
  /** Over-budget cap, fixed at construction. Adding past it throws fail-closed. */
  readonly maxAgents: number;
  #disposed = false;

  constructor(module: RecastModule, navMesh: Recast.NavMesh, maxAgents: number, maxAgentRadius: number) {
    if (!Number.isInteger(maxAgents) || maxAgents < 1) throw new RangeError("maxAgents must be an integer >= 1.");
    if (!Number.isFinite(maxAgentRadius) || maxAgentRadius <= 0) throw new RangeError("maxAgentRadius must be positive.");
    this.#crowd = new module.Crowd(navMesh, { maxAgents, maxAgentRadius });
    this.maxAgents = maxAgents;
  }

  /** Live agent count against {@link maxAgents}. The root `crowds` builder reports this in diagnostics with a cap warning. */
  count(): number {
    this.#assertAlive();
    return this.#crowd.getAgents().length;
  }

  addAgent(position: NavigationVec3, options: NavigationCrowdAgentOptions = {}): Recast.CrowdAgent {
    this.#assertAlive();
    if (this.#crowd.getAgents().length >= this.maxAgents) {
      throw new Error(`Recast crowd is at capacity (${this.maxAgents} agents). Create the crowd with a larger maxAgents instead of silently dropping agents.`);
    }
    return this.#crowd.addAgent(vector(position), options);
  }

  requestMoveTarget(agent: Recast.CrowdAgent, target: NavigationVec3): boolean {
    this.#assertAlive();
    return agent.requestMoveTarget(vector(target));
  }

  /** Root-facing alias for `requestMoveTarget`, matching the O1 `crowds.setTarget` builder name. */
  setTarget(agent: Recast.CrowdAgent, target: NavigationVec3): boolean {
    return this.requestMoveTarget(agent, target);
  }

  update(dt: number): void {
    this.#assertAlive();
    if (!Number.isFinite(dt) || dt <= 0) throw new RangeError("Crowd dt must be positive and finite.");
    this.#crowd.update(dt);
  }

  positions(): readonly NavigationVec3[] {
    this.#assertAlive();
    return this.#crowd.getAgents().map((agent) => { const point = agent.position(); return [point.x, point.y, point.z] as const; });
  }

  /**
   * Per-agent position + velocity + speed from the Detour crowd (O1 task 2).
   *
   * This is the data source the root `crowds` builder must feed its agents instead of
   * the `sampleCrowdAnimation` fixture: the fixture sampler stays as the deterministic
   * oracle for tests, but engine crowds render from these real positions.
   */
  agentStates(): readonly RecastCrowdAgentState[] {
    this.#assertAlive();
    return this.#crowd.getAgents().map((agent) => {
      const point = agent.position();
      const velocity = agent.velocity();
      return {
        position: [point.x, point.y, point.z] as const,
        velocity: [velocity.x, velocity.y, velocity.z] as const,
        speed: Math.hypot(velocity.x, velocity.y, velocity.z)
      };
    });
  }

  /** Stable escape hatch. The handle owns and destroys this crowd. */
  unsafeRecastCrowd(): Recast.Crowd { this.#assertAlive(); return this.#crowd; }
  dispose(): void { if (!this.#disposed) { this.#crowd.destroy(); this.#disposed = true; } }
  #assertAlive(): void { if (this.#disposed) throw new Error("RecastCrowdHandle is disposed."); }
}

export class RecastTileCacheHandle {
  readonly navMesh: RecastNavMeshHandle;
  readonly #module: RecastModule;
  readonly #tileCache: Recast.TileCache;
  #disposed = false;

  constructor(module: RecastModule, navMesh: Recast.NavMesh, tileCache: Recast.TileCache) {
    this.#module = module;
    this.#tileCache = tileCache;
    this.navMesh = new RecastNavMeshHandle(module, navMesh);
  }

  addCylinderObstacle(position: NavigationVec3, radius: number, height: number): Recast.Obstacle {
    this.#assertAlive();
    const result = this.#tileCache.addCylinderObstacle(vector(position), radius, height);
    if (!result.success || !result.obstacle) throw new Error(`Recast obstacle creation failed with status ${result.status}.`);
    return result.obstacle;
  }

  removeObstacle(obstacle: Recast.Obstacle): void {
    this.#assertAlive();
    const result = this.#tileCache.removeObstacle(obstacle);
    if (!result.success) throw new Error(`Recast obstacle removal failed with status ${result.status}.`);
  }

  update(maxIterations = 64): number {
    this.#assertAlive();
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const result = this.#tileCache.update(this.navMesh.unsafeRecastNavMesh());
      if (!result.success) throw new Error(`Recast tile-cache update failed with status ${result.status}.`);
      if (result.upToDate) return iteration;
    }
    throw new Error(`Recast tile cache did not settle within ${maxIterations} updates.`);
  }

  serialize(): Uint8Array {
    this.#assertAlive();
    return this.#module.exportTileCache(this.navMesh.unsafeRecastNavMesh(), this.#tileCache);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#tileCache.destroy();
    this.navMesh.dispose();
    this.#disposed = true;
  }

  #assertAlive(): void { if (this.#disposed) throw new Error("RecastTileCacheHandle is disposed."); }
}

export class RecastNavigation {
  readonly #module: RecastModule;
  readonly #generators: RecastGenerators;
  constructor(module: RecastModule, generators: RecastGenerators) { this.#module = module; this.#generators = generators; }

  generateSolo(input: NavigationTriangleSoup, config: Parameters<RecastGenerators["generateSoloNavMesh"]>[2]): RecastNavMeshHandle {
    const result = this.#generators.generateSoloNavMesh([...input.positions], [...input.indices], config);
    if (!result.success || !result.navMesh) throw new Error(`Recast navmesh generation failed: ${String(result.error ?? "unknown error")}`);
    return new RecastNavMeshHandle(this.#module, result.navMesh);
  }

  generateTileCache(input: NavigationTriangleSoup, config: Parameters<RecastGenerators["generateTileCache"]>[2] = {}): RecastTileCacheHandle {
    const result = this.#generators.generateTileCache(input.positions, input.indices, config);
    if (!result.success || !result.navMesh || !result.tileCache) throw new Error(`Recast tile-cache generation failed: ${String(result.error ?? "unknown error")}`);
    return new RecastTileCacheHandle(this.#module, result.navMesh, result.tileCache);
  }

  import(bytes: Uint8Array): RecastNavMeshHandle {
    const result = this.#module.importNavMesh(bytes);
    return new RecastNavMeshHandle(this.#module, result.navMesh);
  }

  async importAsset(asset: NavigationAssetRef, options: ImportNavigationAssetOptions = {}): Promise<RecastNavMeshHandle> {
    if (asset.kind !== "aura-asset-ref" || asset.type !== "navigation" || asset.format !== "navmesh") {
      throw new TypeError("Recast navigation import requires a typed Aura navigation/navmesh asset reference.");
    }
    const fetchAsset = options.fetch ?? ((url: string) => fetch(url));
    const response = await fetchAsset(asset.url);
    if (!response.ok) throw new Error(`Navigation asset ${asset.id} failed to load (${response.status}) from ${asset.url}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error(`Navigation asset ${asset.id} is empty.`);
    if (options.verifyHash !== false && asset.hash) await verifyNavigationAssetHash(asset, bytes);
    return this.import(bytes);
  }

  /** Stable typed escape hatch for Crowd, TileCache, and advanced Detour APIs. */
  get rawModule(): RecastModule { return this.#module; }
}

async function verifyNavigationAssetHash(asset: NavigationAssetRef, bytes: Uint8Array): Promise<void> {
  const expected = asset.hash?.match(/^sha256-([a-f0-9]{64})$/i)?.[1]?.toLowerCase();
  if (!expected) throw new Error(`Navigation asset ${asset.id} has an unsupported integrity value; expected sha256-<64 hex characters>.`);
  if (!globalThis.crypto?.subtle) throw new Error(`Navigation asset ${asset.id} cannot verify SHA-256 because Web Crypto is unavailable.`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer));
  const actual = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expected) throw new Error(`Navigation asset ${asset.id} failed SHA-256 verification.`);
}

/**
 * Fail-closed construction for the optional Recast/Detour peer (O1 checklist).
 *
 * Recast is optional navigation, never a silent fallback: when the peer module is
 * absent the error names the missing package and the install step instead of
 * resolving to a no-op navigator. The root `navigation` builder must surface this
 * in diagnostics rather than reporting a successful bake.
 */
/*
 * Literal lazy imports: the engine stays out of every bundle until navigation
 * is actually called, and bundlers (vite dev, rollup build) can statically
 * resolve the specifier against the installed `recast-navigation` dependency.
 * An earlier variable-indirection broke exactly that: bundlers left a native
 * runtime `import(variable)` behind, which browsers reject as an unresolvable
 * bare specifier even with the engine installed. Absence still fails closed
 * at call time through the errors below (never as a silent no-op navigator).
 */
export async function createRecastNavigation(options: RecastNavigationOptions = {}): Promise<RecastNavigation> {
  let module: RecastModule;
  try {
    module = await (options.moduleLoader ?? (() => import("recast-navigation")))();
    await module.init();
  } catch (error) {
    throw new Error(
      "Recast navigation peer unavailable: the optional \"recast-navigation\" package could not be loaded. " +
      "Install it to enable navmesh baking, or treat navigation as absent — never as silently succeeding. " +
      `Cause: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  let generators: RecastGenerators;
  try {
    generators = await (options.generatorLoader ?? (() => import("recast-navigation/generators")))();
  } catch (error) {
    throw new Error(
      "Recast navigation generators unavailable: \"recast-navigation/generators\" could not be loaded. " +
      `Cause: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return new RecastNavigation(module, generators);
}
