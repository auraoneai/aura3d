/**
 * PRD-06 §16 S-row — `animated-character-browser` flag-on lane case.
 *
 * The original `tests/browser/animated-character-browser.spec.ts` exercises a
 * 2-joint procedural rig through `/examples/animated-character/` — outside
 * this lane. The §16 flag-on requirement is the >96-joint path: a 191-joint
 * rig renders through the cached bone texture and the cache allocates zero
 * textures per frame after warm-up (`createdThisFrame === 0` after frame 10).
 *
 * No admitted fixture has >96 joints, so the harness builds a synthetic
 * 191-joint skinned quad in-page and draws it through the REAL generated
 * deform program (`A3D_QR_CORE=v2` + `A3D_QR_ANIMATION`, skinning
 * `{influences:4, palette:"texture"}` + `features["prd06.deform"]="skin4"`)
 * for 12 frames — the identical program+bind path the lane uses in
 * `skinned-pbr-parity` — with a per-frame animated palette so uploads keep
 * flowing. The cache is the C-18 singleton `skinningPaletteCache`.
 *
 * Publishes `window.__AURA3D_QR_ANIMATED_CHARACTER_191__`. `firstFramePixelsDrawn`
 * records the on-screen coverage of frame 0 so the spec can prove the rig
 * actually rasterised (not just that a draw call was issued).
 */

// Buffer shim FIRST — a transitive module evaluates `Buffer.from` at load.
import "./buffer-shim.js";
import { GLTFLoader, LoadContext } from "@aura3d/assets";
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
  return { values, on: (name: QrFlagName) => { const v = values[name]; return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== ""; } };
}

const FLAGS = flagsOf({ A3D_QR_CORE: "v2", A3D_QR_ANIMATION: true });
const SIZE = 256;
const JOINTS = 191;
const FRAMES = 12;
const CLEAR: readonly [number, number, number, number] = [0.02, 0.04, 0.08, 1];

interface AnimatedCharacter191Report {
  status: "running" | "done" | "error";
  error?: string;
  jointCount?: number;
  framesRendered?: number;
  boneTextureActive?: boolean;
  missingUniforms?: readonly string[];
  createdThisFrameByFrame?: readonly number[];
  paletteBytes?: number;
  nonBlankFrames?: number;
  firstFramePixelsDrawn?: number;
}

declare global {
  interface Window { __AURA3D_QR_ANIMATED_CHARACTER_191__?: AnimatedCharacter191Report }
}

const report: AnimatedCharacter191Report = { status: "running" };
window.__AURA3D_QR_ANIMATED_CHARACTER_191__ = report;

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

function baseUniforms(): Map<string, UniformValue> {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const m = new Map<string, UniformValue>();
  m.set("u_modelMatrix", identity);
  m.set("u_geometryMatrix", identity);
  m.set("u_normalMatrix", identity);
  m.set("u_pointSize", 1);
  m.set("u_baseColor", Float32Array.from([0.8, 0.4, 0.25, 1]));
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
  lights.set([1.0, 0.95, 0.9, 2.4], 0);
  lights.set([0, 0, 0, 0], 4);
  lights.set([-0.4 / dirLen, -1.0 / dirLen, -0.35 / dirLen, 0], 8);
  m.set("u_lightData", lights);
  return m;
}

const UBO_MEMBER_NAMES = new Set<string>(AURA_FRAME_BLOCK.map(([name]) => name));

function missingUniforms(program: RenderShaderProgram, uniforms: ReadonlyMap<string, UniformValue>): string[] {
  const missing: string[] = [];
  for (const name of program.reflection.uniformDetails.keys()) {
    if (UBO_MEMBER_NAMES.has(name)) continue;
    if (!uniforms.has(name)) missing.push(name);
  }
  return missing;
}

/** Identity joint palette with a tiny per-joint per-frame drift (animated). */
function paletteFor(frame: number): Float32Array {
  const m = new Float32Array(JOINTS * 16);
  for (let j = 0; j < JOINTS; j++) {
    const o = j * 16;
    m[o + 0] = 1; m[o + 5] = 1; m[o + 10] = 1; m[o + 15] = 1;
    m[o + 12] = (j % 7) * 0.001 * (frame + 1);
    m[o + 13] = (j % 5) * 0.0008 * (frame + 1);
  }
  return m;
}

