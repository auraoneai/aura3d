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

/** C-36 handler for `kind: "terrain"` (flag `A3D_QR_WORLD_TERRAIN`). */
export function registerWorldNodeHandlers(): () => void {
  return registerNodeHandler({
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
