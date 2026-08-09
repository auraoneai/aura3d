import { loadProductionGLTFRenderPipeline } from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { computePerspectiveCameraFrame } from "@aura3d/rendering";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const ASSET = { id: "showcaseHeadphones", url: "/aura-assets/showcaseHeadphones.40b1fdf7.glb", sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833" } as const;
const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const FRAME = { paddingRatio: 0.14, fovYRadians: 45 * Math.PI / 180, yawRadians: -0.34, pitchRadians: -0.12, nearPadding: 0.1, farPadding: 2.2 } as const;

declare global { interface Window { __AURA_THREE_HEAD_TO_HEAD_PRODUCT__?: any; __AURA_THREE_HEAD_TO_HEAD_PRODUCT_ERROR__?: string } }

void run().catch((error) => { window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); });

async function run(): Promise<void> {
  const auraCanvas = canvas("aura"); const threeCanvas = canvas("three");
  const pipeline = await loadProductionGLTFRenderPipeline({ url: ASSET.url, assetId: ASSET.id, assetName: "Aura3D Headphones", width: VIEWPORT.width, height: VIEWPORT.height, rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", frame: FRAME, postprocess: false, frustumCulling: false } });
  const auraRenderer = await A3DRenderer.create({ canvas: auraCanvas, width: VIEWPORT.width, height: VIEWPORT.height, backend: "webgl2", preserveDrawingBuffer: true, antialias: true, clearColor: [0.018, 0.024, 0.04, 1] });

  const threeRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, preserveDrawingBuffer: true });
  threeRenderer.setPixelRatio(1); threeRenderer.setSize(VIEWPORT.width, VIEWPORT.height, false); threeRenderer.outputColorSpace = THREE.SRGBColorSpace; threeRenderer.toneMapping = THREE.ACESFilmicToneMapping; threeRenderer.toneMappingExposure = 1;
  const draco = new DRACOLoader().setDecoderPath("/node_modules/three/examples/jsm/libs/draco/");
  const ktx2 = new KTX2Loader().setTranscoderPath("/node_modules/three/examples/jsm/libs/basis/").detectSupport(threeRenderer);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(ASSET.url);
  const threeScene = new THREE.Scene(); threeScene.background = new THREE.Color(0x05060a); threeScene.environment = new THREE.PMREMGenerator(threeRenderer).fromScene(new RoomEnvironment(), 0.04).texture; threeScene.environmentIntensity = 1; threeScene.add(gltf.scene, new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6); key.position.set(8, 14, 10); threeScene.add(key);
  const box = new THREE.Box3().setFromObject(gltf.scene); const center = box.getCenter(new THREE.Vector3());
  const bounds = { min: [box.min.x, box.min.y, box.min.z] as [number, number, number], max: [box.max.x, box.max.y, box.max.z] as [number, number, number] };
  const camera = new THREE.PerspectiveCamera(45, VIEWPORT.width / VIEWPORT.height, 0.1, 500);
  const controls = new OrbitControls(camera, threeCanvas); controls.target.copy(center); controls.enableDamping = false;

  const render = (yawRadians: number) => {
    const auraInput = pipeline.resources.toRendererInput(VIEWPORT, { qualityPreset: "studio-preview", cameraPolicy: "require", frame: { ...FRAME, yawRadians }, postprocess: false, frustumCulling: false });
    const aura = auraRenderer.render({ source: auraInput.source, camera: auraInput.camera });
    const frame = computePerspectiveCameraFrame(bounds, VIEWPORT, { ...FRAME, yawRadians });
    camera.fov = frame.fovYRadians * 180 / Math.PI; camera.aspect = frame.aspect; camera.near = frame.near; camera.far = frame.far; camera.position.set(...frame.cameraPosition); controls.target.set(...frame.center); camera.lookAt(...frame.center); camera.updateProjectionMatrix(); controls.update(); threeRenderer.render(threeScene, camera);
    return { aura, auraHash: pixelHash(auraRenderer.device.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height)), threeHash: pixelHash(readThree(threeRenderer)), frame };
  };
  const initial = render(FRAME.yawRadians);
  window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT__ = state(initial, false);
  document.getElementById("orbit")?.addEventListener("click", () => { const after = render(FRAME.yawRadians + 0.42); window.__AURA_THREE_HEAD_TO_HEAD_PRODUCT__ = state(after, true, initial); });

  function state(value: ReturnType<typeof render>, interacted: boolean, before?: ReturnType<typeof render>) { return { ready: true, workload: "gltf-product-viewer", asset: ASSET, viewport: VIEWPORT, aura: { publicPackageOnly: true, drawCalls: value.aura.drawCalls, metadata: pipeline.metadata }, three: { revision: THREE.REVISION, actualRenderer: threeRenderer instanceof THREE.WebGLRenderer, actualGLTFLoader: loader instanceof GLTFLoader, addons: { draco: draco instanceof DRACOLoader, ktx2: ktx2 instanceof KTX2Loader, meshopt: Boolean(MeshoptDecoder), orbit: controls instanceof OrbitControls }, drawCalls: threeRenderer.info.render.calls, triangles: threeRenderer.info.render.triangles }, interaction: { applied: interacted, auraChanged: before ? before.auraHash !== value.auraHash : false, threeChanged: before ? before.threeHash !== value.threeHash : false }, hashes: { aura: value.auraHash, three: value.threeHash }, bounds }; }
}

function canvas(id: string): HTMLCanvasElement { const result = document.getElementById(id); if (!(result instanceof HTMLCanvasElement)) throw new Error(`Missing ${id}`); return result; }
function readThree(renderer: THREE.WebGLRenderer): Uint8Array { const gl = renderer.getContext(); const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4); gl.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; }
function pixelHash(pixels: Uint8Array): string { let hash = 2166136261; for (let i = 0; i < pixels.length; i += 97) { hash ^= pixels[i]!; hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
