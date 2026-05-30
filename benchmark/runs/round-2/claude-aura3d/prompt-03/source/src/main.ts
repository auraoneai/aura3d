// Procedural Solar System — built on the @aura3d/engine public API.
//
// The engine renders the 3D bodies (sun + planets), the bloom glow on the sun,
// the solar lighting and the framing/orbit camera. Because the public scene API
// is a declarative snapshot (no text primitive and a static framing camera), the
// orbit guide-rings and the readable planet labels are drawn in a thin DOM/SVG
// overlay that replicates the engine's static perspective-camera projection so
// every label sits exactly on its planet.

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
} from "@aura3d/engine";

type Vec3 = readonly [number, number, number];

// ---------------------------------------------------------------------------
// System definition (procedural — no assets).
// ---------------------------------------------------------------------------

// Static framing camera. The engine treats "orbit"/"perspective" cameras as a
// fixed eye that frames the scene, so we keep an explicit, elevated three-quarter
// view that shows the whole disc and the difference between orbital radii.
const CAMERA = {
  position: [0, 10.5, 20] as Vec3,
  target: [0, 0, 0] as Vec3,
  fov: 50,
};

const SUN = {
  name: "Sun",
  radius: 1.15, // world-space body radius
  color: "#ffcf6b",
  emissive: "#ff9d2e",
};

interface Planet {
  name: string;
  orbit: number; // orbital distance from the sun (world units)
  radius: number; // body radius (world units)
  color: string;
  roughness: number;
  metallic?: number;
  angleDeg: number; // current position along its orbit (for this snapshot)
  spin: number; // self-rotation / relative orbital speed
}

// Six planets at clearly increasing orbital distances and distinct speeds.
const PLANETS: Planet[] = [
  { name: "Mercury", orbit: 2.4, radius: 0.2, color: "#9c8f86", roughness: 0.9, angleDeg: 60, spin: 1.6 },
  { name: "Venus", orbit: 3.3, radius: 0.3, color: "#d9a456", roughness: 0.72, angleDeg: 300, spin: 1.25 },
  { name: "Earth", orbit: 4.3, radius: 0.32, color: "#2f6dd0", roughness: 0.55, metallic: 0.05, angleDeg: 150, spin: 1.0 },
  { name: "Mars", orbit: 5.5, radius: 0.26, color: "#c14e2b", roughness: 0.82, angleDeg: 210, spin: 0.8 },
  { name: "Jupiter", orbit: 7.2, radius: 0.62, color: "#cda06a", roughness: 0.62, angleDeg: 20, spin: 0.55 },
  { name: "Saturn", orbit: 9.2, radius: 0.54, color: "#d8c389", roughness: 0.62, angleDeg: 255, spin: 0.42 },
];

function planetPosition(p: Planet): Vec3 {
  const a = (p.angleDeg * Math.PI) / 180;
  return [Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit] as Vec3;
}

// ---------------------------------------------------------------------------
// Build the engine scene.
// ---------------------------------------------------------------------------

const builder = scene()
  .background("#05060e")
  // The sun: an emissive sphere. The engine auto-anchors a bloom halo to any
  // emissive primitive, so this drives the glow below.
  .add(
    primitives
      .sphere({
        name: "Sun",
        size: SUN.radius * 2, // sphere geometry has radius 0.5 -> size scales it
        material: material.emissive({ color: SUN.color, emissive: SUN.emissive, roughness: 0.35 }),
      })
      .position(0, 0, 0)
      .animate({ speed: 0.18 }),
  )
  // Light radiating from the sun lights every planet from the centre.
  .add(lights.point({ name: "Sunlight", position: [0, 0, 0], color: "#fff1cf", intensity: 2.6 }))
  // Soft ambient + a faint directional fill so the far sides of outer planets
  // still read as lit spheres rather than black silhouettes.
  .add(lights.ambient({ color: "#33425f", intensity: 0.5 }))
  .add(lights.directional({ position: [7, 9, 8], color: "#ffffff", intensity: 0.22 }));

for (const planet of PLANETS) {
  const [x, y, z] = planetPosition(planet);
  builder.add(
    primitives
      .sphere({
        name: planet.name,
        size: planet.radius * 2,
        material: material.pbr({
          color: planet.color,
          roughness: planet.roughness,
          metallic: planet.metallic ?? 0,
        }),
      })
      .position(x, y, z)
      .animate({ speed: planet.spin }),
  );
}

builder
  .add(effects.bloom({ intensity: 1.0, color: "#ffcf85" }))
  .add(interactions.orbit())
  .camera(camera.perspective({ position: CAMERA.position, target: CAMERA.target, fov: CAMERA.fov }))
  .timeline(timeline.loop({ seconds: 24 }));

const app = createAuraApp("#app", { scene: builder });

// ---------------------------------------------------------------------------
// Overlay: orbit rings (SVG) + planet labels (HTML), projected with the same
// static camera the engine uses so they line up with the rendered bodies.
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

interface Projected {
  x: number;
  y: number;
  inFront: boolean;
  scale: number; // pixels per world unit at that depth (for sizing offsets)
}

