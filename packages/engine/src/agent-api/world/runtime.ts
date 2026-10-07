/**
 * PRD-10 §7.1.10 — the full `app.world` runtime handle type and world
 * diagnostics shape. `AuraWorldRuntime` extends the frozen C-26
 * `AuraWorldQueries`; `createWorldRuntime` is what the C-38 `world` extension
 * actually binds (flag-gated by `worldQueriesSlot.get(flags)` upstream).
 */
import type { AuraBiomeId, AuraWorldQueries } from "../../contracts/world.js";
import type { AuraApp } from "../index.js";
import type { AuraTerrainHandle } from "./terrain.js";
import { createTerrainHandle, terrainRecordFor, terrainRecordIds } from "./terrain.js";
import { waterRecordFor, waterRecordIds, createWaterHandle, type AuraWaterHandle } from "./water.js";
import { terrainHeightBilinear } from "@aura3d/rendering/world";
import type { AuraWindOptions } from "./wind.js";
import { createWorldQueries, registerTerrainProvider, setWorldWind, worldStateFor } from "./queries.js";

export interface AuraWorldRuntime extends AuraWorldQueries {
  readonly timeOfDay: {
    set(hour: number): void;
    get(): number;
    animate(options: { readonly hoursPerSecond: number }): void;
    pause(): void;
  };
  /** `wind()` is the C-26 getter, so the setter is a method on the runtime. */
  setWind(options: AuraWindOptions): void;
  terrain(nameOrId: string): AuraTerrainHandle;
  water(nameOrId: string): AuraWaterHandle;
  /** Same object as `diagnostics().world` (C-31 section "world"). */
  diagnostics(): AuraWorldDiagnostics;
}

export type { AuraWaterHandle } from "./water.js";

/** Every number is measured from submitted draws in the last frame; unmeasurable = null. */
export interface AuraWorldDiagnostics {
  readonly drawPath: "S" | "G" | "safe-basic";
  readonly terrain: readonly {
    readonly id: string;
    readonly nodesDrawn: number;
    readonly trianglesDrawn: number;
    readonly layers: number;
    readonly degraded: boolean;
  }[];
  readonly scatter: readonly {
    readonly name: string;
    readonly lod0: number;
    readonly lod1: number;
    readonly impostor: number;
    readonly culled: number;
    readonly shadowCasters: number | null;
    readonly draws: number;
    readonly checksum: string;
  }[];
  readonly grass: readonly {
    readonly bladesDrawn: number;
    readonly chunks: number;
    readonly mode: "blades" | "cards" | "off";
  }[];
  readonly water: readonly {
    readonly id: string;
    readonly reflection: "ibl" | "ssr" | "planar";
    readonly planarDraws: number;
    readonly refraction: boolean;
    readonly sceneCopy: "shared" | "prd10-fallback" | "none";
    readonly underwater: boolean;
  }[];
  readonly biome: {
    readonly id: AuraBiomeId | null;
    readonly environmentSource: string;
    readonly iblPixelBacked: boolean | null;
    readonly backgroundDrawn: boolean | null;
    readonly iblCrossfade: "on" | "pending-CCR-10-1";
  };
  readonly pending: readonly string[]; // e.g. "C-11:shadows", "C-02:generator", "C-21:sky-real" while stubs are active
  readonly memoryMB: number;
  readonly gpuMs: Readonly<Record<string, number>> | null; // only when EXT_disjoint_timer_query_webgl2 is available (C-28)
}

export function emptyWorldDiagnostics(drawPath: AuraWorldDiagnostics["drawPath"]): AuraWorldDiagnostics {
  return {
    drawPath,
    terrain: [],
    scatter: [],
    grass: [],
    water: [],
    biome: {
      id: null,
      environmentSource: "none",
      iblPixelBacked: null,
      backgroundDrawn: null,
      iblCrossfade: "pending-CCR-10-1"
    },
    pending: ["C-11:shadows", "C-02:generator", "C-21:sky-real"],
    memoryMB: 0,
    gpuMs: null
  };
}

function scanSceneTerrains(app: AuraApp, scene: unknown): void {
  // Scene nodes arrive as plain snapshots; a world node is any record whose
  // kind is "terrain". Registering early means `height()` works before compile.
  const nodes = (scene as { nodes?: readonly unknown[] } | null | undefined)?.nodes;
  if (!nodes) return;
  for (const raw of nodes) {
    const node = raw as { kind?: string; id?: string; options?: { origin?: readonly [number, number, number] } };
    if (node?.kind !== "terrain" || typeof node.id !== "string") continue;
    const record = terrainRecordFor(node.id);
    if (!record) continue;
    registerTerrainProvider(app, {
      nodeId: record.node.id,
      heightAt: (x, z) => {
        if (!record.grid) return null;
        const u = (x - record.origin[0]) / record.size[0];
        const v = (z - record.origin[2]) / record.size[1];
        if (u < 0 || u > 1 || v < 0 || v > 1) return null;
        return terrainHeightBilinear(record.grid, [u, v], record.heightScale);
      },
      normalAt: (x, z) => (record.grid ? createTerrainHandle(record).normalAt(x, z) : null)
    });
  }
}

/**
 * Real `app.world` (C-38): C-26 queries + terrain/water handles + timeOfDay +
 * diagnostics. Registers terrain providers found in `options.scene.nodes`.
 */
export function createWorldRuntime(
  app: AuraApp,
  options: { readonly scene?: unknown } = {}
): AuraWorldRuntime {
  scanSceneTerrains(app, options.scene);
  const queries = createWorldQueries(app);
  const state = worldStateFor(app);
  return {
    ...queries,
    timeOfDay: {
      set(hour: number) {
        state.timeOfDay.hour = ((hour % 24) + 24) % 24;
        state.timeOfDay.hoursPerSecond = null;
      },
      get() {
        return state.timeOfDay.hour;
      },
      animate({ hoursPerSecond }) {
        state.timeOfDay.hoursPerSecond = hoursPerSecond;
      },
      pause() {
        state.timeOfDay.hoursPerSecond = null;
      }
    },
    setWind(options) {
      setWorldWind(app, options);
    },
    terrain(nameOrId) {
      const record = terrainRecordFor(nameOrId);
      if (!record) {
        throw new Error(
          `world.terrain("${nameOrId}"): no terrain node with that id (have: ${terrainRecordIds().join(", ") || "none"})`
        );
      }
      return createTerrainHandle(record);
    },
    water(nameOrId) {
      const record = waterRecordFor(nameOrId);
      if (!record) {
        throw new Error(
          `world.water("${nameOrId}"): no water node with that id (have: ${waterRecordIds().join(", ") || "none"})`
        );
      }
      return createWaterHandle(record);
    },
    diagnostics() {
      return (state.diagnostics as AuraWorldDiagnostics | null) ?? emptyWorldDiagnostics("S");
    }
  };
}
