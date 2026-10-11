/**
 * PRD-10 T2.7 — Path S terrain frame pass. Draws every registered
 * `world.terrain` node as CDLOD patch instances in the `background` phase
 * (after EnvironmentBackgroundPass; depth-tested so it composes with the sky).
 *
 * GPU state is built lazily per RenderDevice and when a terrain's grid first
 * resolves. The height texture uploads as `rgba32f` (the device's only float
 * texture format — `texelFetch().r` semantics match the §8.1 R32F contract).
 */
import type { RenderBuffer, RenderDevice, RenderShaderProgram, UniformValue } from "@aura3d/rendering";
import { Sampler, Texture, TextureBinding, VertexFormat } from "@aura3d/rendering";
import type { FrameContributorContext } from "@aura3d/rendering/contracts";
import type { RenderPass, RenderPassContext } from "@aura3d/rendering";
import { ENVIRONMENT_BACKGROUND_COLOR_RESOURCE } from "@aura3d/rendering";
import {
  bakeTerrainSplat,
  buildCdlodTree,
  cdlodRanges,
  createTerrainPatchGeometry,
  selectCdlodNodes,
  TERRAIN_TIER_LOD,
  terrainMacroNormal,
  type CdlodRange,
  type CdlodTree,
  type SplatBakeResult
} from "@aura3d/rendering/world";
import { TERRAIN_FRAG_GLSL, TERRAIN_VERT_GLSL } from "@aura3d/rendering/world";
import {
  evalSplatRules,
  defaultSplatRules,
  isHoleAt,
  resolveTierValue,
  terrainRecordFor,
  terrainRecordIds,
  type TerrainRecord
} from "../../agent-api/world/terrain.js";
import type { AuraWorldQualityTier } from "../../agent-api/world/types.js";
import { tierForSettings } from "./WorldFramePasses.js";

const PATCH_FORMAT = new VertexFormat([
  { semantic: "uv", components: 2, offset: 0, shaderName: "a_grid" }
]);

const NEAREST = new Sampler({ minFilter: "nearest", magFilter: "nearest" });
const LINEAR = new Sampler({ minFilter: "linear", magFilter: "linear" });

interface TerrainGpuState {
  readonly record: TerrainRecord;
  /** Non-null when the GPU bake produced the maps (keeps bake RTs alive). */
  readonly gpuBake: SplatBakeResult | null;
  readonly patchN: number;
  readonly vertexCount: number;
  readonly tree: CdlodTree;
  readonly ranges: readonly CdlodRange[];
  readonly patchVB: RenderBuffer;
  readonly patchIB: RenderBuffer;
  readonly indexCount: number;
  readonly indexType: "uint16" | "uint32";
  readonly instBuf: RenderBuffer;
  readonly instCap: number;
  readonly heightTex: Texture;
  readonly splatTex0: Texture;
  readonly splatTex1: Texture | null;
  readonly holesTex: Texture;
  readonly macroTex: Texture;
  readonly layerParams: Float32Array;
  readonly layerTintOrm: Float32Array;
  readonly morph: Float32Array;
  readonly layerCount: number;
  /** Height-grid revision baked into `heightTex`; conformToTerrain bumps it. */
  readonly gridVersion: number;
}

interface DeviceTerrainState {
  program: RenderShaderProgram | null;
  /**
   * T0-33 FIX-compile-cache: set after the first failed compile on this device.
   * A failing terrain shader is compiled once per device, never once per frame.
   */
  programFailure: string | null;
  patchCache: Map<number, { vb: RenderBuffer; ib: RenderBuffer; vertexCount: number; indexCount: number; indexType: "uint16" | "uint32" }>;
  terrains: Map<string, TerrainGpuState>;
}

const deviceStates = new WeakMap<RenderDevice, DeviceTerrainState>();

function deviceState(device: RenderDevice): DeviceTerrainState {
  let s = deviceStates.get(device);
  if (!s) {
    s = { program: null, programFailure: null, patchCache: new Map(), terrains: new Map() };
    deviceStates.set(device, s);
  }
  return s;
}

function heightsToRgba32f(record: TerrainRecord): Float32Array {
  const g = record.grid!;
  const out = new Float32Array(g.heights.length * 4);
  for (let i = 0; i < g.heights.length; i += 1) {
    out[i * 4] = g.heights[i]!;
  }
  return out;
}

