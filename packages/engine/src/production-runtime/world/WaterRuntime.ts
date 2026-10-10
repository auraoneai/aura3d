/**
 * PRD-10 §8.6/§9.1 / T4.2–T4.5 — `WaterRuntime`: the Path S frame path for
 * `water` nodes.
 *
 * - `background`: `reflectionViewPass` per planar-requested water (§9.1 step
 *   2, <2% coverage skip), re-drawing reflection-layer items through the
 *   oblique-clipped mirror camera — currently the terrain node set (the only
 *   world item producer with reflection layers so far).
 * - `after-opaque`: `sceneCopyFallbackPass` publishes `prd10.scene.*.copy`.
 * - `transparent`: the water surface (blend on, depth write on per §9.1 step
 *   6) plus the §8.7 underwater shell when the camera is submerged.
 *
 * Grid geometry is generated per node: N×N quads covering the shape's world
 * extent; `a_shore` bakes the shore distance used by the §8.6 Low path.
 */
import type { RenderBuffer, RenderDevice, RenderPass, RenderPassContext, RenderShaderProgram, RenderTarget, UniformValue } from "@aura3d/rendering";
import { Sampler, Texture, TextureBinding, VertexFormat } from "@aura3d/rendering";
import type { FrameContributorContext, RenderItem } from "@aura3d/rendering/contracts";
import {
  PLANAR_REFLECTION_KEY,
  SCENE_COPY_COLOR_KEY,
  SCENE_COPY_DEPTH_KEY,
  UNDERWATER_KEY,
  planReflection,
  reflectionViewPass,
  sceneCopyFallbackPass,
  waterShaderSources,
  underwaterShaderSources,
  type ReflectionRequest
} from "@aura3d/rendering/world";
import { colorToRgba } from "../../agent-api/index.js";
import { resolveTierValue, terrainRecordIds } from "../../agent-api/world/terrain.js";
import { drawTerrainsForReflection } from "./TerrainRuntime.js";
import { waterRecordFor, waterRecordIds, type WaterRecord } from "../../agent-api/world/water.js";
import type { AuraWorldQualityTier } from "../../agent-api/world/types.js";

const WATER_FORMAT = new VertexFormat([
  { semantic: "position", components: 3, offset: 0, shaderName: "a_position" },
  { semantic: "uv", components: 1, offset: 12, shaderName: "a_shore" }
]);

const LINEAR = new Sampler({ minFilter: "linear", magFilter: "linear" });
const REPEAT = new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "repeat", addressV: "repeat" });

interface WaterGpuState {
  readonly record: WaterRecord;
  vb: RenderBuffer | null;
  ib: RenderBuffer | null;
  vertexCount: number;
  indexCount: number;
  extent: number;
  centerX: number;
  centerZ: number;
  normalTex: Texture | null;
  foamTex: Texture | null;
  causticTex: Texture | null;
}

interface WaterDeviceState {
  programs: Map<string, RenderShaderProgram>;
  gridCache: Map<string, { vb: RenderBuffer; ib: RenderBuffer; vertexCount: number; indexCount: number }>;
}

const deviceStates = new WeakMap<RenderDevice, WaterDeviceState>();
const gpuStates = new Map<string, WaterGpuState>();
let frameCtx: FrameContributorContext | null = null;

function deviceState(device: RenderDevice): WaterDeviceState {
  let s = deviceStates.get(device);
  if (!s) {
    s = { programs: new Map(), gridCache: new Map() };
    deviceStates.set(device, s);
  }
  return s;
}

/** GPU-state record per registered water node (lazily grid-built on draw). */
function waterState(id: string): WaterGpuState | null {
  const record = waterRecordFor(id);
  if (!record) return null;
  let st = gpuStates.get(id);
  if (!st || st.record !== record) {
    st = {
      record,
      vb: null, ib: null, vertexCount: 0, indexCount: 0,
      extent: shapeExtent(record), centerX: 0, centerZ: 0,
      normalTex: null, foamTex: null, causticTex: null
    };
    gpuStates.set(id, st);
  }
  return st;
}

