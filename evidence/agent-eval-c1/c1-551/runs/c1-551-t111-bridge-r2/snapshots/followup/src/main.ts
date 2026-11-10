import {
  camera,
  createAuraApp,
  environments,
  lights,
  material,
  primitives,
  scene,
  texture,
  type AuraMaterialSpec,
  type AuraSceneBuilder
} from "@aura3d/engine";
import { cosmosModel, cosmosOutput } from "./three-bridge/cosmos.bridge";

type Vec3 = [number, number, number];

interface PlanetDef {
  name: string;
  radius: number; // scene units
  orbit: number; // scene units (matches recipes/cosmos.mjs orbit lines)
  periodDays: number; // Earth days
  distanceMkm: number; // million km from the star
  base: Vec3; // base colour 0-255
  accent: Vec3;
  bands: number;
  bandStrength: number;
  blotch: number;
  ring?: boolean;
  moon?: boolean;
}

const SIZE_SCALE = 1.3;
const PLANETS: PlanetDef[] = ([
  { name: "Mercury", radius: 0.3, orbit: 5, periodDays: 88, distanceMkm: 57.9, base: [150, 140, 130], accent: [90, 85, 80], bands: 0, bandStrength: 0, blotch: 0.5 },
  { name: "Venus", radius: 0.5, orbit: 7.4, periodDays: 224.7, distanceMkm: 108.2, base: [226, 180, 110], accent: [190, 130, 70], bands: 5, bandStrength: 0.18, blotch: 0.3 },
  { name: "Earth", radius: 0.55, orbit: 9.8, periodDays: 365.25, distanceMkm: 149.6, base: [40, 100, 190], accent: [70, 160, 80], bands: 0, bandStrength: 0, blotch: 0.9, moon: true },
  { name: "Mars", radius: 0.4, orbit: 12.4, periodDays: 687, distanceMkm: 227.9, base: [196, 92, 58], accent: [120, 50, 34], bands: 0, bandStrength: 0, blotch: 0.55 },
  { name: "Jupiter", radius: 1.3, orbit: 17, periodDays: 4332.6, distanceMkm: 778.5, base: [214, 170, 130], accent: [150, 96, 66], bands: 14, bandStrength: 0.5, blotch: 0.15 },
  { name: "Saturn", radius: 1.1, orbit: 22, periodDays: 10759, distanceMkm: 1432, base: [226, 205, 150], accent: [190, 160, 105], bands: 10, bandStrength: 0.3, blotch: 0.08, ring: true },
  { name: "Uranus", radius: 0.8, orbit: 26.5, periodDays: 30687, distanceMkm: 2867, base: [140, 215, 224], accent: [110, 190, 205], bands: 4, bandStrength: 0.1, blotch: 0.05 },
  { name: "Neptune", radius: 0.75, orbit: 30.5, periodDays: 60190, distanceMkm: 4515, base: [60, 90, 220], accent: [40, 60, 170], bands: 6, bandStrength: 0.2, blotch: 0.12 }
] as PlanetDef[]).map((p) => ({ ...p, radius: p.radius * SIZE_SCALE }));

// Visual angular speed (rad/s): inner planets faster, compressed so outer planets still visibly move.
const speedOf = (p: PlanetDef): number => (Math.PI * 2) / (Math.pow(p.periodDays, 0.6) * 1.15);
const spinOf = (i: number): number => (i % 2 === 0 ? 1 : -0.7) * (1.2 + (i % 3) * 0.5);

const MOON = { orbit: 1.3, radius: 0.16, speed: 1.9 };
const SUN_RADIUS = 1.8;

