import * as THREE from 'three';
import { addCaustics, groundY, timeU } from './common';
import { buildReef } from './corals';
import { buildAnemones, buildFish, buildParticles, buildSeaweed } from './life';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#app canvas missing');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const FOG_HEX = 0x0c6372;
const TOP_HEX = 0x46d0c8;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_HEX);
scene.fog = new THREE.FogExp2(FOG_HEX, 0.052);

const camera = new THREE.PerspectiveCamera(52, 640 / 360, 0.1, 400);

/* lights: sun from above plus blue-green ambient */
scene.add(new THREE.HemisphereLight(0x6fd8e8, 0x1c5a58, 1.5));
const sun = new THREE.DirectionalLight(0xc8ffe8, 2.8);
sun.position.set(-6, 18, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -14;
sc.right = 14;
sc.top = 14;
sc.bottom = -14;
sc.near = 4;
sc.far = 45;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);

/* water backdrop: horizon matches fog, brighter towards the surface */
const hex3 = (h: number): THREE.Vector3 => new THREE.Vector3((h >> 16) & 255, (h >> 8) & 255, h & 255).divideScalar(255);
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uLow: { value: hex3(FOG_HEX) }, uHigh: { value: hex3(TOP_HEX) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uLow; uniform vec3 uHigh; varying vec3 vDir;
      void main(){ float k = smoothstep(0.0, 0.8, vDir.y); gl_FragColor = vec4(mix(uLow, uHigh, k * 0.9), 1.0); }`,
  }),
);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

/* sandy seabed with ripples */
{
  const size = 90;
  const seg = 360;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const light = new THREE.Color(0xe6d3a2);
  const dark = new THREE.Color(0xa8946a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundY(x, z);
    pos.setY(i, h);
    const w = x * 0.9 + z * 0.35 + 1.3 * Math.sin(z * 0.3 + x * 0.12);
    const crest = 0.5 + 0.5 * Math.sin(w * 2.6);
    const speck = 0.5 + 0.5 * Math.sin(x * 7.1) * Math.sin(z * 6.3);
    c.copy(dark).lerp(light, 0.25 + 0.6 * crest + 0.15 * speck);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  addCaustics(m, 1.5);
  const sand = new THREE.Mesh(g, m);
  sand.receiveShadow = true;
  scene.add(sand);
}

scene.add(buildReef());
scene.add(buildSeaweed());
scene.add(buildAnemones());

const fish = buildFish();
scene.add(fish.school, fish.big);

const particles = buildParticles();
scene.add(particles.bubbles, particles.snow);

/* light shafts */
const rays: THREE.Mesh[] = [];
{
  const mat = (phase: number, strength: number): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: timeU, uPhase: { value: phase }, uStrength: { value: strength } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          vH = uv.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uTime; uniform float uPhase; uniform float uStrength;
        varying vec3 vN; varying vec3 vV; varying float vH;
        void main(){
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
          float flick = 0.65 + 0.35 * sin(uTime * 0.6 + uPhase);
          float a = edge * pow(vH, 1.6) * flick * uStrength;
          gl_FragColor = vec4(vec3(0.35, 0.85, 0.75) * a, a);
        }`,
    });
  const dir = new THREE.Vector3(6, -18, -5).normalize(); // matches the sun direction
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const r = 1 + (i % 4) * 2.2;
    const topW = 0.9 + (i % 3) * 0.5;
    const g = new THREE.CylinderGeometry(topW, topW * 0.35, 20, 18, 1, true);
    const m = new THREE.Mesh(g, mat(i * 1.7, 0.16));
    // cylinder axis follows the sun direction, top end near the surface
    m.quaternion.setFromUnitVectors(up, dir.clone().negate());
    m.position.set(Math.cos(a) * r, 8, Math.sin(a) * r);
    m.renderOrder = 5;
    m.frustumCulled = false;
    rays.push(m);
    scene.add(m);
  }
}

const clock = new THREE.Clock();
let first = true;

function frame(): void {
  const t = clock.getElapsedTime();
  timeU.value = t;

  const ang = t * 0.1;
  const radius = 13 + 0.8 * Math.sin(t * 0.13);
  const bob = Math.sin(t * 0.6);
  camera.position.set(Math.cos(ang) * radius, 3.5 + 0.35 * bob, Math.sin(ang) * radius);
  camera.lookAt(0, 1.4 + 0.15 * Math.sin(t * 0.6 + 1), 0);
  sky.position.copy(camera.position);

  fish.update(t);
  particles.update(t);

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