export function allWaterStates(): WaterGpuState[] {
  const out: WaterGpuState[] = [];
  for (const id of waterRecordIds()) {
    const st = waterState(id);
    if (st) out.push(st);
  }
  return out;
}

/** Polygon edge samples for a shape (spline shapes degrade to their bbox). */
function shapePoints(record: WaterRecord): readonly (readonly [number, number])[] {
  const s = record.options.shape;
  if (s.kind === "polygon") return s.points;
  return [];
}

function shapeExtent(record: WaterRecord): number {
  const s = record.options.shape;
  if (s.kind === "infinite") return s.radius;
  if (s.kind === "circle") return s.radius * 2;
  if (s.kind === "spline") return Math.max(4, s.width * 8); // until world.spline lands
  const pts = shapePoints(record);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [px, pz] of pts) {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
  }
  return Math.max(maxX - minX, maxZ - minZ, 1);
}

function shapeCenter(record: WaterRecord): readonly [number, number] {
  const s = record.options.shape;
  if (s.kind === "circle") return s.center;
  if (s.kind === "infinite" || s.kind === "spline") return [0, 0];
  const pts = shapePoints(record);
  let sx = 0, sz = 0;
  for (const [px, pz] of pts) { sx += px; sz += pz; }
  return [sx / Math.max(1, pts.length), sz / Math.max(1, pts.length)];
}

/** Distance to the shape edge (m) for the §8.6 Low shore term. */
function shoreDistance(record: WaterRecord, x: number, z: number): number {
  const s = record.options.shape;
  if (s.kind === "infinite" || s.kind === "spline") return 8; // open water: always "deep"
  if (s.kind === "circle") return Math.max(0, s.radius - Math.hypot(x - s.center[0], z - s.center[1]));
  const pts = shapePoints(record);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]!;
    const [xj, zj] = pts[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (inside) return 8;
  let best = Infinity;
  for (const [px, pz] of pts) best = Math.min(best, Math.hypot(x - px, z - pz));
  return -Math.min(8, best);
}

/** Grid over the shape extent; `a_shore` = shoreDistance per vertex. */
function buildGrid(record: WaterRecord, res = 64): { vertices: Float32Array; indices: Uint32Array; extent: number; center: readonly [number, number] } {
  const extent = shapeExtent(record);
  const [cx, cz] = shapeCenter(record);
  const half = extent / 2;
  const verts = new Float32Array(res * res * 4);
  for (let r = 0; r < res; r += 1) {
    for (let c = 0; c < res; c += 1) {
      const x = -half + (c / (res - 1)) * extent;
      const z = -half + (r / (res - 1)) * extent;
      const o = (r * res + c) * 4;
      verts[o] = x;
      verts[o + 1] = 0;
      verts[o + 2] = z;
      verts[o + 3] = shoreDistance(record, x + cx, z + cz);
    }
  }
  const idx = new Uint32Array((res - 1) * (res - 1) * 6);
  let o = 0;
  for (let r = 0; r < res - 1; r += 1) {
    for (let c = 0; c < res - 1; c += 1) {
      const a = r * res + c, b = a + 1, d = a + res, e = d + 1;
      idx[o++] = a; idx[o++] = d; idx[o++] = b;
      idx[o++] = b; idx[o++] = d; idx[o++] = e;
    }
  }
  return { vertices: verts, indices: idx, extent, center: [cx, cz] };
}

function gridFor(device: RenderDevice, ds: WaterDeviceState, st: WaterGpuState): boolean {
  if (st.vb && st.ib) return true;
  const grid = buildGrid(st.record);
  st.vb = ds.gridCache.get(st.record.node.id)?.vb ?? device.createBuffer("vertex", grid.vertices.byteLength, grid.vertices);
  st.ib = ds.gridCache.get(st.record.node.id)?.ib ?? device.createBuffer("index", grid.indices.byteLength, grid.indices);
  ds.gridCache.set(st.record.node.id, { vb: st.vb, ib: st.ib, vertexCount: grid.vertices.length / 4, indexCount: grid.indices.length });
  st.vertexCount = grid.vertices.length / 4;
  st.indexCount = grid.indices.length;
  st.extent = grid.extent;
  [st.centerX, st.centerZ] = grid.center;
  return true;
}

