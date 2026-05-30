// Dynamic particle fountain rendered on a transparent overlay canvas.
//
// Aura3D's declarative scene API renders static geometry; it has no per-frame
// per-particle simulation hook. So the fountain — gravity integration, ground
// collision, lifetime colouring and a live emission rate — is simulated here and
// drawn with Three.js (the same renderer Aura3D uses under the hood) into a
// transparent canvas stacked exactly on top of the Aura3D canvas. The overlay
// camera mirrors `CAMERA` so the particles sit on the Aura-rendered ground plane
// and rise from the Aura-rendered emitter.

import * as THREE from "three";
import { CAMERA, COLOR_STOPS, FOUNTAIN } from "./config";

function rampColor(t: number, out: THREE.Color): void {
  const stops = COLOR_STOPS;
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  const k = Math.min(1, Math.max(0, (t - lo.t) / span));
  const r = lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * k;
  const g = lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * k;
  const b = lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * k;
  // Brightness envelope: bright at birth, fading to nothing at death so additive
  // recycling is invisible. Also gives the falling tails a soft taper.
  let env = 1.0;
  if (t > 0.92) env = Math.max(0, 1 - (t - 0.92) / 0.08);
  out.setRGB(r * env, g * env, b * env);
}

function makeSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.25)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface Fountain {
  /** Advance the simulation and render one frame. */
  frame(nowMs: number): void;
  /** Match the overlay buffer + camera to the Aura3D canvas. */
  resize(width: number, height: number): void;
  /** Particles emitted per second. */
  setRate(rate: number): void;
  getRate(): number;
  /** Number of currently-alive particles. */
  getActiveCount(): number;
  dispose(): void;
}

export function createFountain(canvas: HTMLCanvasElement): Fountain {
  const N = FOUNTAIN.maxParticles;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  cam.position.set(CAMERA.position[0], CAMERA.position[1], CAMERA.position[2]);
  cam.lookAt(CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]);

  // Per-particle state.
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pz = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const vz = new Float32Array(N);
  const age = new Float32Array(N);
  const life = new Float32Array(N);
  const alive = new Uint8Array(N);

  // Free-slot stack for O(1) spawn/recycle.
  const freeList = new Int32Array(N);
  let freeTop = N;
  for (let i = 0; i < N; i++) freeList[i] = i;

  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  // Park everything far below the scene until spawned.
  for (let i = 0; i < N; i++) positions[i * 3 + 1] = -1000;

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("color", colAttr);

  const sprite = makeSpriteTexture();
  const pointsMaterial = new THREE.PointsMaterial({
    size: 0.12,
    sizeAttenuation: true,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, pointsMaterial);
  points.frustumCulled = false;
  scene.add(points);

  const tmpColor = new THREE.Color();

  let rate = FOUNTAIN.rateDefault;
  let emitAccumulator = 0;
  let activeCount = 0;
  let lastMs = -1;

  function spawn(): void {
    if (freeTop === 0) return; // pool exhausted
    const i = freeList[--freeTop];
    alive[i] = 1;
    activeCount++;
    px[i] = FOUNTAIN.origin[0];
    py[i] = FOUNTAIN.origin[1];
    pz[i] = FOUNTAIN.origin[2];
    const up = FOUNTAIN.speedUpMin + Math.random() * (FOUNTAIN.speedUpMax - FOUNTAIN.speedUpMin);
    const ang = Math.random() * Math.PI * 2;
    const spread =
      FOUNTAIN.spreadMin + Math.sqrt(Math.random()) * (FOUNTAIN.spreadMax - FOUNTAIN.spreadMin);
    vx[i] = Math.cos(ang) * spread;
    vy[i] = up;
    vz[i] = Math.sin(ang) * spread;
    age[i] = 0;
    life[i] = FOUNTAIN.lifeMin + Math.random() * (FOUNTAIN.lifeMax - FOUNTAIN.lifeMin);
  }

  function kill(i: number): void {
    alive[i] = 0;
    activeCount--;
    positions[i * 3 + 1] = -1000;
    colors[i * 3] = 0;
    colors[i * 3 + 1] = 0;
    colors[i * 3 + 2] = 0;
    freeList[freeTop++] = i;
  }

  function step(dt: number): void {
    // Emit based on rate.
    emitAccumulator += rate * dt;
    let toEmit = Math.floor(emitAccumulator);
    emitAccumulator -= toEmit;
    while (toEmit-- > 0) spawn();

    const g = FOUNTAIN.gravity;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      age[i] += dt;
      if (age[i] >= life[i]) {
        kill(i);
        continue;
      }
      // Gravity + integration.
      vy[i] -= g * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;

      // Ground collision: bounce with energy loss + friction.
      if (py[i] <= FOUNTAIN.groundY && vy[i] < 0) {
        py[i] = FOUNTAIN.groundY;
        vy[i] = -vy[i] * FOUNTAIN.restitution;
        vx[i] *= FOUNTAIN.groundFriction;
        vz[i] *= FOUNTAIN.groundFriction;
        // Spend remaining life faster once it has hit the basin.
        age[i] = Math.max(age[i], life[i] * 0.72);
      }

      const b = i * 3;
      positions[b] = px[i];
      positions[b + 1] = py[i];
      positions[b + 2] = pz[i];
      rampColor(age[i] / life[i], tmpColor);
      colors[b] = tmpColor.r;
      colors[b + 1] = tmpColor.g;
      colors[b + 2] = tmpColor.b;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  return {
    frame(nowMs: number) {
      const dt = lastMs < 0 ? 1 / 60 : Math.min(0.05, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      step(dt);
      renderer.render(scene, cam);
    },
    resize(width: number, height: number) {
      renderer.setSize(width, height, false);
      cam.aspect = width / Math.max(1, height);
      cam.updateProjectionMatrix();
    },
    setRate(next: number) {
      rate = Math.max(0, Math.min(FOUNTAIN.rateMax, next));
    },
    getRate() {
      return rate;
    },
    getActiveCount() {
      return activeCount;
    },
    dispose() {
      geometry.dispose();
      pointsMaterial.dispose();
      sprite.dispose();
      renderer.dispose();
    },
  };
}
