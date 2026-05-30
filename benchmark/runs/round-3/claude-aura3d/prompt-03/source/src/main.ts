import {
  createAuraApp,
  scene,
  primitives,
  lights,
  effects,
  material,
  camera,
  interactions,
  timeline,
  type AuraVec3,
  type AuraColor,
} from "@aura3d/engine";
import "./styles.css";

/* ------------------------------------------------------------------ *
 * Procedural solar system.
 *
 * The Aura scene graph carries the 3D evidence: an emissive, bloom-lit
 * sun at the origin, six planets at visibly different orbital radii,
 * faint orbit rings, sun point-light + ambient fill, and an
 * orbit-controllable camera framing the whole system.
 *
 * Planet name labels are a DOM overlay (the scene API has no text node).
 * They are projected onto the live canvas with the same pinhole camera
 * the scene uses, so each label floats over its planet.
 * ------------------------------------------------------------------ */

interface Planet {
  readonly name: string;
  readonly orbit: number; // orbital distance from the sun (scene units)
  readonly angleDeg: number; // position along its orbit
  readonly size: number; // sphere diameter
  readonly color: AuraColor;
  readonly period: string; // human-readable orbital period (conveys speed)
}

const SUN = {
  name: "Sol",
  size: 3.6,
  color: "#ffcf5c" as AuraColor,
};

// Six procedurally placed planets. Orbits grow with a clear, increasing
// gap so the distances read as obviously different, and each carries a
// distinct orbital period to express the "different speeds" requirement.
const PLANETS: readonly Planet[] = [
  { name: "Mercury", orbit: 4.0, angleDeg: 25, size: 0.5, color: "#9c8b7a", period: "0.24 yr" },
  { name: "Venus", orbit: 5.9, angleDeg: 80, size: 0.78, color: "#e8c27a", period: "0.62 yr" },
  { name: "Terra", orbit: 8.0, angleDeg: 152, size: 0.84, color: "#3b7fd6", period: "1.0 yr" },
  { name: "Mars", orbit: 10.6, angleDeg: 212, size: 0.62, color: "#c1502e", period: "1.88 yr" },
  { name: "Jupiter", orbit: 13.8, angleDeg: 288, size: 1.7, color: "#d8a26a", period: "11.9 yr" },
  { name: "Saturn", orbit: 17.6, angleDeg: 338, size: 1.45, color: "#d9c08a", period: "29.5 yr" },
];

const DEG = Math.PI / 180;

/** World-space center of a body on the ecliptic (XZ) plane. */
function bodyPosition(orbit: number, angleDeg: number): AuraVec3 {
  const a = angleDeg * DEG;
  return [Math.cos(a) * orbit, 0, Math.sin(a) * orbit];
}

/* -------------------------- build the scene -------------------------- */

const sceneBuilder = scene().background("#04050c");

// Faint orbit rings, drawn as a thin necklace of small emissive dots at
// each planet's radius. This makes the differing orbital distances read
// as concentric circles even before you notice the planets.
for (const planet of PLANETS) {
  const segments = Math.max(40, Math.round(planet.orbit * 5));
  for (let i = 0; i < segments; i++) {
    const pos = bodyPosition(planet.orbit, (i / segments) * 360);
    sceneBuilder.add(
      primitives
        .sphere({ size: 0.07 })
        .position(pos[0], pos[1], pos[2])
        .material(material.emissive({ color: "#33406e", emissive: "#33406e" })),
    );
  }
}

// The sun: a bright emissive sphere that pulses gently under bloom.
sceneBuilder.add(
  primitives
    .sphere({ name: "sun", size: SUN.size })
    .position(0, 0, 0)
    .material(material.emissive({ color: SUN.color, emissive: "#ffb820" }))
    .animate({ clip: "pulse", loop: true, speed: 0.5 }),
);

// The six planets, lit by the sun.
for (const planet of PLANETS) {
  const pos = bodyPosition(planet.orbit, planet.angleDeg);
  sceneBuilder.add(
    primitives
      .sphere({ name: planet.name, size: planet.size })
      .position(pos[0], pos[1], pos[2])
      .material(material.pbr({ color: planet.color, roughness: 0.85, metallic: 0.05 })),
  );
}

