// The three.js original: the same factory, seed and params the bridge ran headless, rendered with WebGLRenderer.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { recipeFromQuery, recipes } from "./recipes.mjs";
import { seededRandom } from "./seeded.mjs";

const TONE = { none: THREE.NoToneMapping, linear: THREE.LinearToneMapping, reinhard: THREE.ReinhardToneMapping, cineon: THREE.CineonToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };
const { name, seed } = recipeFromQuery();
const mod = recipes[name];
const random = seededRandom(seed);
const original = Math.random;
Math.random = random;
const override = JSON.parse(new URLSearchParams(location.search).get("params") ?? "{}");
const result = await mod.default({ THREE, seed, random, params: { ...(mod.params ?? {}), ...override }, mode: "browser" });
Math.random = original;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = TONE[result.renderer?.toneMapping ?? "none"];
renderer.toneMappingExposure = result.renderer?.exposure ?? 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("app").appendChild(renderer.domElement);
if (result.environment?.kind === "room") {
  const pmrem = new THREE.PMREMGenerator(renderer);
  result.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  result.scene.environmentIntensity = result.environment.intensity ?? 1;
}
const camera = result.camera;
camera.aspect = innerWidth / innerHeight;
if (result.cameraTarget) camera.lookAt(...result.cameraTarget);
camera.updateProjectionMatrix();
renderer.render(result.scene, camera);
requestAnimationFrame(() => { renderer.render(result.scene, camera); window.__BRIDGE_READY__ = true; });