function slopeDegAt(record: TerrainRecord, u: number, v: number): number {
  const g = record.grid!;
  const texel = (record.size[0] / Math.max(1, g.columns - 1) + record.size[1] / Math.max(1, g.rows - 1)) / 2;
  const [, ny] = terrainMacroNormal(g, [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))], texel, record.heightScale);
  return (Math.acos(Math.min(1, Math.max(-1, ny))) * 180) / Math.PI;
}

/** AuraSplatRule (name-keyed) → indexed SplatBakeRule for the GPU bake. */
function splatBakeRulesFor(record: TerrainRecord): { readonly layer: number; readonly weight: number; readonly slopeDeg?: readonly [number, number]; readonly height?: readonly [number, number]; readonly falloff?: number; readonly noise?: { readonly scale: number; readonly threshold: number; readonly seed?: number } }[] {
  const layers = record.options.layers;
  const names = layers.map((l) => l.name);
  const rules = record.options.splat?.kind === "auto" ? record.options.splat.rules : defaultSplatRules(layers);
  const out: ReturnType<typeof splatBakeRulesFor> = [];
  for (const r of rules) {
    const layer = names.indexOf(r.layer);
    if (layer < 0 || layer >= 8) continue; // unknown/over-8 layers can't map to a channel
    out.push({ layer, weight: r.weight ?? 1, slopeDeg: r.slopeDeg, height: r.height, falloff: r.falloff, noise: r.noise });
  }
  return out;
}

/** CPU splat bake — the same formula the GPU SplatBake runs (±1/255), so Path S starts honest. */
function bakeSplat(record: TerrainRecord, res: number): { readonly tex0: Uint8Array; readonly tex1: Uint8Array | null } {
  const g = record.grid!;
  const layers = record.options.layers;
  const rules = record.options.splat?.kind === "auto" ? record.options.splat.rules : defaultSplatRules(layers);
  const tex0 = new Uint8Array(res * res * 4);
  const tex1 = layers.length > 4 ? new Uint8Array(res * res * 4) : null;
  const names = layers.map((l) => l.name);
  for (let r = 0; r < res; r += 1) {
    for (let c = 0; c < res; c += 1) {
      const u = c / Math.max(1, res - 1);
      const v = r / Math.max(1, res - 1);
      const gx = Math.min(g.columns - 1, Math.round(u * (g.columns - 1)));
      const gy = Math.min(g.rows - 1, Math.round(v * (g.rows - 1)));
      const hNorm = g.heights[gy * g.columns + gx]!;
      const weights = evalSplatRules(rules, layers, { slopeDeg: slopeDegAt(record, u, v), heightNorm: hNorm, u, v });
      const o = (r * res + c) * 4;
      for (let i = 0; i < Math.min(4, layers.length); i += 1) tex0[o + i] = Math.round(255 * (weights[names[i]!] ?? 0));
      if (tex1) {
        for (let i = 4; i < Math.min(8, layers.length); i += 1) tex1[o + i - 4] = Math.round(255 * (weights[names[i]!] ?? 0));
      }
    }
  }
  return { tex0, tex1 };
}

function bakeHoles(record: TerrainRecord, res: number): Uint8Array {
  const data = new Uint8Array(res * res * 4);
  for (let r = 0; r < res; r += 1) {
    for (let c = 0; c < res; c += 1) {
      const u = c / Math.max(1, res - 1);
      const v = r / Math.max(1, res - 1);
      const hole = isHoleAt(record, record.origin[0] + u * record.size[0], record.origin[2] + v * record.size[1]);
      const o = (r * res + c) * 4;
      data[o] = hole ? 0 : 255;
      data[o + 3] = 255;
    }
  }
  return data;
}

