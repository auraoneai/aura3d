/**
 * PRD-10 T3.7 §8.5 — `GrassRuntime`: the Path S frame pass for `grass` nodes.
 * Per frame it rebuilds the 8 m chunk ring around the camera
 * (`grassChunkRing`) and issues one instanced draw per chunk with the
 * `a3d_prd10_grass` vertex program (stratified jitter hash per
 * `gl_InstanceID`, quadratic Bézier blade, density falloff) plus the frozen
 * `a3d_prd10_wind` deform and terrain `heightBilinear` root placement.
 *
 * Tier behaviour (§7.1.5 defaults): blades on Medium+, cards on Low when the
 * tier density is 0. Chunk state is a per-draw uniform — no instance buffers.
 */
import type {
  RenderBuffer,
  RenderDevice,
  RenderPass,
  RenderPassContext,
  RenderShaderProgram,
  UniformValue
} from "@aura3d/rendering";
import { Sampler, Texture, TextureBinding, VertexFormat } from "@aura3d/rendering";
import type { FrameContributorContext } from "@aura3d/rendering/contracts";
import {
  GRASS_CHUNK_SIZE,
  grassBladeIndices,
  grassBladeVertices,
  grassCardVertices,
  grassChunkRing,
  a3d_prd10_grass,
  a3d_prd10_wind,
  type GrassChunkDraw
} from "@aura3d/rendering/world";
import { colorToRgba } from "../../agent-api/index.js";
import { resolveTierValue, terrainRecordFor, type TerrainRecord } from "../../agent-api/world/terrain.js";
import type { AuraGrassNode, AuraGrassOptions } from "../../agent-api/world/scatter.js";
import type { AuraWorldQualityTier } from "../../agent-api/world/types.js";

