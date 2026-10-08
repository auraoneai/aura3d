/**
 * Lane adapter `prd06-morph-face` (PRD-06 T2.9), three side: RobotExpressive
 * held at the spec's fixed named morph weights. Bespoke runner (not
 * runThreeScene) because the shared path has no morph-weight field — weights
 * are written as `mesh.morphTargetInfluences[morphTargetDictionary[name]]`
 * after the GLB loads, matching the aura adapter's `setMorphTargets` record.
 */
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { CSM } from "three/addons/csm/CSM.js";
import { hdriAssets, modelAssets } from "../../../shared/assets";
import { fetchOnce } from "../../../shared/fetch-once";
import type { CapabilityEntry, ReadyPayload } from "../../../shared/types";
import { prd06MorphFace } from "../../../scenes/prd06/morph-face";

declare const __THREE_VERSION__: string;
declare global {
  interface Window {
    __QR_THREE_GRAPH__?: import("../../common").ThreeGraph;
  }
}

export default async function run(host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }): Promise<ReadyPayload> {
  const started = performance.now();
  const spec = prd06MorphFace;
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * (opts?.dpr ?? 1);
  const errors: string[] = [];
  const capabilityLog: CapabilityEntry[] = [];

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(spec.resolution.width, spec.resolution.height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene3 = new THREE.Scene();
  if (spec.background.kind === "color") scene3.background = new THREE.Color(spec.background.color);

  const camera3 = new THREE.PerspectiveCamera(spec.camera.fov, spec.resolution.width / spec.resolution.height, spec.camera.near, spec.camera.far);
  camera3.position.set(...spec.camera.position);
  camera3.lookAt(...spec.camera.target);
  camera3.updateMatrixWorld(true);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = new HDRLoader().createDataTexture(await fetchOnce(hdriAssets[spec.environment!.hdri].url));
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene3.environment = envMap;
  scene3.environmentIntensity = spec.environment!.intensity;
  scene3.environmentRotation.y = spec.environment!.rotation;
  hdr.dispose();
  pmrem.dispose();

  const sun = spec.lights[0] as Extract<(typeof spec.lights)[number], { kind: "directional" }>;
  const csm = new CSM({
    camera: camera3,
    parent: scene3,
    cascades: 4,
    maxFar: spec.camera.far,
    mode: "practical",
    shadowMapSize: spec.shadows!.mapSize,
    shadowBias: spec.shadows!.bias ?? 0,
    lightDirection: new THREE.Vector3(sun.target[0] - sun.position[0], sun.target[1] - sun.position[1], sun.target[2] - sun.position[2]).normalize(),
    lightIntensity: sun.intensity
  });
  for (const light of csm.lights) {
    light.color.set(sun.color);
    light.shadow.normalBias = spec.shadows!.normalBias ?? 0;
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshStandardMaterial({ color: "#6d7076", roughness: 0.9, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  csm.setupMaterial(ground.material as THREE.Material);
  scene3.add(ground);

  const gltf: GLTF = await new GLTFLoader().loadAsync(modelAssets.robotExpressive.url);
  const robot = gltf.scene;
  robot.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mesh.material) csm.setupMaterial(mesh.material as THREE.Material);
    }
  });
  scene3.add(robot);

  // Apply the fixed-frame weights to every morph-capable mesh by target name.
  const applied: string[] = [];
  robot.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh & { morphTargetInfluences?: number[]; morphTargetDictionary?: Record<string, number> };
    if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;
    for (const [name, weight] of Object.entries(spec.morphFace.weights)) {
      const index = mesh.morphTargetDictionary[name];
      if (index === undefined) {
        if (!errors.some((entry) => entry.includes(name))) errors.push(`morph target "${name}" missing on ${mesh.name || "mesh"}`);
        continue;
      }
      mesh.morphTargetInfluences[index] = weight;
      applied.push(`${mesh.name}:${name}=${weight}`);
    }
  });
  capabilityLog.push({ feature: "morph-face-weights", status: applied.length > 0 ? "supported" : "missing", detail: applied.join(", ") || "no morphTargetInfluences on robot-expressive" });

  renderer.render(scene3, camera3);
  for (let i = 0; i < spec.settleFrames; i += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve(undefined)));
    renderer.render(scene3, camera3);
  }

  window.__QR_THREE_GRAPH__ = { scene: scene3, camera: camera3, renderer, lights: csm.lights };

  return {
    engine: "three",
    scene: spec.id,
    engineVersion: typeof __THREE_VERSION__ === "string" ? __THREE_VERSION__ : "three",
    capabilityLog,
    warnings: [],
    errors,
    loadMs: Math.round(performance.now() - started),
    variant: "default",
    dpr: opts?.dpr ?? 1,
    appliedToneMapping: "aces-filmic",
    appliedExposure: spec.exposure,
    lightUnits: "three-physical",
    shadows: null,
    fallbackLightsActive: null,
    assetHashes: { robotExpressive: modelAssets.robotExpressive.sha256 },
    qrFlags: opts?.qrFlags ?? spec.qrFlags ?? [],
    extra: { morphFaceWeights: spec.morphFace.weights }
  } as ReadyPayload;
}
