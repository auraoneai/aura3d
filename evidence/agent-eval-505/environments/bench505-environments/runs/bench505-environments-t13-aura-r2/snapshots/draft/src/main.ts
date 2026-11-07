import { camera, createAuraApp, geometry, lights, looks, material, primitives, scene } from "@aura3d/engine";
import { angelFishNode, barracudaNode, grouperNode, parrotfishNode, schoolFishNode, schoolSwimmers, soloSwimmers } from "./fish";
import { makeRng } from "./mesh";
import { buildAnemones, buildReef, buildSand, buildSeaweed, groundY } from "./reef";
import { FOG_FAR, FOG_HEX, FOG_NEAR, reefMaterial } from "./shaders";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const SCHOOL_COUNT = 36;
const BUBBLES_PER_STREAM = 9;
const SPECKS = 26;

const solos = soloSwimmers();
const school = schoolSwimmers(SCHOOL_COUNT);

// ---------- fish nodes ----------
const soloNodes = [
  angelFishNode("angel", [0, 2.7, 0]),
  grouperNode("grouper", [0, 1.5, 0]),
  barracudaNode("barracuda", [0, 3.8, 0]),
  parrotfishNode("parrot", [0, 1.9, 0])
];
const schoolNodes = school.map((s, i) => {
  const p = s.pose(0).p;
  return schoolFishNode(s.id, i % 5 === 0 ? "#ff8a3d" : "#ffcf3a", 0.4, p);
});

// ---------- bubbles and drifting particles ----------
const bubbleMat = material.pbr({ color: "#d6fbff", roughness: 0.05, metallic: 0, opacity: 0.38 });
const speckMat = material.emissive({ color: "#d8f3ee", emissive: "#a8dcd4", emissiveIntensity: 0.6 });
const streams: Array<[number, number]> = [[-1.6, -0.9], [2.4, 2.9], [-3.6, 2.2], [0.9, -4.0]];
interface Bubble { id: string; sx: number; sz: number; phase: number; speed: number; size: number }
const rb = makeRng(31337);
const bubbles: Bubble[] = [];
streams.forEach(([sx, sz], s) => {
  for (let i = 0; i < BUBBLES_PER_STREAM; i += 1) {
    bubbles.push({ id: `bubble-${s}-${i}`, sx, sz, phase: i / BUBBLES_PER_STREAM + rb() * 0.08, speed: 0.045 + rb() * 0.02, size: 0.05 + rb() * 0.09 });
  }
});
const bubbleNodes = bubbles.map((b) =>
  primitives.sphere({ name: b.id, size: b.size, material: bubbleMat }).position(b.sx, groundY(b.sx, b.sz) + 1 + b.phase * 6, b.sz).runtime({ id: b.id, mutable: true })
);
interface Speck { id: string; x: number; y: number; z: number; ph: number }
const specks: Speck[] = [];
for (let i = 0; i < SPECKS; i += 1) {
  specks.push({ id: `speck-${i}`, x: (rb() - 0.5) * 16, y: 0.6 + rb() * 4.5, z: (rb() - 0.5) * 16, ph: rb() * 6.28 });
}
const speckNodes = specks.map((s) =>
  primitives.sphere({ name: s.id, size: 0.035, material: speckMat, castShadow: false }).position(s.x, s.y, s.z).runtime({ id: s.id, mutable: true })
);

// ---------- scene ----------
const sandMat = reefMaterial("sand");
const coralMat = reefMaterial("coral");
const weedMat = reefMaterial("weed");
const anemoneMat = reefMaterial("anemone");

