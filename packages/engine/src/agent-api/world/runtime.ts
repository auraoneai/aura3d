/**
 * PRD-10 §7.1.10 — the full `app.world` runtime handle type and world
 * diagnostics shape. `AuraWorldRuntime` extends the frozen C-26
 * `AuraWorldQueries`; the extension in `lanes/prd10.ts` currently binds the
 * queries surface, and the rest of this interface lands through Phases 2-6.
 */
import type { AuraBiomeId, AuraWorldQueries } from "../../contracts/world.js";
import type { AuraWindOptions } from "./wind.js";

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

export interface AuraTerrainHandle {
  readonly id: string;
  heightAt(x: number, z: number): number;
  normalAt(x: number, z: number): readonly [number, number, number];
}

export interface AuraWaterHandle {
  readonly id: string;
  heightAt(x: number, z: number, timeSeconds?: number): number;
  normalAt(x: number, z: number, timeSeconds?: number): readonly [number, number, number];
}

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
