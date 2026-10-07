/**
 * Region masks rendered from the same SceneSpec on the three side (PRD-12
 * §6.3, §8.1). Both engines render the same geometry from the same camera, so
 * silhouette coincides wherever Aura renders the geometry correctly; the
 * alignment check lives in metrics.py, never presumed.
 *
 * All masks render with a dedicated `WebGLRenderer({ antialias: false })`,
 * `toneMapping = NoToneMapping`, `outputColorSpace = LinearSRGBColorSpace` so a
 * written byte equals the encoded value. Mask bytes are returned raw; the page
 * also publishes them as PNG data URLs for `capture.mjs` to save as
 * `three.<mask>.mask.png`.
 */
import * as THREE from "three";
import type { MaskId, SceneSpec } from "../../shared/types";
import type { ThreeGraph } from "../common";

export interface MaskOutput {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  /** Byte length of the single-channel mask. */
  readonly bytes: number;
}

/** 8-bit RGB encoding of the object index (§8.1): r = (i*37)%251+1, g = i>>8, b = 0. */
export function idColor(index: number, target: THREE.Color): THREE.Color {
  const r = (index * 37) % 251 + 1;
  const g = index >> 8;
  // Specified in linear space with a linear pipeline so the written byte is the id.
  return target.setRGB(r / 255, g / 255, 0, THREE.LinearSRGBColorSpace);
}

/** Renderable objects, depth-first — stable per spec order for `object:<n>` regions. */
function renderables(scene: THREE.Scene): readonly (THREE.Mesh | THREE.Points)[] {
  const list: (THREE.Mesh | THREE.Points)[] = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh || (child as THREE.Points).isPoints) list.push(child as THREE.Mesh | THREE.Points);
  });
  return list;
}

function maskRenderer(graph: ThreeGraph, spec: SceneSpec): { renderer: THREE.WebGLRenderer; width: number; height: number } {
  const dpr = graph.renderer.getPixelRatio();
  const width = spec.resolution.width * dpr;
  const height = spec.resolution.height * dpr;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.setSize(spec.resolution.width, spec.resolution.height, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  return { renderer, width, height };
}

function readTarget(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, width: number, height: number, pixels: Uint8Array | Uint16Array | Float32Array): void {
  renderer.setRenderTarget(target);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels as Uint8Array);
  renderer.setRenderTarget(null);
}

/** GL lines are bottom-row first; PNG is top-row first. */
function flipRows(bytes: Uint8Array, width: number, height: number, stride: number): Uint8Array {
  const out = new Uint8Array(bytes.length);
  const row = width * stride;
  for (let y = 0; y < height; y += 1) out.set(bytes.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  return out;
}

function toPng(mask: Uint8Array, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const o = i * 4;
    rgba[o] = mask[i];
    rgba[o + 1] = mask[i];
    rgba[o + 2] = mask[i];
    rgba[o + 3] = 255;
  }
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

/** Per-mesh id render (§8.1). Returns the object-id mask bytes (r encodes id). */
function renderObjectId(graph: ThreeGraph, spec: SceneSpec): { ids: Uint8Array; names: readonly string[]; width: number; height: number } {
  const { renderer, width, height } = maskRenderer(graph, spec);
  const scene = graph.scene;
  const previousBackground = scene.background;
  scene.background = null;
  const objects = renderables(scene);
  const saved = new Map<THREE.Mesh | THREE.Points, THREE.Material | THREE.Material[]>();
  const names: string[] = [];
  try {
    objects.forEach((object, index) => {
      saved.set(object, object.material);
      const color = idColor(index, new THREE.Color());
      names.push(object.name || `object-${index}`);
      if ((object as THREE.Points).isPoints) {
        const material = (object as THREE.Points).material as THREE.PointsMaterial;
        object.material = new THREE.PointsMaterial({ size: material.size, sizeAttenuation: material.sizeAttenuation, color, toneMapped: false });
      } else {
        // MeshBasicMaterial per mesh (not scene.overrideMaterial) so each mesh gets its own id.
        object.material = new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false, blending: THREE.NoBlending, depthWrite: true });
      }
    });
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType });
    renderer.render(scene, graph.camera);
    const rgba = new Uint8Array(width * height * 4);
    renderer.setRenderTarget(target);
    renderer.render(scene, graph.camera);
    readTarget(renderer, target, width, height, rgba);
    target.dispose();
    const flipped = flipRows(rgba, width, height, 4);
    const ids = new Uint8Array(width * height);
    for (let i = 0; i < ids.length; i += 1) ids[i] = flipped[i * 4];
    return { ids, names, width, height };
  } finally {
    for (const [object, material] of saved) object.material = material;
    scene.background = previousBackground;
    renderer.dispose();
  }
}