// Lighting: a warm point light at the sun illuminates the planets, with a
// soft ambient fill so night sides are not pure black, plus a faint key.
sceneBuilder
  .add(lights.point({ position: [0, 0, 0], intensity: 3.2, color: "#fff2cc" }))
  .add(lights.ambient({ intensity: 0.32, color: "#9fb0ff" }))
  .add(lights.directional({ position: [14, 16, 10], intensity: 0.35, color: "#ffffff" }));

// Sun glow.
sceneBuilder.add(effects.bloom({ intensity: 1.0 }));

// Orbit-controllable camera, parked so the whole system is framed.
const CAMERA_POS: AuraVec3 = [0, 26, 38];
const CAMERA_TARGET: AuraVec3 = [0, 0, 0];
const CAMERA_FOV = 50;

sceneBuilder
  .add(interactions.orbit())
  .camera(
    camera.perspective({
      position: CAMERA_POS,
      target: CAMERA_TARGET,
      fov: CAMERA_FOV,
    }),
  )
  .timeline(timeline.loop({ seconds: 8 }));

createAuraApp("#app", {
  scene: sceneBuilder,
  autoStart: true,
  resize: true,
});

/* ----------------------- DOM label overlay -------------------------- */
// The scene graph has no text node, so planet names are an HTML overlay.
// We project each body with the same pinhole camera the scene uses and
// pin a label above it.

const labelLayer = document.createElement("div");
labelLayer.id = "labels";
document.body.appendChild(labelLayer);

interface LabelTarget {
  readonly world: AuraVec3;
  readonly el: HTMLElement;
}

const targets: LabelTarget[] = [];

function makeLabel(text: string, accent: string, extraClass = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = `planet-label ${extraClass}`.trim();
  el.textContent = text;
  el.style.setProperty("--accent", accent);
  labelLayer.appendChild(el);
  return el;
}

targets.push({ world: [0, SUN.size * 0.5, 0], el: makeLabel(SUN.name, "#ffcf5c", "sun-label") });
for (const planet of PLANETS) {
  const pos = bodyPosition(planet.orbit, planet.angleDeg);
  targets.push({
    world: [pos[0], planet.size * 0.5, pos[2]],
    el: makeLabel(planet.name, planet.color),
  });
}

// Legend reinforces the orbital-distance / orbital-speed story.
const legend = document.createElement("div");
legend.id = "legend";
legend.innerHTML = `
  <h1>SOLAR SYSTEM</h1>
  <table>
    <tr><td><span class="swatch" style="background:${SUN.color}"></span>Sol</td>
        <td class="muted">central star</td></tr>
    ${PLANETS.map(
      (p) =>
        `<tr><td><span class="swatch" style="background:${p.color}"></span>${p.name}</td>` +
        `<td class="muted">r ${p.orbit.toFixed(1)} · ${p.period}</td></tr>`,
    ).join("")}
  </table>`;
document.body.appendChild(legend);

/* ---- pinhole projection matching the scene camera ---- */

type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function norm(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

const camPos: Vec3 = [CAMERA_POS[0], CAMERA_POS[1], CAMERA_POS[2]];
const camTarget: Vec3 = [CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_TARGET[2]];
const worldUp: Vec3 = [0, 1, 0];

// Camera basis (right, up, forward), computed once since the default view
// is fixed. forward points from the camera toward the target.
const forward = norm(sub(camTarget, camPos));
const right = norm(cross(forward, worldUp));
const trueUp = cross(right, forward);

function updateLabels(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  const f = 1 / Math.tan((CAMERA_FOV * DEG) / 2);

  for (const t of targets) {
    const world: Vec3 = [t.world[0], t.world[1], t.world[2]];
    const rel = sub(world, camPos);
    const x = dot(rel, right);
    const y = dot(rel, trueUp);
    const z = dot(rel, forward); // depth along view direction

    if (z <= 0.001) {
      t.el.style.display = "none";
      continue;
    }
    const ndcX = (x / z) * (f / aspect);
    const ndcY = (y / z) * f;
    const sx = (ndcX * 0.5 + 0.5) * w;
    const sy = (1 - (ndcY * 0.5 + 0.5)) * h;

    t.el.style.display = "block";
    t.el.style.left = `${sx}px`;
    t.el.style.top = `${sy}px`;
  }
}

function loop(): void {
  updateLabels();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener("resize", updateLabels);