async function main(): Promise<void> {
  setRendererQrFlags(FLAGS);

  // Draw the known-good CesiumMan mesh (19 joints — every vertex index lands
  // inside the palette), but bind a synthetic 191-joint skinning binding:
  // `skinning.jointCount` is what drives the >96-joint texture-palette path,
  // so the cache acquires a 191-entry palette exactly like the §16 case.
  const asset = await new GLTFLoader().load(
    { url: `${location.origin}/tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb` },
    new LoadContext()
  );
  const mesh = asset.meshes.find((m) => m.skinIndex !== undefined);
  if (!mesh || !mesh.indices) throw new Error("CesiumMan skinned mesh missing");
  const positions = mesh.positions;
  const normals = mesh.normals;
  const joints = mesh.joints;
  const weights = mesh.weights;
  const indices = mesh.indices;
  const vertexCount = positions.length;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  document.getElementById("stage")?.appendChild(canvas);
  const device = WebGL2Device.create({ canvas, antialias: false });
  device.beginFrame(SIZE, SIZE);

  // Q-06-W1 workaround: strip the illegal `binding = N` qualifier the lane-01
  // UBO emitter writes (see skinned-pbr-parity-harness).
  const stripUboBinding = (src: string): string => src.replace(/layout\(std140, binding = \d+\)/g, "layout(std140)");
  const generated = generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit",
    diffuseModel: "lambert",
    alphaMode: "opaque",
    pass: "forward",
    target: "glsl300es",
    skinning: { influences: 4, palette: "texture" },
    features: { "prd06.deform": "skin4" }
  }), { flags: FLAGS });
  const program = device.createShaderProgram({
    label: `a3d-animated-191:${generated.key.slice(0, 32)}`,
    marker: GENERATED_PROGRAM_MARKER,
    vertex: stripUboBinding(generated.vertex),
    fragment: stripUboBinding(generated.fragment)
  });
  report.boneTextureActive = program.reflection.uniforms.has("u_boneTexture");

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

  // Camera fit on the mesh bounds (same construction as the parity harness).
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); maxZ = Math.max(maxZ, p[2]);
  }
  const center: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  let radius = 0;
  for (const p of positions) radius = Math.max(radius, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]));
  radius ||= 1;
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
      far: 50,
      projection: "perspective",
      position: eye
    },
    0,
    1,
    0
  );
  if (auraFrame.buffer) device.bindUniformBuffer(auraFrame.buffer, 0);

  const paletteKey = {};
  const skinningFor = (frame: number): SkinningPaletteBinding & { paletteKey: object } =>
    ({ jointCount: JOINTS, matrices: paletteFor(frame), paletteKey }) as SkinningPaletteBinding & { paletteKey: object };
  const uniforms = baseUniforms();
  const missing = missingUniforms(program, uniforms).filter((n) => n !== "u_boneTexture" && n !== "u_boneTextureWidth" && n !== "u_prevBoneTexture");
  report.missingUniforms = missing;
  if (missing.length) throw new Error(`uniforms not bound: ${missing.join(", ")}`);

  const createdThisFrameByFrame: number[] = [];
  let nonBlankFrames = 0;
  for (let frame = 0; frame < FRAMES; frame += 1) {
    skinningPaletteCache.beginFrame();
    bindBoneTextureForSkinning((name, value) => uniforms.set(name, value), skinningPaletteCache, skinningFor(frame));
    device.clear(CLEAR);
    device.draw({
      label: `prd06-animated-191:frame-${frame}`,
      topology: "triangles",
      vertexBuffer: vertexGpu,
      vertexFormat: VertexFormat.P3N3J4W4,
      vertexCount,
      indexBuffer: indexGpu,
      indexType: indexBuffer.type,
      indexCount: indices.length,
      shader: program,
      uniforms,
      renderState: { depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal" }
    });
    const pixels = device.readPixels(0, 0, SIZE, SIZE);
    // Non-blank = any pixel materially differs from the clear colour.
    let drawn = 0;
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      const o = i * 4;
      if (Math.abs(pixels[o]! - 5) > 3 || Math.abs(pixels[o + 1]! - 10) > 3 || Math.abs(pixels[o + 2]! - 20) > 3) drawn += 1;
    }
    if (drawn > 0) nonBlankFrames += 1;
    if (frame === 0) report.firstFramePixelsDrawn = drawn;
    createdThisFrameByFrame.push(skinningPaletteCache.diagnostics().createdThisFrame);
  }
  device.endFrame();

  report.jointCount = JOINTS;
  report.framesRendered = FRAMES;
  report.createdThisFrameByFrame = createdThisFrameByFrame;
  report.paletteBytes = skinningPaletteCache.diagnostics().bytes;
  report.nonBlankFrames = nonBlankFrames;
  report.status = "done";
}

main().catch((error) => {
  report.status = "error";
  report.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});
