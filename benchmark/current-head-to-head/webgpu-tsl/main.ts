import { loadProductionGLTFRenderPipeline } from "@aura3d/assets";
import { PortableShaderMaterial, Renderer, computePerspectiveCameraFrame, createDefaultShaderLibrary, type RenderSource } from "@aura3d/rendering";
import * as THREE from "three/webgpu";
import { abs, color, cos, mix, normalView, positionLocal, sin, uniform } from "three/tsl";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const ASSET = { id: "showcaseHeadphones", url: "/aura-assets/showcaseHeadphones.40b1fdf7.glb", sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833", bytes: 1_589_596 } as const;
const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const FRAME = { paddingRatio: 0.14, fovYRadians: 45 * Math.PI / 180, yawRadians: -0.34, pitchRadians: -0.12, nearPadding: 0.1, farPadding: 2.2 } as const;
const COLORS = { background: [5 / 255, 7 / 255, 11 / 255, 1] as const, a: [0.035, 0.16, 0.92] as const, b: [0.96, 0.04, 0.52] as const, rim: [0.18, 0.35, 0.9] as const };
const TIMES = { before: 0.2, after: 1.45 } as const;

declare global { interface Window { __AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL__?: any; __AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL_ERROR__?: string } }
const state: Record<string, any> = { ready: false, workload: "webgpu-tsl", viewport: VIEWPORT, asset: ASSET, contract: { frame: FRAME, colors: COLORS, times: TIMES }, before: null, after: null, lifecycle: null };
const publish = () => { state.ready = Boolean(state.before); window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL__ = structuredClone(state); };
publish(); void run().catch((error) => { window.__AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); });

async function run(): Promise<void> {
  if (!(navigator as Navigator & { gpu?: unknown }).gpu) throw new Error("Native navigator.gpu is required for the frozen WebGPU/TSL workload.");
  const phase = new URL(window.location.href).searchParams.get("phase") === "after" ? "after" : "before";
  const aura = await createAura(phase); const three = await createThree(phase); await renderPhase(phase, aura, three);
  const dispose = () => {
    aura.material.dispose(); aura.pipeline.resources.dispose(); aura.renderer.dispose(); three.dispose();
    state.lifecycle = { auraMaterialDisposed: aura.material.disposed, auraPipelineDisposed: true, auraRendererDeviceDisposed: aura.renderer.device.disposed, threeGeometryDisposed: true, threeMaterialsDisposed: true, threeRendererDisposed: true };
    publish(); return state.lifecycle;
  };
  if (phase === "before") document.getElementById("advance")?.addEventListener("click", () => { dispose(); window.location.assign("?phase=after"); });
  Object.assign(window, { __AURA_THREE_HEAD_TO_HEAD_WEBGPU_TSL_DISPOSE__: dispose });
}