// ---------- procedural textures ----------
const hash = (x: number, y: number, seed: number): number => {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
// Value noise that wraps horizontally (period px cells) so the texture has no seam.
const noise = (u: number, v: number, px: number, seed: number): number => {
  const x = u * px;
  const y = v * (px / 2);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (xx: number): number => ((xx % px) + px) % px;
  const a = hash(w(x0), y0, seed);
  const b = hash(w(x0 + 1), y0, seed);
  const c = hash(w(x0), y0 + 1, seed);
  const d = hash(w(x0 + 1), y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

function makePlanetTexture(def: PlanetDef, seed: number) {
  const W = 128;
  const H = 64;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const u = x / W;
      const v = y / H;
      const n = noise(u, v, 8, seed) * 0.6 + noise(u, v, 16, seed + 7) * 0.3 + noise(u, v, 32, seed + 13) * 0.1;
      let t = Math.max(0, Math.min(1, (n - 0.5) * 2 * def.blotch + 0.5));
      if (def.bands > 0) {
        const wob = (noise(u, v, 8, seed + 3) - 0.5) * 0.35;
        const s = Math.sin((v + wob * 0.15) * def.bands * Math.PI * 2) * 0.5 + 0.5;
        t = t * (1 - def.bandStrength * 2) + s * def.bandStrength * 2;
        t = Math.max(0, Math.min(1, t));
      }
      let r = def.base[0] + (def.accent[0] - def.base[0]) * t;
      let g = def.base[1] + (def.accent[1] - def.base[1]) * t;
      let b = def.base[2] + (def.accent[2] - def.base[2]) * t;
      if (def.name === "Earth") {
        // Land / ocean split and polar caps.
        const land = n > 0.54;
        if (land) {
          r = def.accent[0] + (n - 0.54) * 200;
          g = def.accent[1];
          b = def.accent[2];
        }
        const polar = Math.abs(v - 0.5) * 2;
        if (polar > 0.88) {
          r = 235;
          g = 240;
          b = 245;
        }
      }
      const i = (y * W + x) * 4;
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }
  }
  return texture.data({ width: W, height: H, data, format: "rgba8", colorSpace: "srgb" });
}

// ---------- scene ----------
const planetId = (i: number): string => `planet-${i}`;
const ringId = "saturn-ring";
const moonId = "earth-moon";

const OVERVIEW_BG = "#02030a";
let stage: AuraSceneBuilder = scene({ background: OVERVIEW_BG })
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(cosmosModel())
  .add(
    primitives
      .sphere({
        name: "star",
        size: SUN_RADIUS * 2,
        material: material.pbr({ color: "#ffcf5a", emissive: "#ffa726", emissiveIntensity: 2.2, roughness: 1 }),
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "star", mutable: true })
  )
  .add(lights.point({ name: "star-light", color: "#fff1d6", intensity: 900, position: [0, 0, 0], distance: 0 }));

PLANETS.forEach((p, i) => {
  const tex = makePlanetTexture(p, i * 31 + 5);
  const mat: AuraMaterialSpec = material.pbr({ color: "#ffffff", texture: tex, roughness: 0.85, metallic: 0 });
  stage = stage.add(
    primitives
      .sphere({ name: p.name, size: p.radius * 2, material: mat, castShadow: false, receiveShadow: false })
      .position(p.orbit, 0, 0)
      .runtime({ id: planetId(i), mutable: true })
  );
  if (p.ring) {
    stage = stage.add(
      primitives
        .ring({
          name: "Saturn ring",
          size: 1,
          params: { innerRadius: p.radius * 1.45, outerRadius: p.radius * 2.5, thetaSegments: 96 },
          material: material.pbr({ color: "#d9c79c", roughness: 0.9, opacity: 0.85, side: "double", emissive: "#3a3020", emissiveIntensity: 0.4 }),
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: ringId, mutable: true })
    );
  }
  if (p.moon) {
    stage = stage.add(
      primitives
        .sphere({ name: "Moon", size: MOON.radius * 2, material: material.pbr({ color: "#b9b7b2", roughness: 0.95 }), castShadow: false, receiveShadow: false })
        .runtime({ id: moonId, mutable: true })
    );
  }
});

// ---------- camera model ----------
const FOV = 45;
const NEAR = 0.1;
const FAR = 1000;
const view = { yaw: 0.5, pitch: 0.85, dist: 78 };
const DIST_MIN = 22;
const DIST_MAX = 120;
const PITCH_MIN = 0.08;
const PITCH_MAX = 1.45;
const TRANSITION = 1.5;

const overviewPose = (): { pos: Vec3; target: Vec3 } => {
  const cp = Math.cos(view.pitch);
  return {
    pos: [view.dist * cp * Math.sin(view.yaw), view.dist * Math.sin(view.pitch), view.dist * cp * Math.cos(view.yaw)],
    target: [0, 0, 0]
  };
};

const initial = overviewPose();
stage = stage.camera(camera.perspective({ position: initial.pos, target: initial.target, fov: FOV, near: NEAR, far: FAR }));

const app = createAuraApp("#app", { scene: stage, output: cosmosOutput });

// ---------- state ----------
const angles = PLANETS.map((_, i) => 0.6 + i * 1.07);
const spins = PLANETS.map(() => 0);
let moonAngle = 0.5;
let paused = false;
let focusedIndex: number | null = null;
let ready = false;
const planetPos: Vec3[] = PLANETS.map((p, i) => [Math.cos(angles[i]!) * p.orbit, 0, Math.sin(angles[i]!) * p.orbit]);

let camPos: Vec3 = [...initial.pos];
let camTarget: Vec3 = [...initial.target];
let transFrom: { pos: Vec3; target: Vec3 } | null = null;
let transT = 0;

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const focusPose = (i: number): { pos: Vec3; target: Vec3 } => {
  const p = PLANETS[i]!;
  const c = planetPos[i]!;
  const len = Math.hypot(c[0], c[2]) || 1;
  const rx = c[0] / len;
  const rz = c[2] / len;
  const tx = -rz;
  const tz = rx;
  let dx = tx * 0.85 - rx * 0.3;
  let dy = 0.38;
  let dz = tz * 0.85 - rz * 0.3;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl;
  dy /= dl;
  dz /= dl;
  const d = p.radius * (p.ring ? 6.2 : 4.6) + (p.moon ? 0.6 : 0);
  return { pos: [c[0] + dx * d, c[1] + dy * d, c[2] + dz * d], target: [c[0], c[1], c[2]] };
};

const startTransition = (): void => {
  transFrom = { pos: [...camPos], target: [...camTarget] };
  transT = 0;
};

const TOUR_SECONDS_PER_PLANET = 3;
let touring = false;
let tourIndex = 0;
let tourTimer = 0;
let tourBtn: HTMLButtonElement | null = null;

function endTour(): void {
  touring = false;
  if (tourBtn) tourBtn.textContent = "Tour";
}

// Any user-initiated focus or unfocus (click, Escape, test hooks) ends a running tour.
function focusPlanet(name: string, fromTour = false): void {
  if (!fromTour) endTour();
  const i = PLANETS.findIndex((p) => p.name.toLowerCase() === String(name).toLowerCase());
  if (i < 0 || focusedIndex === i) return;
  startTransition();
  focusedIndex = i;
  showPanel(i);
}

function unfocus(fromTour = false): void {
  if (!fromTour) endTour();
  if (focusedIndex === null) return;
  startTransition();
  focusedIndex = null;
  hidePanel();
}

// ---------- DOM ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const overlayStyle = document.createElement("style");
overlayStyle.textContent = `
  #overlay { position: absolute; left: 0; top: 0; width: 640px; height: 360px; overflow: hidden; pointer-events: none; }
  #overlay > * { pointer-events: none; }
  #info-panel { position: absolute; left: 12px; bottom: 12px; width: 210px; padding: 10px 12px; box-sizing: border-box;
    background: rgba(8, 14, 30, 0.82); border: 1px solid rgba(120, 160, 230, 0.55); border-radius: 8px; color: #e8efff;
    font: 12px/1.45 system-ui, sans-serif; display: none; }
  #info-panel h2 { margin: 0 0 4px; font-size: 16px; color: #ffd98a; }
  #info-panel div span { color: #9fb4dc; }
  #overlay > #pause-btn { pointer-events: auto; position: absolute; right: 12px; top: 12px; padding: 5px 14px; font: 600 13px system-ui, sans-serif; color: #e8efff;
    background: rgba(8, 14, 30, 0.82); border: 1px solid rgba(120, 160, 230, 0.7); border-radius: 6px; cursor: pointer; }
  #pause-btn:hover { background: rgba(40, 60, 110, 0.9); }
  #hint { position: absolute; left: 12px; top: 12px; font: 11px system-ui, sans-serif; color: rgba(200, 215, 245, 0.75); }
`;
document.head.appendChild(overlayStyle);

const overlay = document.createElement("div");
overlay.id = "overlay";
document.body.appendChild(overlay);

const panel = document.createElement("div");
panel.id = "info-panel";
panel.innerHTML = `<h2 id="info-name"></h2>
  <div><span>Orbital period:</span> <b id="info-period"></b></div>
  <div><span>Distance from star:</span> <b id="info-distance"></b></div>`;
overlay.appendChild(panel);
const nameEl = panel.querySelector("#info-name") as HTMLElement;
const periodEl = panel.querySelector("#info-period") as HTMLElement;
const distEl = panel.querySelector("#info-distance") as HTMLElement;

const fmt = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
function showPanel(i: number): void {
  const p = PLANETS[i]!;
  nameEl.textContent = p.name;
  periodEl.textContent = `${fmt(p.periodDays)} Earth days`;
  distEl.textContent = `${fmt(p.distanceMkm)} million km`;
  panel.style.display = "block";
}
function hidePanel(): void {
  panel.style.display = "none";
}

const hint = document.createElement("div");
hint.id = "hint";
hint.textContent = "Click a planet to focus. Drag to orbit, scroll to zoom. Esc: overview.";
overlay.appendChild(hint);

const pauseBtn = document.createElement("button");
pauseBtn.id = "pause-btn";
pauseBtn.type = "button";
pauseBtn.textContent = "Pause";
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Play" : "Pause";
});
overlay.appendChild(pauseBtn);

