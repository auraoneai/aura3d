// Procedural Solar System — built with @aura3d/engine public imports only.
//
// Sun + 6 planets at visibly different orbital radii, each placed on a tilted
// orbit ring, lit by a central sun light, with bloom on the sun and an orbit
// camera framing the whole system. Planet names are drawn on an HTML overlay
// (the engine exposes no 3D text primitive) and anchored to each body by
// reproducing the orbit camera's deterministic projection.

import {
  createAuraApp,
  scene,
  primitives,
  lights,
  material,
  effects,
  camera,
  interactions,
} from "@aura3d/engine";

// ---------------------------------------------------------------------------
// Camera framing. These exact values are mirrored when projecting the labels,
// so the camera the renderer uses and the camera the labels assume are one
// and the same. (orbit mode places the eye at target + [0, 0.55, distance].)
// ---------------------------------------------------------------------------
const TARGET: [number, number, number] = [0, 0, 0];
const DISTANCE = 20;
const FOV = 52;
const NEAR = 0.05;
const FAR = 100;

// Tilt of the whole orbital plane toward the camera (radians). A circle laid
// out in the X/Y plane is rotated about X so orbits read as ellipses with real
// depth instead of a flat 2D ring.
const TILT = (24 * Math.PI) / 180;

// ---------------------------------------------------------------------------
// Procedural planet table. Radii are clearly spaced so orbital distances are
// visibly different; sizes and colors give each planet identity. `speed` is a
// relative orbital speed (faster closer in, Kepler-style ~ 1/sqrt(r)); it is
// surfaced in each label so the "different speeds" intent is readable.
// ---------------------------------------------------------------------------
interface Planet {
  readonly name: string;
  readonly radius: number; // orbital radius
  readonly size: number; // body diameter (sphere scale)
  readonly color: string;
  readonly angle: number; // current angular position on the orbit (radians)
}

function deg(d: number): number {
  return (d * Math.PI) / 180;
}

// Radii are clearly spaced; angles are chosen so the largest-radius planets
// sit toward the horizontal sides (low |y|) and the whole system frames with
// margin. Diameters keep the Sun the dominant body.
const PLANETS: readonly Planet[] = [
  { name: "Mercury", radius: 3.0, size: 0.5, color: "#9c8b7a", angle: deg(205) },
  { name: "Venus", radius: 4.4, size: 0.8, color: "#d8a861", angle: deg(118) },
  { name: "Earth", radius: 5.9, size: 0.85, color: "#3f7fd6", angle: deg(55) },
  { name: "Mars", radius: 7.1, size: 0.62, color: "#c1502a", angle: deg(300) },
  { name: "Jupiter", radius: 8.6, size: 1.5, color: "#d9b48a", angle: deg(18) },
  { name: "Saturn", radius: 10.0, size: 1.25, color: "#e6cf9b", angle: deg(162) },
];

const SUN_RADIUS = 1.4; // world radius (diameter 2.8)
const SUN_COLOR = "#ffcf5a";

function v3(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z];
}

// Position of a body at orbital radius `r` and angle `a`, with the orbital
// plane tilted about the X axis by TILT.
function orbitPosition(r: number, a: number): [number, number, number] {
  const x = r * Math.cos(a);
  const yFlat = r * Math.sin(a);
  return [x, yFlat * Math.cos(TILT), yFlat * Math.sin(TILT)];
}

// Relative orbital speed, normalized so the innermost planet reads as 1.0x.
function relativeSpeed(radius: number): number {
  const inner = PLANETS[0].radius;
  return Math.sqrt(inner / radius);
}

// Small deterministic PRNG so the starfield is stable across reloads/builds.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// Build the scene.
// ---------------------------------------------------------------------------
const sceneBuilder = scene().background("#05060d");

// Faint starfield behind the system (non-emissive so it does not compete with
// the sun's bloom; lit softly by the ambient hemisphere).
const rng = makeRng(20240529);
for (let i = 0; i < 70; i += 1) {
  const x = (rng() - 0.5) * 60;
  const y = (rng() - 0.5) * 36;
  const z = -22 - rng() * 30;
  const s = 0.05 + rng() * 0.08;
  sceneBuilder.add(
    primitives
      .sphere({
        name: `star-${i}`,
        material: material.pbr({ color: "#aeb8d6", roughness: 1, metallic: 0 }),
      })
      .position(x, y, z)
      .scale(s),
  );
}

// Orbit ring guides: each orbit is drawn as a ring of small dim dots along the
// tilted orbital path. Kept non-emissive so the only bloom source is the sun.
const RING_SEGMENTS = 72;
for (const planet of PLANETS) {
  for (let i = 0; i < RING_SEGMENTS; i += 1) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    const [px, py, pz] = orbitPosition(planet.radius, a);
    sceneBuilder.add(
      primitives
        .box({
          name: `${planet.name}-orbit-${i}`,
          material: material.pbr({ color: "#5c6ba6", roughness: 0.8, metallic: 0.1 }),
        })
        .position(px, py, pz)
        .scale(0.05),
    );
  }
}