const world = scene({ background: FOG_HEX })
  .add(
    looks.preset("underwater", {
      background: FOG_HEX,
      fog: { color: FOG_HEX, near: FOG_NEAR, far: FOG_FAR },
      sun: { elevationDeg: 78, azimuthDeg: 40 },
      key: { color: "#c4f7e8", intensity: 2.3, shadow: false },
      grade: { contrast: 1.0, saturation: 1.1, temperature: -0.12 }
    })
  )
  .add(lights.hemisphere({ skyColor: "#86dbe0", groundColor: "#0c4658", intensity: 0.7 }))
  .add(geometry.custom(buildSand(), { name: "seabed", material: sandMat, castShadow: false }).runtime({ id: "seabed", mutable: true }))
  .add(geometry.custom(buildReef(), { name: "corals", material: coralMat, castShadow: false }).runtime({ id: "corals", mutable: true }))
  .add(geometry.custom(buildSeaweed(), { name: "seaweed", material: weedMat, castShadow: false }).runtime({ id: "seaweed", mutable: true }))
  .add(geometry.custom(buildAnemones(), { name: "anemones", material: anemoneMat, castShadow: false }).runtime({ id: "anemones", mutable: true }))
  .addMany(soloNodes)
  .addMany(schoolNodes)
  .addMany(bubbleNodes)
  .addMany(speckNodes)
  .camera(camera.perspective({ position: [10.5, 3, 0], target: [0, 1.3, 0], fov: 58, near: 0.2, far: 120 }));

const app = createAuraApp("#app", { scene: world, ...looks.appOptions("underwater") });

// ---------- animation ----------
type Handle = ReturnType<typeof app.nodes.require>;
let clock = 0;
let handles: {
  clocked: Handle[];
  solo: Handle[];
  school: Handle[];
  bubbles: Handle[];
  specks: Handle[];
} | null = null;

const resolveHandles = () => ({
  clocked: ["seabed", "corals", "seaweed", "anemones"].map((id) => app.nodes.require(id)),
  solo: solos.map((s) => app.nodes.require(s.id)),
  school: school.map((s) => app.nodes.require(s.id)),
  bubbles: bubbles.map((b) => app.nodes.require(b.id)),
  specks: specks.map((s) => app.nodes.require(s.id))
});

const ORBIT_SPEED = 0.1; // rad/s: one lap in about 63 s

app.onFrame((frame) => {
  clock += Math.min(frame.dt, 0.1);
  handles ??= resolveHandles();
  const t = clock;

  for (const h of handles.clocked) h.setUniform?.("tClock", t);

  solos.forEach((s, i) => {
    const { p, yaw } = s.pose(t);
    const h = handles?.solo[i];
    h?.setPosition(p[0], p[1], p[2]);
    h?.setRotation(0, yaw, 0);
  });
  school.forEach((s, i) => {
    const { p, yaw } = s.pose(t);
    const h = handles?.school[i];
    h?.setPosition(p[0], p[1], p[2]);
    h?.setRotation(0, yaw, 0);
  });

  bubbles.forEach((b, i) => {
    const u = (t * b.speed + b.phase) % 1;
    const y = groundY(b.sx, b.sz) + 0.9 + u * 7.5;
    const wob = 0.12 * (0.4 + u) * Math.sin(u * 22 + b.phase * 9);
    const h = handles?.bubbles[i];
    h?.setPosition(b.sx + wob, y, b.sz + wob * 0.6);
    h?.setScale(Math.max(0.05, Math.min(1, (1 - u) * 6)) * (0.7 + 0.5 * u));
  });
  specks.forEach((s, i) => {
    const h = handles?.specks[i];
    h?.setPosition(s.x + 0.5 * Math.sin(t * 0.15 + s.ph), s.y + 0.25 * Math.sin(t * 0.21 + s.ph * 2) + ((t * 0.03) % 1), s.z + 0.5 * Math.cos(t * 0.13 + s.ph));
  });

  // camera: slow orbit around the reef centre with a gentle bob
  const a = 0.6 + t * ORBIT_SPEED;
  const radius = 10.5 + 0.5 * Math.sin(t * 0.13);
  const height = 3.0 + 0.35 * Math.sin(t * 0.55);
  app.camera?.setPose(
    {
      position: [Math.cos(a) * radius, height, Math.sin(a) * radius],
      target: [0, 1.3 + 0.12 * Math.sin(t * 0.55 + 1), 0]
    },
    { cut: true }
  );
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
