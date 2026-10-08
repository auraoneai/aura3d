/* PRD-06 T2.4 harness — unified skinned-PBR parity.
 *
 * Draws CesiumMan's skinned mesh in bind pose twice through the C-02
 * generated-program cache (`A3D_QR_CORE=v2` + `A3D_QR_ANIMATION`):
 *
 *   - deform: `features["prd06.deform"] = "skin4"` — the key
 *     `selectPrd06DeformValue` emits for a 4-influence texture-palette skin.
 *     The harness stamps it directly because per-item select/bindUniforms
 *     stamping in the forward consumer is still qr-request Q-01-4 (owner 01);
 *     the generated lit PBR program here carries the `a3dDeform` vertex
 *     splice and binds the bone-texture palette — the unified path.
 *   - rigid: the identical lit PBR feature record minus skinning/deform —
 *     the "static PBR item" the task compares against.
 *
 * At bind pose the joint palette is the identity transform, so the deform
 * path must equal the rigid path modulo float rounding: ΔE2000 ≤ 2 on ≥99%
 * of covered pixels. Report on `window.__PRD06_SKINNED_PBR_PARITY__`.
 */

// Buffer shim FIRST — a transitive module (`environment/HdrEquirect.ts`
// `HDR_MAGIC`) evaluates `Buffer.from` at load, before this module's body.
import "./buffer-shim.js";
import { GLTFLoader, LoadContext, createGLTFSceneAnimationRuntime } from "@aura3d/assets";
// Deep imports keep the served graph small — the dev server has no
// `@aura3d/rendering/lanes/*` alias, and `src/index.ts` pulls modules that
// evaluate `Buffer` at load.
import { IndexBuffer } from "../../../../packages/rendering/src/IndexBuffer.js";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer.js";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat.js";
import { WebGL2Device } from "../../../../packages/rendering/src/WebGL2Device.js";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures.js";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../../packages/rendering/src/program/ProgramGenerator.js";
import { rendererAuraFrame } from "../../../../packages/rendering/src/renderer/qrSubFlags.js";
import type { RenderDevice, RenderShaderProgram, UniformValue } from "../../../../packages/rendering/src/RenderDevice.js";
import type { QrFlags, QrFlagName, QrFlagValue } from "../../../../packages/rendering/src/contracts/core.js";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph.js";
import { AURA_FRAME_BLOCK } from "../../../../packages/rendering/src/contracts/frameUniforms.js";
import { bindBoneTextureForSkinning, skinningPaletteCache } from "../../../../packages/rendering/src/lanes/prd06.js";
import type { SkinningPaletteBinding } from "../../../../packages/rendering/src/ForwardPass.js";

function flagsOf(values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>): QrFlags {
  return {
    values,
    on(name: QrFlagName): boolean {
      const v = values[name];
      return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
    }
  };
}

const FLAGS = flagsOf({ A3D_QR_CORE: "v2", A3D_QR_ANIMATION: true });
const SIZE = 256;
const CLEAR: readonly [number, number, number, number] = [0.02, 0.04, 0.08, 1];
const CLEAR_BYTES: readonly [number, number, number, number] = [5, 10, 20, 255];

interface SkinPbrReport {
  status: "running" | "done" | "error";
  error?: string;
  deformKey?: string;
  staticKey?: string;
  deformReady?: boolean;
  staticReady?: boolean;
  boneTextureActive?: boolean;
  missingUniforms?: readonly string[];
  coveredPixels?: number;
  comparedPixels?: number;
  passRate?: number;
  maxDeltaE?: number;
  identicalRedraw?: boolean;
}

declare global {
  interface Window {
    __PRD06_SKINNED_PBR_PARITY__?: SkinPbrReport;
  }
}

const report: SkinPbrReport = { status: "running" };
window.__PRD06_SKINNED_PBR_PARITY__ = report;

/* ------------------------------------------------------------ mat4 helpers */

function identity4(): Float32Array {
  return Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function perspective(fovYRadians: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovYRadians / 2);
  const nf = 1 / (near - far);
  return Float32Array.from([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function lookAt(eye: readonly [number, number, number], center: readonly [number, number, number], up: readonly [number, number, number]): Float32Array {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return Float32Array.from([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1
  ]);
}

function mul4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function boundsOf(positions: readonly (readonly [number, number, number])[]): { center: [number, number, number]; radius: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); maxZ = Math.max(maxZ, p[2]);
  }
  const center: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  let radius = 0;
  for (const p of positions) radius = Math.max(radius, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]));
  return { center, radius: radius || 1 };
}