function macroVariationTexture(res = 256): Uint8Array {
  const data = new Uint8Array(res * res * 4);
  let s = 0x9e3779b9;
  for (let i = 0; i < res * res; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    const v = (s >>> 8) & 0xff;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

const LAYER_TINTS: Record<string, readonly [number, number, number]> = {
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

function layerTint(name: string, tint: string | undefined): readonly [number, number, number] {
  if (tint && /^#[0-9a-fA-F]{6}$/.test(tint)) {
    return [
      parseInt(tint.slice(1, 3), 16) / 255,
      parseInt(tint.slice(3, 5), 16) / 255,
      parseInt(tint.slice(5, 7), 16) / 255
    ];
  }
  return LAYER_TINTS[name] ?? [0.35, 0.35, 0.35];
}

function buildTerrainState(device: RenderDevice, ds: DeviceTerrainState, record: TerrainRecord, tier: AuraWorldQualityTier): TerrainGpuState | null {
  const grid = record.grid;
  if (!grid) return null;
  const patchN = resolveTierValue(record.options.lod?.patchSize ?? TERRAIN_TIER_LOD.patchSize, tier) as 32 | 64;
  const levels = resolveTierValue(record.options.lod?.levels ?? TERRAIN_TIER_LOD.levels, tier);
  let patch = ds.patchCache.get(patchN);
  if (!patch) {
    const geo = createTerrainPatchGeometry(patchN);
    patch = {
      vb: device.createBuffer("vertex", geo.vertices.byteLength, geo.vertices),
      ib: device.createBuffer("index", geo.indices.byteLength, geo.indices),
      vertexCount: geo.vertexCount,
      indexCount: geo.indices.length,
      indexType: geo.indices instanceof Uint16Array ? "uint16" : "uint32"
    };
    ds.patchCache.set(patchN, patch);
  }
  const tree = buildCdlodTree(grid, record.size, [record.origin[0], record.origin[2]], levels);
  const morphRatio = record.options.lod?.morphRatio ?? 0.33;
  const ranges = cdlodRanges(levels, tree.leafSize, 1, morphRatio);
  const morph = new Float32Array(16);
  for (const r of ranges) {
    morph[r.lod * 2] = r.morphStart;
    morph[r.lod * 2 + 1] = r.morphEnd;
  }
  const splatRes = 256;
  const { tex0, tex1 } = bakeSplat(record, splatRes); // CPU fallback (kept — also feeds tests)
  const instBuf = device.createBuffer("vertex", tree.all.length * 16);
  const layerParams = new Float32Array(32);
  const layerTintOrm = new Float32Array(32);
  const layerCount = Math.min(8, record.options.layers.length);
  record.options.layers.forEach((layer, i) => {
    if (i >= 8) return;
    layerParams[i * 4] = layer.uvScale ?? 8;
    layerParams[i * 4 + 1] = layer.triplanar ? 1 : 0;
    layerParams[i * 4 + 2] = layer.heightBlend ?? 1;
    layerParams[i * 4 + 3] = layerCount;
    const tint = layerTint(layer.name, layer.tint);
    layerTintOrm[i * 4] = tint[0];
    layerTintOrm[i * 4 + 1] = tint[1];
    layerTintOrm[i * 4 + 2] = tint[2];
    layerTintOrm[i * 4 + 3] = layer.roughnessBias ?? 0;
  });
  const heightTex = new Texture({
    width: grid.columns,
    height: grid.rows,
    format: "rgba32f",
    colorSpace: "linear",
    label: `prd10.terrain.${record.node.id}.height`,
    data: heightsToRgba32f(record)
  });
  // T2.5: GPU bake when the device supports offscreen targets; CPU map is the
  // fallback (same evalSplatRules formula, ±1/255).
  let gpuBake: SplatBakeResult | null = null;
  let splatTex0 = new Texture({ width: splatRes, height: splatRes, format: "rgba8", colorSpace: "linear", label: `prd10.terrain.${record.node.id}.splat0`, data: tex0 });
  let splatTex1 = tex1 ? new Texture({ width: splatRes, height: splatRes, format: "rgba8", colorSpace: "linear", label: `prd10.terrain.${record.node.id}.splat1`, data: tex1 }) : null;
  try {
    const bake = bakeTerrainSplat(device, {
      heightTexture: heightTex,
      heightTexSize: [grid.columns, grid.rows],
      texelWorld: (record.size[0] / Math.max(1, grid.columns - 1) + record.size[1] / Math.max(1, grid.rows - 1)) / 2,
      heightScale: record.heightScale,
      resolution: splatRes,
      layerCount,
      rules: splatBakeRulesFor(record)
    });
    gpuBake = bake;
    splatTex0.dispose();
    splatTex1?.dispose();
    splatTex0 = bake.splat0;
    splatTex1 = bake.splat1;
  } catch {
    // device without offscreen-target support (or compile failure) -> CPU maps stay
  }
  const state: TerrainGpuState = {
    record,
    gpuBake,
    patchN,
    vertexCount: patch.vertexCount,
    tree,
    ranges,
    patchVB: patch.vb,
    patchIB: patch.ib,
    indexCount: patch.indexCount,
    indexType: patch.indexType,
    instBuf,
    instCap: tree.all.length,
    heightTex,
    splatTex0,
    splatTex1,
    holesTex: new Texture({ width: 256, height: 256, format: "rgba8", colorSpace: "linear", label: `prd10.terrain.${record.node.id}.holes`, data: bakeHoles(record, 256) }),
    macroTex: new Texture({ width: 256, height: 256, format: "rgba8", colorSpace: "linear", label: "prd10.macroVariation", data: macroVariationTexture() }),
    layerParams,
    layerTintOrm,
    morph,
    layerCount,
    gridVersion: record.gridVersion ?? 0
  };
  ds.terrains.set(record.node.id, state);
  return state;
}

/** True when at least one registered terrain has a resolved height grid (something to draw). */
function hasDrawableTerrain(): boolean {
  return terrainRecordIds().some((id) => terrainRecordFor(id)?.grid != null);
}

/**
 * T0-33 FIX-compile-cache: the terrain program, cached per device. Compiles
 * lazily (only once a terrain can draw) and at most once per device after a
 * failure; the failure is kept in `ds.programFailure` instead of retrying the
 * compile every frame. A disposed program (device reset) is rebuilt.
 */
function terrainProgram(device: RenderDevice, ds: DeviceTerrainState): RenderShaderProgram | null {
  if (ds.program && !ds.program.disposed) return ds.program;
  ds.program = null;
  if (ds.programFailure !== null || !hasDrawableTerrain()) return null;
  try {
    ds.program = device.createShaderProgram({
      label: "prd10.terrain",
      vertex: TERRAIN_VERT_GLSL,
      fragment: TERRAIN_FRAG_GLSL,
      marker: "prd10.terrain"
    });
  } catch (error) {
    ds.programFailure = error instanceof Error ? error.message : String(error);
  }
  return ds.program; // null on failure -> nothing drawn; degraded surfaces in diagnostics
}

/** Terrain program state for a device (diagnostics and tests). */
export function terrainProgramStatus(device: RenderDevice): { readonly compiled: boolean; readonly failure: string | null } {
  const ds = deviceStates.get(device);
  return { compiled: !!ds?.program && !ds.program.disposed, failure: ds?.programFailure ?? null };
}

/** C-27 lodBias arrives with PRD 05's tier settings; read it when present. */
function lodBiasOf(ctx: FrameContributorContext): number {
  const tier = ctx.tier as unknown as { lodBias?: number };
  return typeof tier.lodBias === "number" && tier.lodBias > 0 ? tier.lodBias : 1;
}

/**
 * Draws every registered terrain with the given view-projection. Shared by the
 * `background` pass (main camera VP) and the §9.1 planar-reflection re-draw
 * (oblique-clipped mirror VP, `viewPosition` = mirror eye).
 */
export function drawTerrains(
  ctx: FrameContributorContext,
  device: RenderDevice,
  ds: DeviceTerrainState,
  camera: { position: readonly [number, number, number] },
  viewProjection: Float32Array
): void {
  const tier = tierForSettings(ctx.tier);
  const lodBias = lodBiasOf(ctx);
  for (const id of terrainRecordIds()) {
    const record = terrainRecordFor(id);
    if (!record?.grid) continue;
    let st = ds.terrains.get(id);
    if (st && st.gridVersion !== (record.gridVersion ?? 0)) {
      // conformToTerrain edited `record.grid` after the last upload — rebuild.
      st.heightTex.dispose();
      st.splatTex0.dispose();
      st.splatTex1?.dispose();
      st.holesTex.dispose();
      st.macroTex.dispose();
      st.instBuf.dispose();
      ds.terrains.delete(id);
      st = undefined;
    }
    if (!st) {
      st = buildTerrainState(device, ds, record, tier) ?? undefined;
      if (!st) continue;
    }
    const ranges = lodBias === 1 ? st.ranges : cdlodRanges(st.ranges.length, st.tree.leafSize, lodBias, record.options.lod?.morphRatio ?? 0.33);
    const nodes = selectCdlodNodes(st.tree, camera.position, ranges, {});
    if (nodes.length === 0 || nodes.length > st.instCap) continue;
    const inst = new Float32Array(nodes.length * 4);
    nodes.forEach((n: (typeof nodes)[number], i: number) => {
      inst[i * 4] = n.origin[0];
      inst[i * 4 + 1] = n.origin[1];
      inst[i * 4 + 2] = n.size;
      inst[i * 4 + 3] = n.level;
    });
    device.updateBuffer(st.instBuf, 0, inst);
    const uniforms = new Map<string, UniformValue>([
      ["u_height", new TextureBinding({ name: "u_height", texture: st.heightTex, sampler: NEAREST })],
      ["u_splat0", new TextureBinding({ name: "u_splat0", texture: st.splatTex0, sampler: LINEAR })],
      ["u_splat1", new TextureBinding({ name: "u_splat1", texture: st.splatTex1 ?? st.splatTex0, sampler: LINEAR })],
      ["u_holes", new TextureBinding({ name: "u_holes", texture: st.holesTex, sampler: LINEAR })],
      ["u_macroVariation", new TextureBinding({ name: "u_macroVariation", texture: st.macroTex, sampler: LINEAR })],
      ["u_terrain", new Float32Array([record.origin[0], record.origin[2], record.size[0], record.size[1]])],
      ["u_heightScale", record.heightScale],
      ["u_heightTexSize", new Float32Array([record.grid.columns, record.grid.rows])],
      ["u_morph", st.morph],
      ["u_gridDim", st.patchN],
      ["u_viewProjection", viewProjection],
      ["u_cameraPosition", new Float32Array([camera.position[0], camera.position[1], camera.position[2]])],
      ["u_terrainWorldSize", Math.min(record.size[0], record.size[1])],
      ["u_terrainHeightScale", record.heightScale],
      ["u_layerCount", st.layerCount],
      ["u_solidMode", 1],
      ["u_layerParams", st.layerParams],
      ["u_layerTintOrm", st.layerTintOrm],
      ["u_ambient", new Float32Array([0.25, 0.28, 0.32])],
      ["u_keyLightDir", new Float32Array([0.42, -0.9, 0.18])],
      ["u_keyLightColor", new Float32Array([1.4, 1.35, 1.25])]
    ]);
    device.draw({
      label: `prd10.terrain.${id}`,
      topology: "triangles",
      renderState: { depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal" },
      vertexBuffer: st.patchVB,
      vertexFormat: PATCH_FORMAT,
      vertexCount: st.vertexCount,
      indexBuffer: st.patchIB,
      indexType: st.indexType,
      indexCount: st.indexCount,
      instanceCount: nodes.length,
      instanceAttributes: [
        { buffer: st.instBuf, shaderName: "a_node", components: 4, offset: 0, stride: 16, divisor: 1 }
      ],
      shader: ds.program!,
      uniforms
    });
  }
}

/**
 * §9.1 step 2 — terrain re-draw for a planar water reflection. Called from
 * `WaterRuntime`'s `reflectionViewPass` render callback while the reflection
 * target is bound; CDLOD selects against the mirror eye.
 */
export function drawTerrainsForReflection(ctx: FrameContributorContext, device: RenderDevice, mirrorViewProjection: Float32Array, mirrorEye: readonly [number, number, number]): void {
  const ds = deviceState(device);
  if (!terrainProgram(device, ds)) return;
  drawTerrains(ctx, device, ds, { position: mirrorEye }, mirrorViewProjection);
}

/**
 * The Path S terrain pass for the `background` phase. Selects CDLOD nodes for
 * the camera and issues one instanced draw per terrain (patch geometry shared
 * per patch size across terrains on the device).
 */
export function terrainBackgroundPass(ctx: FrameContributorContext): RenderPass {
  return {
    name: "prd10.terrain",
    // T0-33: the `background` phase only runs when an EnvironmentBackgroundPass
    // exists, so this read always has a producer and orders terrain after it.
    // Unique write name — two passes may not both write "color".
    reads: [ENVIRONMENT_BACKGROUND_COLOR_RESOURCE],
    writes: ["prd10.terrain.color"],
    execute(rp: RenderPassContext) {
      const device = rp.device;
      const ds = deviceState(device);
      if (!terrainProgram(device, ds)) return;
      const camera = ctx.camera;
      if (!camera) return;
      drawTerrains(ctx, device, ds, camera, camera.viewProjectionMatrix);
    }
  };
}