const GRASS_VERT_GLSL = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_blade; // [t, side]
uniform mat4 u_viewProjection;
uniform vec3 u_cameraPosition;
uniform vec4 u_grassChunk;   // originXZ, size, seed
uniform int u_grassBladeCount;
uniform float u_grassRadius;
uniform float u_grassBladeHeight;
uniform float u_grassBladeWidth;
uniform vec4 u_terrain;      // terrain originXZ + size
uniform float u_heightScale;
uniform vec2 u_heightTexSize;
uniform sampler2D u_height;
uniform vec4 u_windDirStrength;
uniform vec4 u_windGust;
uniform vec4 u_windDetail;
uniform float u_windTurbulence;
uniform vec4 u_grassColor;   // base rgb + tipMix
uniform vec3 u_tipColor;
${a3d_prd10_grass.glsl}
${a3d_prd10_wind.glsl}
out vec3 v_color;
out float v_t;
float heightBilinear(vec2 xz) {
  vec2 uv = (xz - u_terrain.xy) / u_terrain.zw;
  vec2 tc = uv * (u_heightTexSize - 1.0);
  vec2 f = fract(tc);
  ivec2 i0 = ivec2(floor(tc));
  ivec2 sz = ivec2(u_heightTexSize);
  float h00 = texelFetch(u_height, clamp(i0, ivec2(0), sz - 1), 0).r;
  float h10 = texelFetch(u_height, clamp(i0 + ivec2(1, 0), ivec2(0), sz - 1), 0).r;
  float h01 = texelFetch(u_height, clamp(i0 + ivec2(0, 1), ivec2(0), sz - 1), 0).r;
  float h11 = texelFetch(u_height, clamp(i0 + ivec2(1, 1), ivec2(0), sz - 1), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) * u_heightScale;
}
void main() {
  int instance = gl_InstanceID;
  if (instance >= u_grassBladeCount) { gl_Position = vec4(0.0); return; }
  float yaw; float height; float bend; float phase;
  vec3 root = a3dGrassBladeRoot(instance, yaw, height, bend, phase);
  root.y = heightBilinear(root.xz);
  vec3 p = a3dGrassBladeVertex(root, yaw, height, bend, a_blade.x, a_blade.y);
  // wind: tip-weighted bend only (weights = bend,flutter,phase)
  vec4 weights = vec4(a_blade.x * a_blade.x, a_blade.x * 0.4, phase, 0.0);
  vec3 local = p - root;
  p += a3dWindOffset(local, root, weights, height);
  v_t = a_blade.x;
  v_color = mix(u_grassColor.rgb, u_tipColor, a_blade.x * u_grassColor.a);
  gl_Position = u_viewProjection * vec4(p, 1.0);
}
`;

const GRASS_CARD_VERT_GLSL = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_quad; // [-1..1, 0..1]
uniform mat4 u_viewProjection;
uniform vec3 u_cameraPosition;
uniform vec4 u_grassChunk;
uniform int u_grassBladeCount;
uniform float u_grassRadius;
uniform float u_grassBladeHeight;
uniform float u_grassBladeWidth;
uniform vec4 u_terrain;
uniform float u_heightScale;
uniform vec2 u_heightTexSize;
uniform sampler2D u_height;
uniform vec4 u_windDirStrength;
uniform vec4 u_windGust;
uniform vec4 u_windDetail;
uniform float u_windTurbulence;
uniform vec4 u_grassColor;
uniform vec3 u_tipColor;
${a3d_prd10_grass.glsl}
${a3d_prd10_wind.glsl}
out vec3 v_color;
out vec2 v_uv;
float heightBilinear(vec2 xz) {
  vec2 uv = (xz - u_terrain.xy) / u_terrain.zw;
  vec2 tc = uv * (u_heightTexSize - 1.0);
  vec2 f = fract(tc);
  ivec2 i0 = ivec2(floor(tc));
  ivec2 sz = ivec2(u_heightTexSize);
  float h00 = texelFetch(u_height, clamp(i0, ivec2(0), sz - 1), 0).r;
  float h10 = texelFetch(u_height, clamp(i0 + ivec2(1, 0), ivec2(0), sz - 1), 0).r;
  float h01 = texelFetch(u_height, clamp(i0 + ivec2(0, 1), ivec2(0), sz - 1), 0).r;
  float h11 = texelFetch(u_height, clamp(i0 + ivec2(1, 1), ivec2(0), sz - 1), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) * u_heightScale;
}
void main() {
  int instance = gl_InstanceID;
  if (instance >= u_grassBladeCount) { gl_Position = vec4(0.0); return; }
  float yaw; float height; float bend; float phase;
  vec3 root = a3dGrassBladeRoot(instance, yaw, height, bend, phase);
  root.y = heightBilinear(root.xz);
  // camera-facing card at the root
  vec3 fwd = normalize(vec3(u_cameraPosition.x - root.x, 0.0, u_cameraPosition.z - root.z));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 p = root + right * (a_quad.x * u_grassBladeWidth * 3.0) + vec3(0.0, a_quad.y * height, 0.0);
  vec4 weights = vec4(a_quad.y * a_quad.y, a_quad.y * 0.4, phase, 0.0);
  p += a3dWindOffset(p - root, root, weights, height);
  v_uv = a_quad;
  v_color = mix(u_grassColor.rgb, u_tipColor, a_quad.y * u_grassColor.a);
  gl_Position = u_viewProjection * vec4(p, 1.0);
}
`;

const GRASS_FRAG_GLSL = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_color;
in float v_t;
in vec2 v_uv;
out vec4 o_color;
void main() {
  float ao = mix(0.45, 1.0, v_t);         // root->tip ambient occlusion
  o_color = vec4(v_color * ao, 1.0);
}
`;

const GRASS_CARD_FRAG_GLSL = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_color;
in vec2 v_uv;
out vec4 o_color;
void main() {
  // card alpha: taper to a point at the top, alpha-tested
  float w = 1.0 - v_uv.y;
  if (abs(v_uv.x) > w) discard;
  float ao = mix(0.45, 1.0, v_uv.y);
  o_color = vec4(v_color * ao, 1.0);
}
`;