/* --------------------------------------------------------------- ΔE2000 */

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function lab(r: number, g: number, b: number): readonly [number, number, number] {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 — returns ΔE in perceptual units; ≤2 ≈ imperceptible. */
function deltaE2000(lab1: readonly [number, number, number], lab2: readonly [number, number, number]): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const avgL = (L1 + L2) / 2;
  const c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2);
  const avgC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + g), a2p = a2 * (1 + g);
  const c1p = Math.hypot(a1p, b1), c2p = Math.hypot(a2p, b2);
  const avgCp = (c1p + c2p) / 2;
  const h1p = (Math.atan2(b1, a1p) + 2 * Math.PI) % (2 * Math.PI);
  const h2p = (Math.atan2(b2, a2p) + 2 * Math.PI) % (2 * Math.PI);
  const dL = L2 - L1, dC = c2p - c1p;
  let dh = c1p * c2p === 0 ? 0 : Math.abs(h2p - h1p) <= Math.PI ? h2p - h1p : h2p - h1p + (h2p > h1p ? -2 * Math.PI : 2 * Math.PI);
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(dh / 2);
  const avgHp = c1p * c2p === 0 ? h1p + h2p : Math.abs(h1p - h2p) <= Math.PI ? (h1p + h2p) / 2 : (h1p + h2p + (h1p + h2p < 2 * Math.PI ? 2 * Math.PI : -2 * Math.PI)) / 2;
  const t = 1 - 0.17 * Math.cos(avgHp - Math.PI / 6) + 0.24 * Math.cos(2 * avgHp) + 0.32 * Math.cos(3 * avgHp + Math.PI / 30) - 0.2 * Math.cos(4 * avgHp - (21 * Math.PI) / 60);
  const sL = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const sC = 1 + 0.045 * avgCp;
  const sH = 1 + 0.015 * avgCp * t;
  const dTheta = (Math.PI / 6) * Math.exp(-Math.pow((avgHp * 180) / Math.PI - 275, 2) / 625);
  const rC = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const rT = -rC * Math.sin(2 * dTheta);
  return Math.sqrt(Math.pow(dL / sL, 2) + Math.pow(dC / sC, 2) + Math.pow(dH / sH, 2) + rT * (dC / sC) * (dH / sH));
}

/* ------------------------------------------------------------------ draw */

function baseUniforms(): Map<string, UniformValue> {
  const m = new Map<string, UniformValue>();
  const identity = identity4();
  m.set("u_modelMatrix", identity);
  m.set("u_geometryMatrix", identity);
  m.set("u_normalMatrix", identity);
  m.set("u_pointSize", 1);
  m.set("u_baseColor", Float32Array.from([0.82, 0.62, 0.47, 1]));
  m.set("u_metallic", 0.15);
  m.set("u_roughness", 0.55);
  m.set("u_emissiveColor", Float32Array.from([0, 0, 0]));
  m.set("u_emissiveStrength", 1);
  m.set("u_ior", 1.5);
  m.set("u_specularColorFactor", Float32Array.from([1, 1, 1]));
  m.set("u_specularIntensity", 1);
  m.set("u_environmentColor", Float32Array.from([0.05, 0.05, 0.06]));
  m.set("u_environmentIntensity", 1);
  m.set("u_lightCount", 1);
  const lights = new Float32Array(96 * 4);
  const dirLen = Math.hypot(0.4, 1.0, 0.35);
  lights.set([1.0, 0.95, 0.9, 2.4], 0);                                    // colorIntensity
  lights.set([0, 0, 0, 0], 4);                                             // positionRange (unused for dir)
  lights.set([-0.4 / dirLen, -1.0 / dirLen, -0.35 / dirLen, 0], 8);        // directionKind (w=0: directional)
  m.set("u_lightData", lights);
  return m;
}

// `uniformDetails` flattens UBO block members as plain uniforms — those are fed
// by `bindUniformBuffer`, not the per-draw uniform map.
const UBO_MEMBER_NAMES = new Set<string>(AURA_FRAME_BLOCK.map(([name]) => name));

function missingUniforms(program: RenderShaderProgram, uniforms: ReadonlyMap<string, UniformValue>): string[] {
  const missing: string[] = [];
  for (const name of program.reflection.uniformDetails.keys()) {
    if (UBO_MEMBER_NAMES.has(name)) continue;
    if (!uniforms.has(name)) missing.push(name);
  }
  return missing;
}