function makeProjector(width: number, height: number) {
  const forward = normalize(sub(CAMERA.target, CAMERA.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanHalf = Math.tan(((CAMERA.fov / 2) * Math.PI) / 180);
  const aspect = width / Math.max(1, height);

  return (p: Vec3): Projected => {
    const d = sub(p, CAMERA.position);
    const camX = dot(d, right);
    const camY = dot(d, up);
    const camZ = dot(d, forward); // depth along view direction; > 0 means in front
    const safeZ = Math.max(0.0001, camZ);
    const ndcX = camX / (safeZ * tanHalf * aspect);
    const ndcY = camY / (safeZ * tanHalf);
    return {
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
      inFront: camZ > 0.01,
      scale: height / 2 / (safeZ * tanHalf),
    };
  };
}

// Build the DOM scaffold once.
const root = app.canvas?.parentElement ?? document.getElementById("app")!;

const title = document.createElement("div");
title.className = "ss-title";
title.innerHTML = "<h1>PROCEDURAL SOLAR SYSTEM</h1><p>1 sun · 6 planets · bloom · orbit view</p>";
root.appendChild(title);

const overlay = document.createElement("div");
overlay.className = "ss-overlay";
const svg = document.createElementNS(SVG_NS, "svg");
overlay.appendChild(svg);
root.appendChild(overlay);

const sunLabel = document.createElement("div");
sunLabel.className = "ss-label sun";
sunLabel.innerHTML = `<span class="dot" style="background:${SUN.color}"></span><span>${SUN.name}</span>`;
overlay.appendChild(sunLabel);

const planetLabels = PLANETS.map((planet) => {
  const el = document.createElement("div");
  el.className = "ss-label";
  el.innerHTML = `<span class="dot" style="background:${planet.color}"></span><span>${planet.name}</span>`;
  overlay.appendChild(el);
  return el;
});

function relayout(): void {
  const width = root.clientWidth;
  const height = root.clientHeight;
  if (width === 0 || height === 0) return;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const project = makeProjector(width, height);

  // Orbit guide rings — one per planet, sampled around the orbital plane.
  for (const planet of PLANETS) {
    const points: string[] = [];
    const segments = 160;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const pr = project([Math.cos(a) * planet.orbit, 0, Math.sin(a) * planet.orbit]);
      points.push(`${pr.x.toFixed(1)},${pr.y.toFixed(1)}`);
    }
    const ring = document.createElementNS(SVG_NS, "polyline");
    ring.setAttribute("points", points.join(" "));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "rgba(132, 164, 224, 0.28)");
    ring.setAttribute("stroke-width", "1");
    svg.appendChild(ring);
  }

  // Sun marker + label.
  const sunPr = project([0, 0, 0]);
  const sunScreenR = SUN.radius * sunPr.scale;
  sunLabel.style.left = `${sunPr.x}px`;
  sunLabel.style.top = `${sunPr.y + sunScreenR + 14}px`;

  // Planet leaders + labels.
  PLANETS.forEach((planet, idx) => {
    const pr = project(planetPosition(planet));
    const screenR = planet.radius * pr.scale;
    const labelEl = planetLabels[idx];

    const labelTopY = pr.y - screenR - 14;
    labelEl.style.left = `${pr.x}px`;
    labelEl.style.top = `${labelTopY}px`;
    labelEl.style.display = pr.inFront ? "flex" : "none";

    // Thin leader line from the planet up to the label.
    const leader = document.createElementNS(SVG_NS, "line");
    leader.setAttribute("x1", String(pr.x));
    leader.setAttribute("y1", String(pr.y - screenR));
    leader.setAttribute("x2", String(pr.x));
    leader.setAttribute("y2", String(labelTopY));
    leader.setAttribute("stroke", "rgba(170, 195, 235, 0.45)");
    leader.setAttribute("stroke-width", "1");
    svg.appendChild(leader);

    // A small ring around the planet so even tiny inner planets are easy to find.
    const halo = document.createElementNS(SVG_NS, "circle");
    halo.setAttribute("cx", String(pr.x));
    halo.setAttribute("cy", String(pr.y));
    halo.setAttribute("r", String(Math.max(screenR + 3, 5)));
    halo.setAttribute("fill", "none");
    halo.setAttribute("stroke", "rgba(200, 220, 255, 0.35)");
    halo.setAttribute("stroke-width", "1");
    svg.appendChild(halo);
  });
}

// The engine sizes the canvas from the container on creation; lay out once the
// container has real dimensions, then keep in sync on resize.
function scheduleRelayout(): void {
  requestAnimationFrame(() => {
    relayout();
    // A second pass after layout settles guards against a zero-size first frame.
    requestAnimationFrame(relayout);
  });
}

scheduleRelayout();
window.addEventListener("resize", relayout);

// Surface any engine diagnostics in the console for debugging.
const diag = app.diagnostics();
if (diag.errors.length > 0) {
  console.error("Aura3D diagnostics errors:", diag.errors);
}
