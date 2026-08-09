/** Locked `three@0.185.1` TSL control for Aura3D WS-3.3. Not a public Aura3D example. */
import * as THREE from "three/webgpu";
import {
  abs,
  color,
  cos,
  fract,
  max,
  mix,
  normalView,
  positionLocal,
  sin,
  smoothstep,
  texture,
  uniform,
  uv
} from "three/tsl";

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("Three TSL control canvas is missing");
const forceWebGL = new URLSearchParams(location.search).get("backend") === "webgl2";
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL });
renderer.setSize(canvas.width, canvas.height, false);
renderer.setClearColor(0x050711, 1);
await renderer.init();

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-2.25, 2.25, 1.16, -1.16, 0.1, 20);
camera.position.z = 5;
const geometry = new THREE.SphereGeometry(0.58, 48, 28);
const time = uniform(0.72);

const plasma = new THREE.MeshBasicNodeMaterial();
const field = sin(positionLocal.x.mul(11).add(time.mul(1.7)))
  .mul(cos(positionLocal.y.mul(9).sub(time)))
  .add(sin(positionLocal.z.mul(13)));
const rim = abs(normalView.z).oneMinus().pow(2.2);
plasma.colorNode = mix(color(0x122ef2), color(0xed149e), field.mul(0.25).add(0.5))
  .add(rim.mul(color(0x476be6)));

const contour = new THREE.MeshBasicNodeMaterial();
const height = positionLocal.y.add(sin(positionLocal.x.mul(5).add(time)).mul(0.14));
const wave = abs(fract(height.mul(8)).sub(0.5));
const line = smoothstep(0.035, 0.13, wave).oneMinus();
const gridDistance = abs(fract(uv().mul(12)).sub(0.5));
const grid = smoothstep(0.015, 0.055, gridDistance.x.min(gridDistance.y)).oneMinus();
contour.colorNode = mix(color(0x050913), color(0x0df2b8), max(line, grid.mul(0.35)));

const signalData = new Uint8Array([
  255,94,68,255, 255,187,73,255, 55,231,211,255, 109,113,255,255,
  91,51,215,255, 231,72,170,255, 65,204,255,255, 255,129,72,255,
  42,223,183,255, 94,116,255,255, 255,70,143,255, 255,203,75,255,
  116,84,241,255, 46,220,236,255, 246,87,112,255, 139,243,126,255
]);
const signalTexture = new THREE.DataTexture(signalData, 4, 4, THREE.RGBAFormat);
signalTexture.needsUpdate = true;
const dissolve = new THREE.MeshBasicNodeMaterial();
const sampled = texture(signalTexture, uv()).rgb;
const pseudoNoise = fract(sin(positionLocal.x.add(positionLocal.y.mul(7.17)).add(positionLocal.z.mul(13.91))).mul(43758.5453));
const threshold = uniform(0.38).add(sin(time).mul(0.08));
const edge = smoothstep(0, 0.16, pseudoNoise.sub(threshold).add(0.16)).oneMinus();
dissolve.colorNode = mix(sampled, color(0xff470a), edge);

const materials = [plasma, contour, dissolve] as const;
for (const [index, material] of materials.entries()) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = (index - 1) * 1.38;
  mesh.rotation.y = 0.26 + index * 0.18;
  scene.add(mesh);
}
await renderer.renderAsync(scene, camera);

Object.assign(window as unknown as Record<string, unknown>, {
  __THREE_TSL_MATERIAL_CONTROL__: {
    ready: true,
    version: THREE.REVISION,
    backend: forceWebGL ? "webgl2" : "webgpu",
    materialCount: materials.length,
    tsl: true
  }
});
