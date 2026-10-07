/**
 * PRD-10 T2.7 — C-36 node handlers for the world kinds.
 *
 * `terrain`: resolves the lane's `TerrainRecord` for the node (creating it if
 * the builder wasn't used — e.g. a plain JSON node), binds asset height
 * sources through `ctx.assets` when available, marks the `world.terrain`
 * feature on the compiled scene, and records the node id on the render source
 * (`prd10.terrains`) for the frame contributor.
 *
 * Path G: `collect` time `out.addItems` would emit instanced patch items;
 * until `programCacheSlot` is provided the Path S pass in
 * `production-runtime/world/TerrainRuntime.ts` draws instead. Safe-basic mode
 * falls back to a vertex-colour mesh built from splat weights.
 */
import { registerNodeHandler } from "../../contracts/compiler.js";
import { Geometry, IndexBuffer, UnlitMaterial, VertexBuffer, VertexFormat } from "@aura3d/rendering";
import { terrainHeightBilinear } from "@aura3d/rendering/world";
import {
  layerWeightsAt,
  resolveTerrainGrid,
  terrainRecordFor,
  worldTerrain,
  type AuraTerrainNode,
  type AuraTerrainOptions,
  type TerrainRecord
} from "../world/terrain.js";
import {
  planScatterInstances,
  scatterChecksum,
  type AuraGrassNode,
  type AuraScatterNode,
  type ScatterInstance
} from "../world/scatter.js";
import {
  waterRecordFor,
  worldWater,
  type AuraWaterNode,
  type AuraWaterOptions
} from "../world/water.js";
import {
  applyBiomeOverrides,
  describeBiome,
  type AuraBiomeNode,
  type AuraBiomeRigDetail
} from "../world/biomes.js";
import type { AuraTimeOfDayNode } from "../world/biomes.js";
import { rigAtHour } from "../world/timeOfDay.js";
import type { AuraWindNode } from "../world/wind.js";
import type { AuraLightNode } from "../index.js";

/** Sun spec → directional light position (direction points from origin toward the sun). */
const sunPosition = (sun: { elevationDeg: number; azimuthDeg: number }): [number, number, number] => {
  const el = (sun.elevationDeg * Math.PI) / 180;
  const az = (sun.azimuthDeg * Math.PI) / 180;
  const R = 200;
  return [
    Math.sin(az) * Math.cos(el) * R,
    Math.sin(el) * R,
    -Math.cos(az) * Math.cos(el) * R
  ];
};

/** C-10 shadow options + sun → the AuraLightNode the biome contributes. */
function sunLightFor(nodeId: string, rig: AuraBiomeRigDetail): AuraLightNode | null {
  const sun = rig.sunDetail;
  if (!sun || sun.intensity <= 0) return null;
  return {
    kind: "light",
    light: "directional",
    name: `${nodeId}-sun`,
    intensity: sun.intensity,
    position: sunPosition(sun),
    target: [0, 0, 0],
    // C-10 shadow options come straight from the rig's shadows block
    shadow: sun.castShadow === false
      ? false
      : { cascades: rig.shadows.cascades, maxDistance: rig.shadows.maxDistance },
    // practical-scale tags the light so Path G/S rescales it with time-of-day
    tags: ["prd10.sun"]
  } as AuraLightNode;
}

const LAYER_COLORS: Readonly<Record<string, readonly [number, number, number]>> = {
  "grass-meadow": [0.29, 0.42, 0.18],
  "grass-dry": [0.5, 0.45, 0.25],
  "dirt-path": [0.42, 0.32, 0.2],
  "rock-cliff": [0.45, 0.44, 0.42],
  "rock-scree": [0.5, 0.48, 0.45],
  "sand-beach": [0.82, 0.74, 0.55],
  snow: [0.93, 0.95, 0.98],
  "forest-floor": [0.3, 0.27, 0.18],
  asphalt: [0.2, 0.2, 0.22],
  gravel: [0.55, 0.53, 0.5],
  rock: [0.45, 0.44, 0.42],
  grass: [0.29, 0.42, 0.18],
  sand: [0.82, 0.74, 0.55],
  dirt: [0.42, 0.32, 0.2]
};

/** Ensure a TerrainRecord exists for a node the compiler saw (builderless JSON nodes). */
export function terrainRecordForNode(node: AuraTerrainNode): TerrainRecord {
  let record = terrainRecordFor(node.id);
  if (!record) {
    const options: AuraTerrainOptions = { ...node.options, id: node.id, name: node.name };
    // worldTerrain() creates the record; the thrown-away builder is fine.
    worldTerrain(options);
    record = terrainRecordFor(node.id)!;
  }
  if (!record.grid) {
    record.grid = resolveTerrainGrid(record.options);
  }
  return record;
}

