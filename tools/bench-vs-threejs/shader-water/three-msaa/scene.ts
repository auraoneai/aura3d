import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { paintNoise } from "../../shared/noise-canvas";
import type { SceneHandle } from "../../shared/glue";

const WATER_VERTEX = /* glsl */ `
uniform float waterTime;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  p.y += sin(p.x * 0.7 + waterTime * 1.2) * 0.18 + sin(p.z * 0.9 - waterTime * 0.9) * 0.14;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const WATER_FRAGMENT = /* glsl */ `
uniform float waterTime;
uniform sampler2D noiseMap;
varying vec3 vWorld;
void main() {
  vec2 uv = vWorld.xz * 0.08;
  vec3 n1 = texture2D(noiseMap, fract(uv + vec2(waterTime * 0.02, 0.0))).rgb;
  vec3 n2 = texture2D(noiseMap, fract(uv * 2.3 - vec2(0.0, waterTime * 0.03))).rgb;
  vec3 n = normalize(vec3((n1.r - 0.5) * 0.7, 1.0, (n2.g - 0.5) * 0.7));
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 r = reflect(-v, n);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 sky = mix(vec3(0.42, 0.62, 0.78), vec3(0.06, 0.24, 0.52), pow(max(r.y, 0.0), 0.5));
  float sun = pow(max(dot(r, normalize(vec3(0.4, 0.35, -1.0))), 0.0), 220.0);
  vec3 col = mix(vec3(0.02, 0.10, 0.12), sky, 0.25 + 0.75 * fres) + sun * vec3(1.0, 0.85, 0.6) * 2.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SKY_FRAGMENT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 c = mix(vec3(0.78, 0.86, 0.92), vec3(0.06, 0.24, 0.52), pow(up, 0.45));
  c += vec3(1.0, 0.8, 0.5) * pow(max(dot(d, normalize(vec3(0.4, 0.35, -1.0))), 0.0), 600.0) * 3.0;
  gl_FragColor = vec4(c, 1.0);
}`;

const GRADE_PASS = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.6 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uVignette;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  c.rgb *= 1.0 - smoothstep(0.35, 0.85, distance(vUv, vec2(0.5))) * uVignette;
  c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 1.0, 0.92), 0.5);
  gl_FragColor = c;
}`
};

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 640 / 360, 0.1, 1000);
  camera.position.set(0, 2.2, 9);
  camera.lookAt(0, 1, -10);

  const noiseMap = new THREE.CanvasTexture(paintNoise());
  const uniforms = { waterTime: { value: 0 }, noiseMap: { value: noiseMap } };
  const planeGeometry = new THREE.PlaneGeometry(80, 80, 96, 96);
  planeGeometry.rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(planeGeometry, new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT })));
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false })));

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(640, 360, { samples: 4, type: THREE.HalfFloatType }));
  composer.setSize(640, 360);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(GRADE_PASS));
  composer.addPass(new OutputPass());

  let t = 0;
  return { frame(dt) { t += dt; uniforms.waterTime.value = t; composer.render(dt); } };
}