async function createAura(phase: "before" | "after") {
  const canvas = requiredCanvas("aura-native"); const pipeline = await loadProductionGLTFRenderPipeline({ url: ASSET.url, assetId: ASSET.id, assetName: "Aura3D Headphones WebGPU", width: VIEWPORT.width, height: VIEWPORT.height, rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", frame: FRAME, postprocess: false, frustumCulling: false } });
  const renderer = await Renderer.create({ backend: "webgpu", canvas, width: VIEWPORT.width, height: VIEWPORT.height, clearColor: COLORS.background, shaderLibrary: createDefaultShaderLibrary() });
  const palette = phase === "before" ? COLORS : { ...COLORS, a: COLORS.b, b: COLORS.a, rim: [0.9, 0.12, 0.04] as const };
  const material = new PortableShaderMaterial({ shaderLibrary: renderer.shaderLibrary, name: "webgpu-product-signal", sources: portableSources(), requiredAttributes: ["a_position", "a_normal"], uniforms: [{ name: "u_time", kind: "float", value: TIMES[phase] }, { name: "u_colorA", kind: "vec3", value: palette.a }, { name: "u_colorB", kind: "vec3", value: palette.b }, { name: "u_rimColor", kind: "vec3", value: palette.rim }] });
  const input = pipeline.resources.toRendererInput(VIEWPORT, { qualityPreset: "studio-preview", cameraPolicy: "require", frame: FRAME, postprocess: false, frustumCulling: false }); const pipelineSource = input.source as RenderSource; const materialLibrary = new Map([...pipeline.resources.materialLibrary.keys()].map((key) => [key, material] as const)); if (materialLibrary.size === 0) throw new Error("The frozen product pipeline produced no materials.");
  const target = renderer.device.createRenderTarget({ width: VIEWPORT.width, height: VIEWPORT.height, label: `webgpu-tsl-aura-${phase}`, format: "rgba8", depth: true });
  return { canvas, pipeline, renderer, material, target, source: { ...pipelineSource, materialLibrary, renderTarget: target, postprocess: false } satisfies RenderSource, camera: input.camera };
}

async function createThree(phase: "before" | "after") {
  const canvas = requiredCanvas("three-native"); const renderer = new THREE.WebGPURenderer({ canvas, antialias: true }); renderer.setPixelRatio(1); renderer.setSize(VIEWPORT.width, VIEWPORT.height, false); renderer.setClearColor(0x05070b, 1); await renderer.init();
  const gltf = await new GLTFLoader().loadAsync(ASSET.url); const world = new THREE.Scene(); world.add(gltf.scene); const bounds = new THREE.Box3().setFromObject(gltf.scene); const frame = computePerspectiveCameraFrame({ min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] }, VIEWPORT, FRAME); const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, frame.aspect, frame.near, frame.far); camera.position.set(...frame.cameraPosition); camera.lookAt(...frame.center); camera.updateProjectionMatrix();
  const time = uniform(TIMES[phase]); const nodeMaterial = new THREE.MeshBasicNodeMaterial(); const field = sin(positionLocal.x.mul(8).add(time.mul(1.7))).mul(cos(positionLocal.y.mul(7).sub(time))).add(sin(positionLocal.z.mul(9))); const rim = abs(normalView.z).oneMinus().pow(2); const colorA = phase === "before" ? 0x0929eb : 0xf50a85; const colorB = phase === "before" ? 0xf50a85 : 0x0929eb; const rimColor = phase === "before" ? 0x2e59e6 : 0xe61f0a; nodeMaterial.colorNode = mix(color(colorA), color(colorB), field.mul(0.25).add(0.5)).add(rim.mul(color(rimColor)));
  const originalMaterials: THREE.Material[] = []; gltf.scene.traverse((object) => { if (!(object instanceof THREE.Mesh)) return; for (const entry of Array.isArray(object.material) ? object.material : [object.material]) originalMaterials.push(entry); object.material = nodeMaterial; });
  const target = new THREE.RenderTarget(VIEWPORT.width, VIEWPORT.height, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true });
  return { canvas, renderer, target, world, camera, time, nodeMaterial, gltf, originalMaterials, dispose() { target.dispose(); gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); for (const entry of new Set(originalMaterials)) entry.dispose(); nodeMaterial.dispose(); renderer.dispose(); } };
}

async function renderPhase(phase: "before" | "after", aura: Awaited<ReturnType<typeof createAura>>, three: Awaited<ReturnType<typeof createThree>>): Promise<void> {
  const time = TIMES[phase]; aura.material.setParameter("u_time", time); three.time.value = time;
  const auraDiagnostics = await aura.renderer.renderAsync(aura.source, aura.camera);
  const auraPixels = await aura.renderer.device.readPixelsAsync?.(0, 0, VIEWPORT.width, VIEWPORT.height);
  if (!auraPixels) throw new Error("Aura WebGPU target did not expose native readback.");
  presentReadback("aura", auraPixels);
  three.renderer.info.reset(); three.renderer.setRenderTarget(three.target); await three.renderer.renderAsync(three.world, three.camera);
  const threePixels = await three.renderer.readRenderTargetPixelsAsync(three.target, 0, 0, VIEWPORT.width, VIEWPORT.height);
  three.renderer.setRenderTarget(null); presentReadback("three", normalizeReadback(threePixels));
  const backend = three.renderer.backend as unknown as { isWebGPUBackend?: boolean; constructor?: { name?: string } };
  state[phase] = { interaction: { applied: phase === "after", time }, aura: { publicPackageOnly: true, backend: aura.renderer.device.kind, actualPortableWGSL: true, nativeSubmissions: auraDiagnostics.nativeSubmissions, nativePassthroughSubmissions: auraDiagnostics.nativePassthroughSubmissions, nativeRenderPipelinesCreated: auraDiagnostics.nativeRenderPipelinesCreated, drawCalls: auraDiagnostics.drawCalls, materialStateHash: hash(new TextEncoder().encode(JSON.stringify({ time, colors: COLORS }))) }, three: { revision: THREE.REVISION, actualWebGPURenderer: three.renderer.isWebGPURenderer === true, actualNativeWebGPUBackend: backend.isWebGPUBackend === true, backendName: backend.constructor?.name, actualTSLNodeMaterial: three.nodeMaterial.isNodeMaterial === true, drawCalls: three.renderer.info.render.calls } }; publish();
}