/** §7.1.4 safe-basic: unlit vertex-colour mesh sampled from splat weights. */
export function terrainSafeBasicGeometry(record: TerrainRecord, divisions = 32): Geometry | null {
  const grid = record.grid;
  if (!grid) return null;
  const verts = (divisions + 1) * (divisions + 1);
  const format = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "color", components: 4, offset: 12 }
  ]);
  const vb = new VertexBuffer(format, verts);
  let o = 0;
  for (let j = 0; j <= divisions; j += 1) {
    for (let i = 0; i <= divisions; i += 1) {
      const u = i / divisions;
      const v = j / divisions;
      const x = record.origin[0] + u * record.size[0];
      const z = record.origin[2] + v * record.size[1];
      const h = terrainHeightBilinear(grid, [u, v], record.heightScale) + record.origin[1];
      vb.setAttribute(o, "position", [x, h, z]);
      const weights = layerWeightsAt(record, x, z);
      let r = 0.4;
      let g = 0.4;
      let b = 0.4;
      let sum = 0;
      for (const [name, w] of Object.entries(weights)) {
        const c = LAYER_COLORS[name] ?? [0.4, 0.4, 0.4];
        r += c[0] * w;
        g += c[1] * w;
        b += c[2] * w;
        sum += w;
      }
      if (sum > 0) {
        r /= sum;
        g /= sum;
        b /= sum;
      }
      vb.setAttribute(o, "color", [r, g, b, 1]);
      o += 1;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < divisions; j += 1) {
    for (let i = 0; i < divisions; i += 1) {
      const a = j * (divisions + 1) + i;
      const b = a + 1;
      const c = a + divisions + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return new Geometry(vb, new IndexBuffer(indices, verts));
}

/** C-36 handlers for `terrain` (A3D_QR_WORLD_TERRAIN), `scatter` and `grass` (A3D_QR_WORLD). */
export function registerWorldNodeHandlers(): () => void {
  const unregisterTerrain = registerNodeHandler({
    kind: "terrain",
    owner: "prd10",
    flag: "A3D_QR_WORLD_TERRAIN",
    compile(node, ctx, out) {
      const terrainNode = node as unknown as AuraTerrainNode;
      const record = terrainRecordForNode(terrainNode);
      // Resolve asset height sources through the asset resolver when one is
      // bound (ctx.assets). The provider seam is async-capable; until the png16
      // decode path lands (Phase 2 PR D), array/procedural sources cover tests.
      if (record.options.height.kind === "asset" && ctx.assets) {
        const assets = ctx.assets as {
          texturePixels?: (ref: unknown) => Promise<{ readonly width: number; readonly height: number; readonly data: ArrayBufferView } | null>;
        };
        const p = assets.texturePixels?.(record.options.height.asset);
        if (p && typeof (p as PromiseLike<unknown>).then === "function") {
          return (p as Promise<{ readonly width: number; readonly height: number; readonly data: ArrayBufferView } | null>)
            .then((px) => {
              if (!px) return;
              const src = px.data;
              const heights =
                src instanceof Float32Array
                  ? src
                  : src instanceof Uint16Array
                    ? Float32Array.from(src, (v) => v / 65535)
                    : Float32Array.from(src as Uint8Array, (v) => v / 255);
              record.grid = { columns: px.width, rows: px.height, heights };
              markTerrainReady(record);
            })
            .catch(() => undefined);
        }
      }
      const ids = [terrainNode.id];
      out.set("prd10.terrains", ids);
      out.feature("world.terrain");
      const safeBasic = (ctx as { safeBasic?: boolean }).safeBasic === true;
      if (safeBasic) {
        const geometry = terrainSafeBasicGeometry(record);
        if (geometry) {
          out.addItems([
            {
              geometry,
              material: new UnlitMaterial({ name: `prd10.terrain.${terrainNode.id}.safeBasic`, color: [1, 1, 1, 1] }),
              label: `prd10.terrain.${terrainNode.id}.safeBasic`
            }
          ]);
        }
      }
    },
    update(node, _handle, _ctx, _out, _timeSeconds) {
      void node; // terrain nodes are static; morph/collider updates land via record mutation
    },
    dispose(node) {
      void node; // records stay live — terrain handles outlive scene recompiles
    }
  });

  // T3.2/T3.8 — `kind: "scatter"` (flag A3D_QR_WORLD). Carries rule-driven
  // `options` (re-planned identically at compile via planScatterInstances) or
  // explicit `placements` from kits/place*/instances.model world options.
  const unregisterScatter = registerNodeHandler({
    kind: "scatter",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    compile(node, _ctx, out) {
      const scatterNode = node as unknown as AuraScatterNode;
      const instances = scatterNode.options ? planScatterInstances(scatterNode.options) : null;
      const count = instances?.length ?? (scatterNode.placements ? scatterNode.placements.matrices.length / 12 : 0);
      out.set("prd10.scatters", {
        id: scatterNode.id,
        count,
        placements: scatterNode.placements ?? null,
        checksum: instances ? scatterChecksum(packScatterMatrices(instances)) : null
      });
      out.feature("world.scatter");
      if (scatterNode.options) {
        scatterRecords.set(scatterNode.id, { node: scatterNode, planned: instances! });
      }
    },
    update(node, _handle, _ctx, _out, _timeSeconds) {
      void node; // placements are static; budget re-slices are compile-time
    },
    dispose(node) {
      scatterRecords.delete((node as unknown as AuraScatterNode).id);
    }
  });

  // T3.7 — `kind: "grass"` (flag A3D_QR_WORLD_TERRAIN — blades sit on a terrain).
  const unregisterGrass = registerNodeHandler({
    kind: "grass",
    owner: "prd10",
    flag: "A3D_QR_WORLD_TERRAIN",
    compile(node, _ctx, out) {
      const grassNode = node as unknown as AuraGrassNode;
      out.set("prd10.grassNodes", { id: grassNode.id, terrainId: grassNode.options.terrain.id });
      out.feature("world.grass");
      grassRecords.set(grassNode.id, grassNode);
    },
    update(node, _handle, _ctx, _out, _timeSeconds) {
      void node;
    },
    dispose(node) {
      grassRecords.delete((node as unknown as AuraGrassNode).id);
    }
  });

  // T4.6 — `kind: "water"` (flag A3D_QR_WORLD_WATER). Resolves a WaterRecord
  // (creating it for builderless JSON nodes), marks `world.water`, and lists
  // the node on `prd10.waters` for the frame contributor.
  const unregisterWater = registerNodeHandler({
    kind: "water",
    owner: "prd10",
    flag: "A3D_QR_WORLD_WATER",
    compile(node, _ctx, out) {
      const waterNode = node as unknown as AuraWaterNode;
      let record = waterRecordFor(waterNode.id);
      if (!record) {
        const options: AuraWaterOptions = { ...waterNode.options, id: waterNode.id, name: waterNode.name };
        worldWater(options);
        record = waterRecordFor(waterNode.id)!;
      }
      waterRecords.set(waterNode.id, record);
      out.set("prd10.waters", [waterNode.id]);
      out.feature("world.water");
    },
    update(node, _handle, _ctx, _out, _timeSeconds) {
      void node; // water params are static; wave time comes from frame time
    },
    dispose(node) {
      waterRecords.delete((node as unknown as AuraWaterNode).id);
    }
  });

  // T6.2 — `kind: "biome"` (flag A3D_QR_WORLD_BIOME): resolves the rig with the
  // node's overrides, stores it for `prd10.timeOfDay`/runtime lookup, marks
  // `world.biome`, and contributes the sun as a directional light carrying the
  // rig's C-10 shadow options. The env-source resolution itself is
  // `prd10.biome` (BiomeResolver.ts).
  const unregisterBiome = registerNodeHandler({
    kind: "biome",
    owner: "prd10",
    flag: "A3D_QR_WORLD_BIOME",
    compile(node, _ctx, out) {
      const biomeNode = node as unknown as AuraBiomeNode;
      const rig = applyBiomeOverrides(describeBiome(biomeNode.biome), biomeNode.overrides);
      biomeRecords.set(biomeNode.id, { node: biomeNode, rig });
      out.set("prd10.biome", { id: biomeNode.id, biome: biomeNode.biome, scope: biomeNode.scope ?? "all" });
      // C-13: post preset + per-biome overrides ride the render source for the
      // post stack (prereq C-13 contract; applies the PostPresetId verbatim).
      out.set("prd10.post", { preset: rig.post, overrides: rig.postOverrides });
      out.feature("world.biome");
      const sun = sunLightFor(biomeNode.id, rig);
      if (sun) out.addLights([sun]);
    },
    update(node, _handle, _ctx, _out, _timeSeconds) {
      // re-resolve in case time-of-day rewrote the rig
      const biomeNode = node as unknown as AuraBiomeNode;
      biomeRecords.set(biomeNode.id, {
        node: biomeNode,
        rig: applyBiomeOverrides(describeBiome(biomeNode.biome), biomeNode.overrides)
      });
    },
    dispose(node) {
      biomeRecords.delete((node as unknown as AuraBiomeNode).id);
    }
  });

  // T6.2/T6.4 — `kind: "time-of-day"` (flag A3D_QR_WORLD_BIOME): publishes the
  // node's options + the rig at its declared hour for TimeOfDayRuntime.
  const unregisterTimeOfDay = registerNodeHandler({
    kind: "time-of-day",
    owner: "prd10",
    flag: "A3D_QR_WORLD_BIOME",
    compile(node, _ctx, out) {
      const todNode = node as unknown as AuraTimeOfDayNode;
      timeOfDayRecords.set(todNode.id, todNode);
      const rig = rigAtHour(todNode.options, todNode.options.hour);
      out.set("prd10.timeOfDay", { id: todNode.id, hour: todNode.options.hour, options: todNode.options });
      out.feature("world.timeOfDay");
      const sun = sunLightFor(todNode.id, rig);
      if (sun) out.addLights([sun]);
    },
    update(node, _handle, _ctx, _out, _timeSeconds) {
      void node; // hour animation is driven by TimeOfDayRuntime via app.world.timeOfDay
    },
    dispose(node) {
      timeOfDayRecords.delete((node as unknown as AuraTimeOfDayNode).id);
    }
  });

  // T6.2 — `kind: "wind"` (flag A3D_QR_WORLD): publishes the normalized wind
  // spec; WindField consumers read it through `prd10.wind`.
  const unregisterWind = registerNodeHandler({
    kind: "wind",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    compile(node, _ctx, out) {
      const windNode = node as unknown as AuraWindNode;
      windRecords.set(windNode.id, windNode);
      out.set("prd10.wind", windNode.wind);
      out.feature("world.wind");
    },
    update(node, _handle, _ctx, _out, _timeSeconds) {
      const windNode = node as unknown as AuraWindNode;
      windRecords.set(windNode.id, windNode);
    },
    dispose(node) {
      windRecords.delete((node as unknown as AuraWindNode).id);
    }
  });

  return () => {
    unregisterTerrain();
    unregisterScatter();
    unregisterGrass();
    unregisterWater();
    unregisterBiome();
    unregisterTimeOfDay();
    unregisterWind();
  };
}

/** Compile-time scatter record for a rule-driven scatter node. */
export interface ScatterCompileRecord {
  readonly node: AuraScatterNode;
  readonly planned: readonly ScatterInstance[];
}
export const scatterRecords = new Map<string, ScatterCompileRecord>();
export const grassRecords = new Map<string, AuraGrassNode>();
export const waterRecords = new Map<string, import("../world/water.js").WaterRecord>();
/** T6.2 records — resolved biome rig per node, for TimeOfDayRuntime/post lookup. */
export interface BiomeCompileRecord { readonly node: AuraBiomeNode; readonly rig: AuraBiomeRigDetail }
export const biomeRecords = new Map<string, BiomeCompileRecord>();
export const timeOfDayRecords = new Map<string, AuraTimeOfDayNode>();
export const windRecords = new Map<string, AuraWindNode>();

/** Pack planned instances → row-major mat3x4 (same layout as placements). */
function packScatterMatrices(instances: readonly ScatterInstance[]): Float32Array {
  const out = new Float32Array(instances.length * 12);
  instances.forEach((inst, i) => {
    const o = i * 12;
    const r = (inst.yawDeg * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    out[o] = c * inst.scale; out[o + 1] = 0; out[o + 2] = s * inst.scale; out[o + 3] = inst.x;
    out[o + 4] = 0; out[o + 5] = inst.scale; out[o + 6] = 0; out[o + 7] = inst.y;
    out[o + 8] = -s * inst.scale; out[o + 9] = 0; out[o + 10] = c * inst.scale; out[o + 11] = inst.z;
  });
  return out;
}

/** Listeners (e.g. providers) notified when an asset-sourced grid resolves. */
const readyListeners = new Set<(record: TerrainRecord) => void>();
export function onTerrainReady(cb: (record: TerrainRecord) => void): () => void {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}
export function markTerrainReady(record: TerrainRecord): void {
  for (const cb of readyListeners) cb(record);
}