// ---- procedural detail textures (§8.6 normal0/normal1, §8.7 foam/caustics)
// Deterministic small textures; the real atlases come from T5.7's bake.

function noiseTextureData(size: number, channel: 0 | 1): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + 1442695041) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      const v = (h >>> 0) / 4294967295;
      const i = (y * size + x) * 4;
      // normals live in xy as +-1 deviation; foam/caustics use R/G intensity
      out[i] = Math.round(255 * (0.5 + 0.5 * Math.sin(x * 0.9 + v * 6.28)));
      out[i + 1] = Math.round(255 * (0.5 + 0.5 * Math.sin(y * 0.7 + v * 4.1)));
      out[i + 2] = 255;
      out[i + 3] = 255;
    }
  }
  void channel;
  return out;
}

function detailTex(st: WaterGpuState, kind: "normal" | "foam" | "caustics"): Texture {
  const key = `prd10.water.${st.record.node.id}.${kind}`;
  const data = noiseTextureData(kind === "caustics" ? 256 : 128, 0);
  const t = new Texture({ width: kind === "caustics" ? 256 : 128, height: kind === "caustics" ? 256 : 128, format: "rgba8", colorSpace: "linear", label: key, data });
  if (kind === "normal") st.normalTex = t;
  else if (kind === "foam") st.foamTex = t;
  else st.causticTex = t;
  return t;
}

function programFor(device: RenderDevice, ds: WaterDeviceState, key: string, make: () => ReturnType<RenderDevice["createShaderProgram"]>): RenderShaderProgram | null {
  let p = ds.programs.get(key);
  if (p && !p.disposed) return p;
  try {
    p = make();
    ds.programs.set(key, p);
    return p;
  } catch {
    return null;
  }
}

function reflectionRequest(st: WaterGpuState, tier: AuraWorldQualityTier): ReflectionRequest | null {
  const mode = resolveTierValue<"ibl" | "ssr" | "planar">(st.record.options.reflection ?? { low: "ibl", medium: "ibl", high: "planar", ultra: "planar" }, tier);
  if (mode !== "planar") return null;
  return { waterId: st.record.node.id, planeY: st.record.height, extent: st.extent, layers: st.record.options.reflectionLayers ?? ["terrain", "kit", "hero"] };
}

function wantsRefraction(st: WaterGpuState, tier: AuraWorldQualityTier): boolean {
  return resolveTierValue<boolean>(st.record.options.refraction ?? { low: false, medium: true, high: true, ultra: true }, tier) ?? false;
}

/** §9.1 step 2 — planar reflections, before world opaque on Path S. */
export function waterBackgroundPasses(ctx: FrameContributorContext): readonly RenderPass[] {
  frameCtx = ctx;
  const tier = ((ctx.tier as { tier?: AuraWorldQualityTier }).tier ?? "high") as AuraWorldQualityTier;
  const out: RenderPass[] = [];
  for (const st of allWaterStates()) {
    const req = reflectionRequest(st, tier);
    if (!req) continue;
    out.push(reflectionViewPass(ctx, req, (device, mirrorVP, mirrorEye) => {
      // `reflectionLayers`-tagged producers re-draw through the mirror VP.
      // Terrain is the only producer wired so far; scatter/impostor layers
      // join when their Path S passes land.
      if (req.layers.includes("terrain")) {
        drawTerrainsForReflection(ctx, device, mirrorVP, mirrorEye);
      }
    }));
  }
  return out;
}

/** §9.1 step 5 — scene color/depth copies for refraction + shore foam. */
export function waterAfterOpaquePasses(ctx: FrameContributorContext): readonly RenderPass[] {
  const tier = ((ctx.tier as { tier?: AuraWorldQualityTier }).tier ?? "high") as AuraWorldQualityTier;
  const needs = allWaterStates().some((st) => wantsRefraction(st, tier));
  return needs ? [sceneCopyFallbackPass(ctx)] : [];
}