const BLADE_FORMAT = new VertexFormat([{ semantic: "uv", components: 2, offset: 0, shaderName: "a_blade" }]);
const CARD_FORMAT = new VertexFormat([{ semantic: "uv", components: 2, offset: 0, shaderName: "a_quad" }]);

interface GrassNodeState {
  readonly node: AuraGrassNode;
  readonly record: TerrainRecord;
  bladeVB: RenderBuffer | null;
  bladeIB: RenderBuffer | null;
  cardVB: RenderBuffer | null;
  heightTex: Texture | null;
}

interface GrassDeviceState {
  blades: RenderShaderProgram | null;
  cards: RenderShaderProgram | null;
  heightTexByTerrain: Map<string, Texture>;
}

const deviceStates = new WeakMap<RenderDevice, GrassDeviceState>();
const nodes = new Map<string, GrassNodeState>();
let windUbo: Float32Array = Float32Array.from([1, 0, 0.3, 0, 0.4, 0.02, 0, 0]);
let windTurbulence = 0.1;

function stateFor(device: RenderDevice): GrassDeviceState {
  let s = deviceStates.get(device);
  if (!s) {
    s = { blades: null, cards: null, heightTexByTerrain: new Map() };
    deviceStates.set(device, s);
  }
  return s;
}

/** Register a grass node against its terrain record (called by the C-36 handler). */
export function registerGrassNode(node: AuraGrassNode): boolean {
  const record = terrainRecordFor(node.options.terrain.id);
  if (!record) return false;
  nodes.set(node.id, { node, record, bladeVB: null, bladeIB: null, cardVB: null, heightTex: null });
  return true;
}

export function unregisterGrassNode(id: string): void {
  const st = nodes.get(id);
  if (!st) return;
  st.bladeVB?.dispose();
  st.bladeIB?.dispose();
  st.cardVB?.dispose();
  nodes.delete(id);
}

/** Point the shared wind uniforms at the scene wind (from world.wind). */
export function setGrassWind(ubo: Float32Array, turbulence: number): void {
  windUbo = ubo;
  windTurbulence = turbulence;
}