/** Metalness mask (§8.1): per-mesh ShaderMaterial writing metalness * map.b. */
function renderMetal(graph: ThreeGraph, spec: SceneSpec, ids: Uint8Array, width: number, height: number): Uint8Array {
  const { renderer } = maskRenderer(graph, spec);
  const scene = graph.scene;
  const previousBackground = scene.background;
  scene.background = null;
  const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const fragmentShader = `
varying vec2 vUv;
uniform float uMetalness;
uniform sampler2D uMetalnessMap;
uniform bool uHasMap;
void main() {
  float m = uMetalness;
  if (uHasMap) m *= texture2D(uMetalnessMap, vUv).b;
  gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
}
`;
  const vertexShader = `
varying vec2 vUv;
#include <common>
#include <uv_pars_vertex>
#include <skinning_pars_vertex>
void main() {
  vUv = vec2(0.0);
  #ifdef USE_UV
    vUv = uv;
  #endif
  #include <uv_vertex>
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
}
`;
  try {
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const standard = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      if (!standard) return;
      saved.set(mesh, mesh.material);
      const hasUv = Boolean(mesh.geometry?.attributes?.uv);
      const metalnessMap = standard.metalnessMap ?? null;
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uMetalness: { value: standard.metalness ?? 0 },
          uMetalnessMap: { value: metalnessMap },
          uHasMap: { value: metalnessMap !== null }
        },
        defines: hasUv ? { USE_UV: "" } : {}
      });
      mesh.material = material;
    });
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType });
    renderer.setRenderTarget(target);
    renderer.render(scene, graph.camera);
    const rgba = new Uint8Array(width * height * 4);
    readTarget(renderer, target, width, height, rgba);
    target.dispose();
    const flipped = flipRows(rgba, width, height, 4);
    const mask = new Uint8Array(width * height);
    // mask = object-id != 0 ∩ metalness >= 0.9 (§6.3).
    for (let i = 0; i < mask.length; i += 1) {
      const metalValue = flipped[i * 4] / 255;
      mask[i] = ids[i] !== 0 && metalValue >= 0.9 ? 255 : 0;
    }
    return mask;
  } finally {
    for (const [mesh, material] of saved) mesh.material = material;
    scene.background = previousBackground;
    renderer.dispose();
  }
}

function halfToFloat(bits: number): number {
  const sign = (bits & 0x8000) ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * fraction * Math.pow(2, -14) / 1024;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * Math.pow(2, exponent - 15);
}

/** Linear-luma render into a HalfFloat target; returns Float32 luma per pixel. */
function renderLuma(graph: ThreeGraph, spec: SceneSpec, shadowsOn: boolean, width: number, height: number): Float32Array {
  const { renderer } = maskRenderer(graph, spec);
  const scene = graph.scene;
  const toggled: THREE.Light[] = [];
  for (const light of graph.lights) {
    if ("castShadow" in light && light.castShadow !== shadowsOn) {
      toggled.push(light);
      light.castShadow = shadowsOn;
    }
  }
  try {
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType });
    renderer.setRenderTarget(target);
    // NoToneMapping is set by maskRenderer; toggling castShadow changes three's
    // lights-state hash, so programs refresh without material.needsUpdate (§8.1).
    renderer.render(scene, graph.camera);
    const halves = new Uint16Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, halves);
    renderer.setRenderTarget(null);
    target.dispose();
    const luma = new Float32Array(width * height);
    // flip rows while converting
    for (let y = 0; y < height; y += 1) {
      const srcRow = height - 1 - y;
      for (let x = 0; x < width; x += 1) {
        const o = (srcRow * width + x) * 4;
        const r = halfToFloat(halves[o]);
        const g = halfToFloat(halves[o + 1]);
        const b = halfToFloat(halves[o + 2]);
        luma[y * width + x] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
    }
    return luma;
  } finally {
    for (const light of toggled) light.castShadow = !shadowsOn;
    renderer.dispose();
  }
}