/** §9.1 step 6 + §8.7 — water surfaces and the underwater shell. */
export function waterTransparentPass(ctx: FrameContributorContext): RenderPass {
  const tier = ((ctx.tier as { tier?: AuraWorldQualityTier }).tier ?? "high") as AuraWorldQualityTier;
  const states = allWaterStates();
  // T0-33: declare a read only when its producer exists this frame — the
  // planar reflection pass and the scene copies are emitted only when a
  // state actually requests them, so reading them unconditionally threw
  // "reads X, but no pass writes it" and killed the frame loop. The opaque
  // read orders water after prd01.opaque on Path S (always emitted).
  const reads: string[] = ["aura.scene.color.opaque"];
  if (terrainRecordIds().length > 0) reads.push("prd10.terrain.color");
  if (states.some((st) => reflectionRequest(st, tier))) reads.push(PLANAR_REFLECTION_KEY);
  if (states.some((st) => wantsRefraction(st, tier))) reads.push(SCENE_COPY_COLOR_KEY, SCENE_COPY_DEPTH_KEY);
  return {
    name: "prd10.water",
    reads,
    writes: ["prd10.water.color"],
    execute(rp: RenderPassContext) {
      const device = rp.device;
      const camera = ctx.camera;
      const all = allWaterStates();
      if (!camera || all.length === 0) return;
      const ds = deviceState(device);
      const tier = ((ctx.tier as { tier?: AuraWorldQualityTier }).tier ?? "high") as AuraWorldQualityTier;
      const t = ctx.timeSeconds;
      const colorCopy = ctx.blackboard.get(SCENE_COPY_COLOR_KEY) as Texture | undefined;
      const depthCopy = ctx.blackboard.get(SCENE_COPY_DEPTH_KEY) as Texture | undefined;
      const planarTex = ctx.blackboard.get(PLANAR_REFLECTION_KEY) as Texture | undefined;
      const hasScene = Boolean(colorCopy && depthCopy);
      for (const st of all) {
        if (!gridFor(device, ds, st)) continue;
        const record = st.record;
        const underwater = camera.position[1] < record.height + 0 &&
          (record.options.underwater ?? (record.options.kind === "ocean" || record.options.kind === "lake"));
        ctx.blackboard.set(UNDERWATER_KEY, underwater);
        const reflectionMode = resolveTierValue<"ibl" | "ssr" | "planar">(record.options.reflection ?? { low: "ibl", medium: "ibl", high: "planar", ultra: "planar" }, tier) ?? "ibl";
        const mode = planarTex && reflectionMode === "planar" ? 2 : reflectionMode === "ssr" ? 1 : 0;
        const key = underwater ? "underwater" : `${hasScene ? 1 : 0}`;
        const program = programFor(device, ds, key, () =>
          device.createShaderProgram(
            underwater ? underwaterShaderSources() : waterShaderSources({ hasScene, planar: mode === 2 })
          ));
        if (!program) continue;
        st.normalTex ??= detailTex(st, "normal");
        st.foamTex ??= detailTex(st, "foam");
        st.causticTex ??= detailTex(st, "caustics");
        const w = record.waves;
        const opts = record.options;
        const shallow = opts.shallowColor ? colorToRgba(opts.shallowColor) : [0.29, 0.55, 0.62, 1] as const;
        const deep = opts.deepColor ? colorToRgba(opts.deepColor) : [0.02, 0.12, 0.2, 1] as const;
        const scatter = opts.scatterColor ? colorToRgba(opts.scatterColor) : [0.1, 0.35, 0.4, 1] as const;
        const absorption = opts.absorption ?? [0.45, 0.09, 0.06];
        const uniforms = new Map<string, UniformValue>([
          ["u_viewProjection", camera.viewProjectionMatrix],
          ["u_worldOffset", new Float32Array([st.centerX, 0, st.centerZ])],
          ["u_waterHeight", record.height],
          ["u_waves", w.waves],
          ["u_waveSpeed", w.waveSpeed],
          ["u_waveCount", w.waveCount],
          ["u_time", t],
          ["u_cameraPosition", new Float32Array([camera.position[0], camera.position[1], camera.position[2]])],
          ["u_viewport", new Float32Array([rp.width, rp.height])],
          ["u_near", camera.near ?? 0.1],
          ["u_far", camera.far ?? 1000],
          ["u_normal0", new TextureBinding({ name: "u_normal0", texture: st.normalTex, sampler: REPEAT })],
          ["u_normal1", new TextureBinding({ name: "u_normal1", texture: st.normalTex, sampler: REPEAT })],
          ["u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: depthCopy ?? st.foamTex, sampler: LINEAR })],
          ["u_sceneColor", new TextureBinding({ name: "u_sceneColor", texture: colorCopy ?? st.foamTex, sampler: LINEAR })],
          ["u_planarReflection", new TextureBinding({ name: "u_planarReflection", texture: planarTex ?? st.foamTex, sampler: LINEAR })],
          ["u_foam", new TextureBinding({ name: "u_foam", texture: st.foamTex, sampler: REPEAT })],
          ["u_causticAtlas", new TextureBinding({ name: "u_causticAtlas", texture: st.causticTex, sampler: REPEAT })],
          ["u_flow0", new Float32Array(opts.normalSpeed !== undefined ? [Math.cos((opts.flowDirectionDeg ?? 0) * Math.PI / 180) * opts.normalSpeed, Math.sin((opts.flowDirectionDeg ?? 0) * Math.PI / 180) * opts.normalSpeed] : [0.04, 0.02])],
          ["u_flow1", new Float32Array(opts.normalSpeed !== undefined ? [Math.cos((opts.flowDirectionDeg ?? 0) * Math.PI / 180) * opts.normalSpeed * 0.6, Math.sin((opts.flowDirectionDeg ?? 0) * Math.PI / 180) * opts.normalSpeed * 0.6] : [0.02, -0.015])],
          ["u_normalScale", opts.normalScale ?? 1],
          ["u_absorption", new Float32Array(absorption)],
          ["u_scatterColor", new Float32Array([scatter[0]!, scatter[1]!, scatter[2]!])],
          ["u_deepColor", new Float32Array([deep[0]!, deep[1]!, deep[2]!])],
          ["u_shallowColor", new Float32Array([shallow[0]!, shallow[1]!, shallow[2]!])],
          ["u_refractionStrength", 0.05],
          ["u_reflectionMode", mode],
          ["u_reflectionDistort", 0.02],
          ["u_foamShoreDepth", opts.foam?.shoreDepth ?? 1.5],
          ["u_foamCrest", opts.foam?.crest ?? 0.6],
          ["u_causticScale", 2.0],
          ["u_causticStrength", opts.caustics === false ? 0 : 0.6],
          ["u_sunDirection", new Float32Array([0.42, -0.9, 0.18])],
          ["u_sunColor", new Float32Array([1.4, 1.35, 1.25])],
          ["u_skyHorizonColor", new Float32Array([0.5, 0.7, 0.9])],
          ["u_shIrradiance", new Float32Array(27)],
          ["u_fogColor", new Float32Array([0.6, 0.72, 0.85])],
          ["u_fogNearFar", new Float32Array([200, 1200])],
          ["u_ambientSH", new Float32Array([0.25, 0.28, 0.32])],
          ["u_surfaceColor", new Float32Array([0.165, 0.561, 0.69])],  // #2a8fb0
          ["u_deepGradient", new Float32Array([0.008, 0.063, 0.094])]  // #021018
        ]);
        device.draw({
          label: `prd10.water.${record.node.id}`,
          topology: "triangles",
          renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: underwater ? "front" : "back", blend: !underwater },
          vertexBuffer: st.vb!,
          vertexFormat: WATER_FORMAT,
          vertexCount: st.vertexCount,
          indexBuffer: st.ib!,
          indexType: "uint32",
          indexCount: st.indexCount,
          shader: program,
          uniforms
        });
      }
    }
  };
}

/** Caustics/light queries for diagnostics. */
export function prd10WaterCount(): number {
  return waterRecordIds().length;
}

/** Lane-internal: keep for parity with frameCtx usage in future phases. */
export function waterFrameContext(): FrameContributorContext | null {
  return frameCtx;
}