function drawMesh(
  device: RenderDevice,
  program: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  vertexGpu: ReturnType<VertexBuffer["upload"]>,
  indexGpu: ReturnType<IndexBuffer["upload"]>,
  indexType: IndexBuffer["type"],
  vertexCount: number,
  indexCount: number,
  label: string
): Uint8Array {
  device.clear(CLEAR);
  device.draw({
    label,
    topology: "triangles",
    vertexBuffer: vertexGpu,
    vertexFormat: VertexFormat.P3N3J4W4,
    vertexCount,
    indexBuffer: indexGpu,
    indexType,
    indexCount,
    shader: program,
    uniforms,
    renderState: { depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal" }
  });
  return device.readPixels(0, 0, SIZE, SIZE);
}

async function main(): Promise<void> {
  setRendererQrFlags(FLAGS);

  const asset = await new GLTFLoader().load(
    { url: `${location.origin}/tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb` },
    new LoadContext()
  );
  const mesh = asset.meshes.find((m) => m.skinIndex !== undefined);
  const skin = mesh?.skinIndex !== undefined ? asset.skins[mesh.skinIndex] : undefined;
  if (!mesh || !skin) throw new Error("CesiumMan skinned mesh missing");
  const jointCount = skin.joints.length;

  const scene = asset.createScene();
  const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
  scene.updateWorldTransforms();
  runtime.applyPose({ bones: {} });
  const renderableEntry = scene.collectRenderables().find(({ renderable }) => renderable.skinning && renderable.skinning.jointCount === jointCount);
  if (!renderableEntry) throw new Error("skinned renderable not bound");
  const bindPalette = new Float32Array(renderableEntry.renderable.skinning!.matrices);

  const { positions, normals, joints, weights, indices } = mesh;
  if (!indices) throw new Error("CesiumMan mesh has no index buffer");
  const vertexCount = positions.length;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  document.getElementById("stage")?.appendChild(canvas);
  const device = WebGL2Device.create({ canvas, antialias: false });
  device.beginFrame(SIZE, SIZE);

  // Q-06-W1 workaround: lane-01 `uniformBlockGlsl` emits
  // `layout(std140, binding = 0)` on the AuraFrame UBO — the `binding` qualifier
  // on uniform blocks is NOT valid WebGL2 GLSL (the spec removes it; ANGLE
  // rejects it on every backend, not just SwiftShader), so `acquire`/`precompile`
  // fail compile for every generated program in a real browser. Blocks default
  // to binding point 0, matching `bindUniformBuffer(…, 0)` — strip the illegal
  // qualifier here and compile the (otherwise untouched) generated source.
  const stripUboBinding = (src: string): string => src.replace(/layout\(std140, binding = \d+\)/g, "layout(std140)");
  const compileGenerated = (features: Parameters<typeof generateProgramImpl>[0]): { program: RenderShaderProgram; key: string; error?: string } => {
    const generated = generateProgramImpl(features, { flags: FLAGS });
    try {
      const program = device.createShaderProgram({
        label: `a3d-pbr-parity:${generated.key.slice(0, 32)}`,
        marker: GENERATED_PROGRAM_MARKER,
        vertex: stripUboBinding(generated.vertex),
        fragment: stripUboBinding(generated.fragment)
      });
      return { program, key: generated.key };
    } catch (error) {
      return { program: undefined as unknown as RenderShaderProgram, key: generated.key, error: String(error) };
    }
  };
  const deformFeatures = normalizeProgramFeatures({
    lighting: "lit",
    diffuseModel: "lambert",
    alphaMode: "opaque",
    pass: "forward",
    target: "glsl300es",
    skinning: { influences: 4, palette: "texture" },
    features: { "prd06.deform": "skin4" }
  });
  const staticFeatures = normalizeProgramFeatures({
    lighting: "lit",
    diffuseModel: "lambert",
    alphaMode: "opaque",
    pass: "forward",
    target: "glsl300es"
  });
  const deformHandle = compileGenerated(deformFeatures);
  const staticHandle = compileGenerated(staticFeatures);
  report.deformKey = deformHandle.key;
  report.staticKey = staticHandle.key;
  report.deformReady = !deformHandle.error;
  report.staticReady = !staticHandle.error;
  if (deformHandle.error || staticHandle.error) {
    throw new Error(`program compile failed: deform=${deformHandle.error ?? "ok"} static=${staticHandle.error ?? "ok"}`);
  }
  report.boneTextureActive = deformHandle.program.reflection.uniforms.has("u_boneTexture");

  // Geometry (bind pose = raw positions; skinned identity palette reproduces them).
  const vertexBuffer = new VertexBuffer(VertexFormat.P3N3J4W4, vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    vertexBuffer.setAttribute(i, "position", positions[i]!);
    vertexBuffer.setAttribute(i, "normal", normals[i] ?? [0, 1, 0]);
    vertexBuffer.setAttribute(i, "joints", joints[i]!);
    vertexBuffer.setAttribute(i, "weights", weights[i]!);
  }
  const indexBuffer = new IndexBuffer(indices as readonly number[]);
  const vertexGpu = vertexBuffer.upload(device);
  const indexGpu = indexBuffer.upload(device);

  // AuraFrame UBO (binding 0) — one camera for every generated program.
  const { center, radius } = boundsOf(positions);
  const eye: [number, number, number] = [center[0] + radius * 1.6, center[1] + radius * 0.9, center[2] + radius * 1.9];
  const view = lookAt(eye, center, [0, 1, 0]);
  const proj = perspective((40 * Math.PI) / 180, 1, 0.05, radius * 50);
  const vp = mul4(proj, view);
  const auraFrame = rendererAuraFrame(device, FLAGS);
  if ("viewport" in auraFrame) {
    (auraFrame as { viewport: { width: number; height: number } }).viewport = { width: SIZE, height: SIZE };
  }
  auraFrame.update(
    {
      viewMatrix: view,
      projectionMatrix: proj,
      viewProjectionMatrix: vp,
      previousViewProjectionMatrix: null,
      near: 0.05,
      far: radius * 50,
      projection: "perspective",
      position: eye
    },
    0,
    1,
    0
  );
  if (auraFrame.buffer) device.bindUniformBuffer(auraFrame.buffer, 0);

  // Deform draw: base uniforms + the bone-texture palette bind (the same
  // setter the feature's bindUniforms uses once Q-01-4 wires per-item calls).
  const deformUniforms = baseUniforms();
  const skinning = { jointCount, matrices: bindPalette, paletteKey: {} } as SkinningPaletteBinding & { paletteKey: object };
  bindBoneTextureForSkinning((name, value) => deformUniforms.set(name, value), skinningPaletteCache, skinning);

  const staticUniforms = baseUniforms();
  const missing = [
    ...missingUniforms(deformHandle.program, deformUniforms).map((n) => `deform:${n}`),
    ...missingUniforms(staticHandle.program, staticUniforms).map((n) => `static:${n}`)
  ];
  report.missingUniforms = missing;
  if (missing.length) throw new Error(`uniforms not bound: ${missing.join(", ")}`);

  const deformPixels = drawMesh(device, deformHandle.program, deformUniforms, vertexGpu, indexGpu, indexBuffer.type, vertexCount, indices.length, "deform");
  const staticPixels = drawMesh(device, staticHandle.program, staticUniforms, vertexGpu, indexGpu, indexBuffer.type, vertexCount, indices.length, "static");
  const staticPixels2 = drawMesh(device, staticHandle.program, baseUniforms(), vertexGpu, indexGpu, indexBuffer.type, vertexCount, indices.length, "static-2");
  device.endFrame();

  report.identicalRedraw = staticPixels.every((v, i) => v === staticPixels2[i]);

  let covered = 0;
  let passing = 0;
  let maxDeltaE = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = i * 4;
    const deformCovered =
      Math.abs(deformPixels[o]! - CLEAR_BYTES[0]) > 3 ||
      Math.abs(deformPixels[o + 1]! - CLEAR_BYTES[1]) > 3 ||
      Math.abs(deformPixels[o + 2]! - CLEAR_BYTES[2]) > 3;
    const staticCovered =
      Math.abs(staticPixels[o]! - CLEAR_BYTES[0]) > 3 ||
      Math.abs(staticPixels[o + 1]! - CLEAR_BYTES[1]) > 3 ||
      Math.abs(staticPixels[o + 2]! - CLEAR_BYTES[2]) > 3;
    if (!deformCovered && !staticCovered) continue;
    covered++;
    const dE = deltaE2000(
      lab(deformPixels[o]!, deformPixels[o + 1]!, deformPixels[o + 2]!),
      lab(staticPixels[o]!, staticPixels[o + 1]!, staticPixels[o + 2]!)
    );
    maxDeltaE = Math.max(maxDeltaE, dE);
    if (dE <= 2) passing++;
  }
  report.coveredPixels = covered;
  report.comparedPixels = covered;
  report.passRate = covered ? passing / covered : 0;
  report.maxDeltaE = maxDeltaE;
  report.status = "done";
}

main().catch((error) => {
  report.status = "error";
  report.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});