const LINEAR = new Sampler({ magFilter: "linear", minFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
const NEAREST = new Sampler({ magFilter: "nearest", minFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });

function heightTexture(ds: GrassDeviceState, record: TerrainRecord): Texture | null {
  const key = record.node.id;
  let t = ds.heightTexByTerrain.get(key);
  if (t) return t;
  const g = record.grid;
  if (!g) return null;
  const out = new Float32Array(g.heights.length * 4);
  for (let i = 0; i < g.heights.length; i += 1) out[i * 4] = g.heights[i]!;
  t = new Texture({ width: g.columns, height: g.rows, format: "rgba32f", colorSpace: "linear", label: `prd10.grass.${key}.height`, data: out });
  ds.heightTexByTerrain.set(key, t);
  return t;
}

function tierOpts(node: AuraGrassNode, tier: string): { radius: number; density: number; bladeHeight: number; bladeWidth: number } {
  const o = node.options as AuraGrassOptions;
  return {
    radius: resolveTierValue<number>(o.radius ?? { low: 15, medium: 30, high: 45, ultra: 60 }, tier as AuraWorldQualityTier) ?? 30,
    density: resolveTierValue<number>(o.density ?? { low: 0, medium: 10, high: 20, ultra: 32 }, tier as AuraWorldQualityTier) ?? 0,
    bladeHeight: o.bladeHeight?.[1] ?? 0.42,
    bladeWidth: o.bladeWidth ?? 0.035
  };
}

/** The Path S grass pass — registered on the world frame contributor. */
export function grassOpaquePass(ctx: FrameContributorContext): RenderPass {
  return {
    name: "prd10.grass",
    reads: [],
    writes: ["color"],
    execute(rp: RenderPassContext) {
      const device = rp.device;
      const camera = ctx.camera;
      if (!camera || nodes.size === 0) return;
      const ds = stateFor(device);
      const tier = ((ctx.tier as { tier?: AuraWorldQualityTier }).tier ?? "high") as AuraWorldQualityTier;
      for (const st of nodes.values()) {
        const o = tierOpts(st.node, tier);
        if (o.density <= 0 && tier !== "low") continue;
        const useCards = tier === "low";
        const program = useCards ? (ds.cards ??= createProgram(device, true)) : (ds.blades ??= createProgram(device, false));
        if (!program) continue;
        const heightTex = st.heightTex ??= heightTexture(ds, st.record);
        if (!heightTex) continue;
        const g = st.record.grid!;
        const ring = grassChunkRing([camera.position[0], camera.position[2]], o.radius, GRASS_CHUNK_SIZE);
        const perChunk = Math.min(1024, Math.round(o.density * GRASS_CHUNK_SIZE * GRASS_CHUNK_SIZE * (useCards ? 0.125 : 1)));
        const vb = useCards
          ? (st.cardVB ??= device.createBuffer("vertex", grassCardVertices().byteLength, grassCardVertices()))
          : (st.bladeVB ??= device.createBuffer("vertex", grassBladeVertices().byteLength, grassBladeVertices()));
        const ib = useCards ? null : (st.bladeIB ??= device.createBuffer("index", grassBladeIndices().byteLength, grassBladeIndices()));
        const base = st.node.options.colorFromTerrain === false ? [0.4, 0.5, 0.2] : [0.25, 0.42, 0.14];
        const tip = st.node.options.tipColor ? colorToRgba(st.node.options.tipColor) : [0.55, 0.7, 0.3, 1] as const;
        for (const chunk of ring) {
          const uniforms = new Map<string, UniformValue>([
            ["u_viewProjection", camera.viewProjectionMatrix],
            ["u_cameraPosition", new Float32Array([camera.position[0], camera.position[1], camera.position[2]])],
            ["u_grassChunk", new Float32Array([chunk.originX, chunk.originZ, chunk.size, chunk.seed])],
            ["u_grassBladeCount", perChunk],
            ["u_grassRadius", o.radius],
            ["u_grassBladeHeight", o.bladeHeight],
            ["u_grassBladeWidth", o.bladeWidth],
            ["u_terrain", new Float32Array([st.record.origin[0], st.record.origin[2], st.record.size[0], st.record.size[1]])],
            ["u_heightScale", st.record.heightScale],
            ["u_heightTexSize", new Float32Array([g.columns, g.rows])],
            ["u_height", new TextureBinding({ name: "u_height", texture: heightTex, sampler: NEAREST })],
            ["u_windDirStrength", windUbo.subarray(0, 4)],
            ["u_windGust", windUbo.subarray(4, 8)],
            ["u_windDetail", new Float32Array([0, 0, 0, 0])],
            ["u_windTurbulence", windTurbulence],
            ["u_grassColor", new Float32Array([base[0]!, base[1]!, base[2]!, 0.8])],
            ["u_tipColor", new Float32Array([tip[0] ?? 0.55, tip[1] ?? 0.7, tip[2] ?? 0.3])]
          ]);
          device.draw({
            label: `prd10.grass.${st.node.id}`,
            topology: "triangles",
            renderState: { depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal" },
            vertexBuffer: vb,
            vertexFormat: useCards ? CARD_FORMAT : BLADE_FORMAT,
            vertexCount: useCards ? 4 : 7,
            indexBuffer: ib ?? undefined,
            indexType: ib ? "uint16" : undefined,
            indexCount: ib ? 15 : undefined,
            instanceCount: perChunk,
            shader: program,
            uniforms
          });
        }
      }
    }
  };
}

function createProgram(device: RenderDevice, cards: boolean): RenderShaderProgram | null {
  try {
    return device.createShaderProgram({
      label: cards ? "prd10.grass.cards" : "prd10.grass.blades",
      vertex: cards ? GRASS_CARD_VERT_GLSL : GRASS_VERT_GLSL,
      fragment: cards ? GRASS_CARD_FRAG_GLSL : GRASS_FRAG_GLSL,
      marker: "prd10.grass"
    });
  } catch {
    return null;
  }
}
