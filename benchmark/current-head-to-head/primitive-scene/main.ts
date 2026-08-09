import { Geometry, PBRMaterial, Renderer, type CollectedLight } from "@aura3d/rendering";
import { DirectionalLight, composeMat4, lookAtMat4, multiplyMat4, perspectiveMat4 } from "@aura3d/scene";
import * as THREE from "three";

const CONTRACT = {
  viewport: { width: 1440, height: 900, dpr: 1 },
  camera: { position: [8, 6, 12] as const, target: [0, 1, 0] as const, fovYDegrees: 45, near: 0.1, far: 500 },
  lighting: { keyPosition: [8, 14, 10] as const, keyColor: "#fff4e6", keyIntensity: 2.6, ambientIntensity: 0.35 },
  color: { output: "srgb", toneMapping: "aces", exposure: 1 }
} as const;

type WorkloadState = {
  readonly ready: true;
  readonly workload: "primitive-scene";
  readonly contract: typeof CONTRACT;
  readonly aura: { readonly publicPackageOnly: true; readonly drawCalls: number; readonly litPixels: number };
  readonly three: { readonly revision: string; readonly actualRenderer: true; readonly drawCalls: number; readonly triangles: number; readonly litPixels: number };
};

declare global { interface Window { __AURA_THREE_HEAD_TO_HEAD_PRIMITIVE__?: WorkloadState; __AURA_THREE_HEAD_TO_HEAD_PRIMITIVE_ERROR__?: string } }

void run().catch((error) => { window.__AURA_THREE_HEAD_TO_HEAD_PRIMITIVE_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); });

async function run(): Promise<void> {
  const auraCanvas = requiredCanvas("aura");
  const threeCanvas = requiredCanvas("three");
  const aspect = CONTRACT.viewport.width / CONTRACT.viewport.height;
  const view = lookAtMat4(CONTRACT.camera.position, CONTRACT.camera.target, [0, 1, 0]);
  const projection = perspectiveMat4(CONTRACT.camera.fovYDegrees * Math.PI / 180, aspect, CONTRACT.camera.near, CONTRACT.camera.far);
  const viewProjection = multiplyMat4(projection, view);

  const auraRenderer = await Renderer.create({ backend: "webgl2", canvas: auraCanvas, width: 1440, height: 900, antialias: true, preserveDrawingBuffer: true, clearColor: [0.018, 0.024, 0.04, 1] });
  const cube = Geometry.litCube(1);
  const sphere = Geometry.uvSphere(0.5, 48, 24);
  const floor = Geometry.litCube(1);
  const blue = new PBRMaterial({ name: "primitive-blue", baseColor: [0.08, 0.34, 0.92, 1], metallic: 0.2, roughness: 0.32, environmentIntensity: 0.35 });
  const orange = new PBRMaterial({ name: "primitive-orange", baseColor: [0.95, 0.28, 0.07, 1], metallic: 0.05, roughness: 0.48, environmentIntensity: 0.35 });
  const ground = new PBRMaterial({ name: "primitive-ground", baseColor: [0.24, 0.27, 0.32, 1], metallic: 0, roughness: 0.78, environmentIntensity: 0.35 });
  const key = new DirectionalLight("head-to-head-key");
  key.color = [1, 0.906, 0.796];
  key.intensity = CONTRACT.lighting.keyIntensity;
  const light: CollectedLight = { kind: "directional", color: key.color, intensity: key.intensity, position: CONTRACT.lighting.keyPosition, direction: [-8, -13, -10], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key };
  const auraDiagnostics = auraRenderer.render({
    renderItems: [
      { label: "ground", geometry: floor, material: ground, modelMatrix: composeMat4([0, -0.08, 0], [0, 0, 0, 1], [8, 0.12, 7]) },
      { label: "blue-cube", geometry: cube, material: blue, modelMatrix: composeMat4([-1.15, 0.7, 0], [0, 0.28, 0, 0.96], [1.25, 1.25, 1.25]) },
      { label: "orange-sphere", geometry: sphere, material: orange, modelMatrix: composeMat4([1.2, 0.8, 0.15], [0, 0, 0, 1], [1.35, 1.35, 1.35]) }
    ],
    collectedLights: [light],
    cameraPosition: CONTRACT.camera.position,
    postprocess: { toneMapping: { operator: "aces", exposure: 1, inputColorSpace: "linear", outputColorSpace: "srgb" } }
  }, { viewMatrix: view, projectionMatrix: projection, viewProjectionMatrix: viewProjection });
  await nextFrame();
  const auraLitPixels = litPixels(auraRenderer.device.readPixels(0, 0, 1440, 900));

  const threeRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, preserveDrawingBuffer: true });
  threeRenderer.setPixelRatio(1); threeRenderer.setSize(1440, 900, false); threeRenderer.setClearColor(0x05060a, 1);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace; threeRenderer.toneMapping = THREE.ACESFilmicToneMapping; threeRenderer.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500); camera.position.set(...CONTRACT.camera.position); camera.lookAt(...CONTRACT.camera.target);
  scene.add(new THREE.AmbientLight(0xffffff, CONTRACT.lighting.ambientIntensity));
  const threeKey = new THREE.DirectionalLight(CONTRACT.lighting.keyColor, CONTRACT.lighting.keyIntensity); threeKey.position.set(...CONTRACT.lighting.keyPosition); scene.add(threeKey);
  const threeGround = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 7), new THREE.MeshStandardMaterial({ color: 0x3d454f, metalness: 0, roughness: 0.78 })); threeGround.position.y = -0.08;
  const threeCube = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), new THREE.MeshStandardMaterial({ color: 0x1457eb, metalness: 0.2, roughness: 0.32 })); threeCube.position.set(-1.15, 0.7, 0); threeCube.rotation.y = 0.56;
  const threeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.675, 48, 24), new THREE.MeshStandardMaterial({ color: 0xf24712, metalness: 0.05, roughness: 0.48 })); threeSphere.position.set(1.2, 0.8, 0.15);
  scene.add(threeGround, threeCube, threeSphere); threeRenderer.render(scene, camera); await nextFrame();
  const gl = threeCanvas.getContext("webgl2")!; const pixels = new Uint8Array(1440 * 900 * 4); gl.readPixels(0, 0, 1440, 900, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  window.__AURA_THREE_HEAD_TO_HEAD_PRIMITIVE__ = { ready: true, workload: "primitive-scene", contract: CONTRACT, aura: { publicPackageOnly: true, drawCalls: auraDiagnostics.drawCalls, litPixels: auraLitPixels }, three: { revision: THREE.REVISION, actualRenderer: true, drawCalls: threeRenderer.info.render.calls, triangles: threeRenderer.info.render.triangles, litPixels: litPixels(pixels) } };
}

function requiredCanvas(id: string): HTMLCanvasElement { const value = document.getElementById(id); if (!(value instanceof HTMLCanvasElement)) throw new Error(`Missing ${id} canvas`); return value; }
function nextFrame(): Promise<void> { return new Promise((resolve) => requestAnimationFrame(() => resolve())); }
function litPixels(pixels: Uint8Array): number { let count = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 45) count++; return count; }