/** shadow-receiver: pixels where disabling shadows brightens the frame (§8.1). */
function renderShadowReceiver(graph: ThreeGraph, spec: SceneSpec, width: number, height: number): Uint8Array {
  const lit = renderLuma(graph, spec, true, width, height);
  const unlit = renderLuma(graph, spec, false, width, height);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    const diff = unlit[i] - lit[i];
    mask[i] = diff > Math.max(0.02, 0.05 * unlit[i]) ? 255 : 0;
  }
  return mask;
}

/** silhouette-edge: morphological gradient of the object-id mask, radius 2. */
function silhouetteEdge(ids: Uint8Array, width: number, height: number): Uint8Array {
  const inside = new Uint8Array(width * height);
  for (let i = 0; i < ids.length; i += 1) inside[i] = ids[i] !== 0 ? 1 : 0;
  const mask = new Uint8Array(width * height);
  const radius = 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let anyInside = false;
      let anyOutside = false;
      for (let dy = -radius; dy <= radius && !(anyInside && anyOutside); dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) { anyOutside = true; continue; }
          if (inside[yy * width + xx]) anyInside = true;
          else anyOutside = true;
        }
      }
      mask[y * width + x] = anyInside && anyOutside ? 255 : 0;
    }
  }
  return mask;
}

/**
 * Renders `kinds` mask passes from the READY-frame graph. Returns PNG data
 * URLs per mask; the caller publishes them on `window.__QR_MASKS__`.
 * Object-index mapping (id byte → mesh name, traversal order) is published on
 * `window.__QR_MASK_INDEX__` for the metrics alignment check.
 */
export async function renderMasks(graph: ThreeGraph, spec: SceneSpec, kinds: readonly MaskId[]): Promise<Readonly<Record<MaskId, MaskOutput>>> {
  const needed = new Set<MaskId>(kinds);
  const { renderer: _probe, width, height } = maskRenderer(graph, spec);
  _probe.dispose();
  const out = {} as Record<MaskId, MaskOutput>;
  let ids: Uint8Array | undefined;
  if (needed.has("object-id") || needed.has("sky") || needed.has("metal") || needed.has("silhouette-edge") || needed.has("shadow-receiver")) {
    const rendered = renderObjectId(graph, spec);
    ids = rendered.ids;
    (window as { __QR_MASK_INDEX__?: readonly string[] }).__QR_MASK_INDEX__ = rendered.names;
    if (needed.has("object-id")) {
      out["object-id"] = { dataUrl: toPng(ids.map((v) => v !== 0 ? v : 0), width, height), width, height, bytes: ids.length };
    }
  }
  if (needed.has("shadow-receiver")) {
    const mask = renderShadowReceiver(graph, spec, width, height);
    out["shadow-receiver"] = { dataUrl: toPng(mask, width, height), width, height, bytes: mask.length };
  }
  if (needed.has("sky")) {
    const mask = new Uint8Array(width * height);
    if (spec.background.kind === "hdri" && ids) {
      for (let i = 0; i < mask.length; i += 1) mask[i] = ids[i] === 0 ? 255 : 0;
    }
    out.sky = { dataUrl: toPng(mask, width, height), width, height, bytes: mask.length };
  }
  if (needed.has("metal") && ids) {
    const mask = renderMetal(graph, spec, ids, width, height);
    out.metal = { dataUrl: toPng(mask, width, height), width, height, bytes: mask.length };
  }
  if (needed.has("silhouette-edge") && ids) {
    const mask = silhouetteEdge(ids, width, height);
    out["silhouette-edge"] = { dataUrl: toPng(mask, width, height), width, height, bytes: mask.length };
  }
  return out;
}