function portableSources() { const vertexGlsl = `#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_position; layout(location=1) in vec3 a_normal; uniform mat4 u_modelViewProjection; uniform mat4 u_normalMatrix; out vec3 v_position; out vec3 v_normal; void main(){v_position=a_position;v_normal=normalize(mat3(u_normalMatrix)*a_normal);gl_Position=u_modelViewProjection*vec4(a_position,1.0);}`; const fragmentGlsl = `#version 300 es\nprecision highp float; uniform float u_time; uniform vec3 u_colorA; uniform vec3 u_colorB; uniform vec3 u_rimColor; in vec3 v_position; in vec3 v_normal; out vec4 outColor; void main(){float field=sin(v_position.x*8.0+u_time*1.7)*cos(v_position.y*7.0-u_time)+sin(v_position.z*9.0);float rim=pow(1.0-abs(normalize(v_normal).z),2.0);outColor=vec4(mix(u_colorA,u_colorB,field*0.25+0.5)+rim*u_rimColor,1.0);}`; const vertexWgsl = `/* @aura3d-bindings */\nstruct Out{@builtin(position) position:vec4<f32>,@location(0) objectPosition:vec3<f32>,@location(1) normal:vec3<f32>};@vertex fn vs_main(@location(0) position:vec3<f32>,@location(1) normal:vec3<f32>)->Out{var o:Out;let clip=aura.u_modelViewProjection*vec4<f32>(position,1.0);o.position=vec4<f32>(clip.xy,clip.z*0.5+clip.w*0.5,clip.w);o.objectPosition=position;o.normal=normalize((aura.u_normalMatrix*vec4<f32>(normal,0.0)).xyz);return o;}`; const fragmentWgsl = `/* @aura3d-bindings */\nstruct In{@location(0) objectPosition:vec3<f32>,@location(1) normal:vec3<f32>};@fragment fn fs_main(input:In)->@location(0) vec4<f32>{let field=sin(input.objectPosition.x*8.0+aura.u_time*1.7)*cos(input.objectPosition.y*7.0-aura.u_time)+sin(input.objectPosition.z*9.0);let rim=pow(1.0-abs(normalize(input.normal).z),2.0);return vec4<f32>(mix(aura.u_colorA,aura.u_colorB,field*0.25+0.5)+rim*aura.u_rimColor,1.0);}`; return { glsl: { vertex: vertexGlsl, fragment: fragmentGlsl }, wgsl: { vertex: vertexWgsl, fragment: fragmentWgsl } }; }
function requiredCanvas(id: string): HTMLCanvasElement { const canvas = document.getElementById(id); if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}`); return canvas; }
function hash(bytes: Uint8Array): string { let value = 2166136261; for (let index = 0; index < bytes.length; index += 1) { value ^= bytes[index]!; value = Math.imul(value, 16777619); } return (value >>> 0).toString(16).padStart(8, "0"); }

function presentReadback(id: "aura" | "three", pixels: Uint8Array | Uint8ClampedArray): void {
  const canvas = requiredCanvas(id); const context = canvas.getContext("2d");
  if (!context) throw new Error(`Missing 2D evidence context for #${id}.`);
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), VIEWPORT.width, VIEWPORT.height), 0, 0);
}

function normalizeReadback(pixels: ArrayBufferView & { readonly length: number; readonly [index: number]: number }): Uint8ClampedArray {
  const rowElements = VIEWPORT.width * 4; const expected = rowElements * VIEWPORT.height;
  if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) {
    if (pixels.length === expected) return new Uint8ClampedArray(pixels);
    const paddedRowElements = Math.ceil(rowElements / 256) * 256;
    const expectedPaddedLength = (VIEWPORT.height - 1) * paddedRowElements + rowElements;
    if (pixels.length !== expectedPaddedLength) throw new Error(`Unexpected byte readback length: ${pixels.length}, expected ${expected} or ${expectedPaddedLength}.`);
    const output = new Uint8ClampedArray(expected);
    for (let row = 0; row < VIEWPORT.height; row += 1) output.set(pixels.subarray(row * paddedRowElements, row * paddedRowElements + rowElements), row * rowElements);
    return output;
  }
  if (pixels.length !== expected) throw new Error(`Unexpected native readback length: ${pixels.constructor.name} ${pixels.length}, expected ${expected}.`);
  const output = new Uint8ClampedArray(expected);
  for (let index = 0; index < expected; index += 1) output[index] = Math.round(Math.max(0, Math.min(1, pixels[index] ?? 0)) * 255);
  return output;
}