// The sun: an emissive sphere at the origin. Emissive primitives are the
// engine's bloom anchors, so adding it first guarantees the sun receives the
// strongest bloom halo.
sceneBuilder.add(
  primitives
    .sphere({
      name: "Sun",
      material: material.emissive({ color: SUN_COLOR, emissive: "#ffb019" }),
    })
    .position(0, 0, 0)
    .scale(SUN_RADIUS * 2), // sphere geometry radius is 0.5, so scale = diameter
);

// Lighting: a bright point light at the sun radiates outward over the planets,
// a soft hemisphere fills space so far sides stay readable, and a gentle
// directional adds shaping depth.
sceneBuilder
  .add(lights.point({ name: "sun-light", position: v3(0, 0, 0), color: "#fff1cf", intensity: 3.4 }))
  .add(lights.ambient({ name: "space-fill", color: "#43507a", intensity: 0.4 }))
  .add(lights.directional({ name: "rim", position: v3(6, 8, 10), color: "#9fb6ff", intensity: 0.28 }));

// The planets.
for (const planet of PLANETS) {
  const [px, py, pz] = orbitPosition(planet.radius, planet.angle);
  sceneBuilder.add(
    primitives
      .sphere({
        name: planet.name,
        material: material.pbr({ color: planet.color, roughness: 0.85, metallic: 0.05 }),
      })
      .position(px, py, pz)
      .scale(planet.size),
  );
}

// Bloom on the sun, orbit interaction, and the framing orbit camera.
sceneBuilder
  .add(effects.bloom({ intensity: 1.1, color: "#ffd27f" }))
  .add(interactions.orbit())
  .camera(camera.orbit({ distance: DISTANCE, target: TARGET, fov: FOV }));

const app = createAuraApp("#app", {
  scene: sceneBuilder,
  diagnostics: false,
});

// ---------------------------------------------------------------------------
// Label overlay. Reproduce the orbit-camera projection (identical math to the
// engine's renderer) to anchor each name to its body in screen space.
// ---------------------------------------------------------------------------
type Mat4 = number[];

function lookAt(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number],
): Mat4 {
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ];
}

function perspective(fovRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

function multiply4(a: Mat4, b: Mat4): Mat4 {
  const out: Mat4 = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

const EYE: [number, number, number] = [TARGET[0], TARGET[1] + 0.55, TARGET[2] + DISTANCE];

interface LabelEntry {
  readonly el: HTMLElement;
  readonly world: [number, number, number];
}

const labelLayer = document.getElementById("labels");
const labelEntries: LabelEntry[] = [];

function makeLabel(name: string, color: string, meta: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "planet-label";
  wrap.style.color = color;

  const nameEl = document.createElement("div");
  nameEl.className = "name";
  nameEl.textContent = name;

  const metaEl = document.createElement("div");
  metaEl.className = "meta";
  metaEl.textContent = meta;

  const dot = document.createElement("div");
  dot.className = "dot";

  wrap.append(nameEl, metaEl, dot);
  return wrap;
}

if (labelLayer) {
  // Sun label.
  const sunLabel = makeLabel("Sun", SUN_COLOR, "central star · bloom");
  labelLayer.append(sunLabel);
  // Float the Sun label above its glow so it stays readable.
  labelEntries.push({ el: sunLabel, world: [0, SUN_RADIUS + 1.6, 0] });

  // Planet labels with relative orbital speed.
  for (const planet of PLANETS) {
    const speed = relativeSpeed(planet.radius);
    const label = makeLabel(
      planet.name,
      planet.color,
      `orbit r=${planet.radius.toFixed(1)} · ${speed.toFixed(2)}×`,
    );
    labelLayer.append(label);
    labelEntries.push({ el: label, world: orbitPosition(planet.radius, planet.angle) });
  }
}

function updateLabels(): void {
  const canvas = app.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w < 2 || h < 2) return;

  const view = lookAt(EYE, TARGET, [0, 1, 0]);
  const proj = perspective((FOV * Math.PI) / 180, w / h, NEAR, FAR);
  const mvp = multiply4(proj, view);

  for (const { el, world } of labelEntries) {
    const [x, y, z] = world;
    const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
    const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
    const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];

    if (cw <= 0.0001) {
      el.style.display = "none";
      continue;
    }
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    const sx = (ndcX * 0.5 + 0.5) * w;
    const sy = (0.5 - ndcY * 0.5) * h;
    el.style.display = "flex";
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    // Anchor the connector dot (last child) on the body; name sits above it.
    el.style.transform = "translate(-50%, calc(-100% + 6px))";
  }
}

// Keep labels locked to bodies across the async first render and any resize.
function tick(): void {
  updateLabels();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