// Tour button sits below the canvas, outside it.
const tourButton = document.createElement("button");
tourButton.id = "tour-btn";
tourButton.type = "button";
tourButton.textContent = "Tour";
tourButton.style.cssText = "display:block;margin:8px 0 0 12px;padding:5px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;";
tourButton.addEventListener("click", () => {
  if (touring) {
    endTour();
    unfocus(true);
  } else {
    touring = true;
    tourIndex = 0;
    tourTimer = 0;
    tourButton.textContent = "Stop tour";
    focusPlanet(PLANETS[0]!.name, true);
  }
});
tourBtn = tourButton;
document.body.appendChild(tourButton);

// ---------- picking (projects planet centres with the camera the app is driving) ----------
function pickPlanet(clientX: number, clientY: number): number | null {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const fwd = norm3(sub3(camTarget, camPos));
  const right = norm3(cross3(fwd, [0, 1, 0]));
  const up = cross3(right, fwd);
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  const aspect = rect.width / rect.height;
  let best: number | null = null;
  let bestDepth = Infinity;
  for (let i = 0; i < PLANETS.length; i += 1) {
    const d = sub3(planetPos[i]!, camPos);
    const z = dot3(d, fwd);
    if (z <= NEAR) continue;
    const sx = (dot3(d, right) / (z * tanHalf * aspect)) * 0.5 * rect.width + rect.width / 2;
    const sy = rect.height / 2 - (dot3(d, up) / (z * tanHalf)) * 0.5 * rect.height;
    const rad = (PLANETS[i]!.radius / (z * tanHalf)) * 0.5 * rect.height;
    const hitR = Math.max(rad * (PLANETS[i]!.ring ? 1.9 : 1.15), 10);
    if (Math.hypot(px - sx, py - sy) <= hitR && z < bestDepth) {
      best = i;
      bestDepth = z;
    }
  }
  return best;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm3(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// ---------- input ----------
let downX = 0;
let downY = 0;
let dragging = false;
let moved = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  dragging = true;
  moved = false;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (dragging) {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
    if (moved && focusedIndex === null && transFrom === null) {
      view.yaw -= (e.clientX - lastX) * 0.008;
      view.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, view.pitch + (e.clientY - lastY) * 0.006));
    }
    lastX = e.clientX;
    lastY = e.clientY;
  } else {
    canvas.style.cursor = pickPlanet(e.clientX, e.clientY) !== null ? "pointer" : "default";
  }
});
canvas.addEventListener("pointerup", (e) => {
  const wasClick = dragging && !moved;
  dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  if (!wasClick) return;
  const hit = pickPlanet(e.clientX, e.clientY);
  if (hit !== null) focusPlanet(PLANETS[hit]!.name);
  else unfocus();
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focusedIndex !== null) return;
    view.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, view.dist * Math.exp(e.deltaY * 0.0012)));
  },
  { passive: false }
);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

// ---------- per-frame ----------
const nodeOf = (id: string) => app.nodes.require(id);

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  if (!paused) {
    PLANETS.forEach((p, i) => {
      angles[i] = angles[i]! + speedOf(p) * dt;
      spins[i] = spins[i]! + spinOf(i) * dt;
    });
    moonAngle += MOON.speed * dt;
  }

  PLANETS.forEach((p, i) => {
    const pos = planetPos[i]!;
    pos[0] = Math.cos(angles[i]!) * p.orbit;
    pos[1] = 0;
    pos[2] = Math.sin(angles[i]!) * p.orbit;
    const n = nodeOf(planetId(i));
    n.setPosition(pos[0], pos[1], pos[2]);
    n.setRotation(0, spins[i]!, 0);
    if (p.ring) nodeOf(ringId).setPosition(pos[0], pos[1], pos[2]).setRotation(-Math.PI / 2 + 0.45, 0.3, 0);
    if (p.moon) {
      nodeOf(moonId).setPosition(pos[0] + Math.cos(moonAngle) * MOON.orbit, pos[1] + Math.sin(moonAngle) * 0.12, pos[2] + Math.sin(moonAngle) * MOON.orbit);
    }
  });
  nodeOf("star").setRotation(0, f.time * 0.1, 0);

  // Guided tour (real time, independent of Pause)
  if (touring) {
    tourTimer += dt;
    if (tourTimer >= TOUR_SECONDS_PER_PLANET) {
      tourTimer = 0;
      tourIndex += 1;
      if (tourIndex < PLANETS.length) {
        focusPlanet(PLANETS[tourIndex]!.name, true);
      } else {
        endTour();
        unfocus(true);
      }
    }
  }

  // Camera
  const goal = focusedIndex !== null ? focusPose(focusedIndex) : overviewPose();
  if (transFrom) {
    transT += dt / TRANSITION;
    const e = easeInOutCubic(Math.min(1, transT));
    camPos = lerp3(transFrom.pos, goal.pos, e);
    camTarget = lerp3(transFrom.target, goal.target, e);
    if (transT >= 1) transFrom = null;
  } else {
    camPos = goal.pos;
    camTarget = goal.target;
  }
  app.camera?.setPose({ position: camPos, target: camTarget, up: [0, 1, 0], fov: FOV, near: NEAR, far: FAR }, { cut: true });

  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
    });
  }
});

// ---------- test hooks ----------
const taskState = {
  get ready(): boolean {
    return ready;
  },
  get focused(): string | null {
    return focusedIndex === null ? null : PLANETS[focusedIndex]!.name;
  },
  get paused(): boolean {
    return paused;
  },
  get touring(): boolean {
    return touring;
  },
  get planets(): { name: string; x: number; y: number; z: number }[] {
    return PLANETS.map((p, i) => ({ name: p.name, x: planetPos[i]![0], y: planetPos[i]![1], z: planetPos[i]![2] }));
  },
  get cameraDistanceToFocus(): number | null {
    if (focusedIndex === null) return null;
    const c = planetPos[focusedIndex]!;
    return Math.hypot(camPos[0] - c[0], camPos[1] - c[1], camPos[2] - c[2]);
  }
};
Object.defineProperty(window, "__TASK_STATE__", { value: taskState, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, "__focusPlanet", { value: (name: string) => focusPlanet(name), writable: false });
Object.defineProperty(window, "__unfocus", { value: () => unfocus(), writable: false });

void app.ready();
