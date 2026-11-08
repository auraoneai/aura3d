import { camera, createAuraApp, effects, group, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
  }
}

let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

let sc = scene({ background: "#a9c9e6" })
  .camera(camera.orbit({ position: [0, 15, 60], target: [1.5, 11, 1], fov: 40, near: 1, far: 700, autoRotate: 0.12 }))
  .add(sky.gradient({ zenith: "#4f86c6", horizon: "#cfe3f3" }))
  .add(lights.hemisphere({ skyColor: "#cfe0f5", groundColor: "#4d6a7a", intensity: 0.9 }))
  .add(lights.directional({ name: "key", position: [40, 55, 30], target: [0, 8, 0], intensity: 3.2, color: "#fff1d6", shadow: true }))
  .add(lights.directional({ name: "fill", position: [-35, 18, -20], target: [0, 8, 0], intensity: 0.8, color: "#a8c4ff" }))
  .add(lights.point({ name: "lamp-light", position: [0, 21.1, 0], intensity: 40, distance: 26, color: "#ffd98a", shadow: false }))
  .add(effects.fog({ color: "#cfe3f3", density: 0.0025 }))
  .add(effects.bloom({ intensity: 0.4, threshold: 0.85, radius: 0.5 }));

let partCount = 0;
const put = (node: Parameters<typeof sc.add>[0]): void => {
  sc = sc.add(node);
  partCount += 1;
};

const mat = (color: string, roughness = 0.8, metallic = 0) => material.pbr({ color, roughness, metallic });

// ---------- sea, foam, ground ----------
put(primitives.plane({ name: "sea", size: [700, 1, 700], material: material.pbr({ color: "#2a74a3", roughness: 0.12 }), castShadow: false }).position(0, 0, 0));
put(primitives.cylinder({ name: "foam", size: [17, 0.05, 17], material: material.pbr({ color: "#e8f4fa", roughness: 0.6, opacity: 0.35 }), castShadow: false, params: { radialSegments: 40 } }).position(0, 0.04, 0));
put(primitives.sphere({ name: "island-grass", size: [1, 1, 1], material: mat("#5f8a3c", 1) }).scale([15, 2.8, 11]).position(9, -0.5, 4));

// ---------- rocky base ----------
put(primitives.sphere({ name: "rock-core", size: 1, material: mat("#6d6a66", 0.95), params: { widthSegments: 12, heightSegments: 8 } }).scale([8, 3.4, 8]).position(0, 0, 0));
const rockColors = ["#5b5853", "#77716a", "#4d4b48", "#847d73", "#645f58", "#6f6a62"];
for (let i = 0; i < 12; i += 1) {
  const a = (i / 12) * Math.PI * 2 + rand() * 0.4;
  const r = 3.4 + rand() * 3.4;
  const s = 1.6 + rand() * 2.2;
  put(
    primitives.sphere({ name: `rock-${i}`, size: 1, material: mat(rockColors[i % rockColors.length]!, 0.95), params: { widthSegments: 7, heightSegments: 5 } })
      .scale([s * (0.9 + rand() * 0.6), s * (0.5 + rand() * 0.4), s * (0.9 + rand() * 0.6)])
      .rotate((rand() - 0.5) * 0.5, rand() * 6.28, (rand() - 0.5) * 0.5)
      .position(Math.cos(a) * r, 0.05 + rand() * 0.3, Math.sin(a) * r)
  );
}
for (let i = 0; i < 4; i += 1) {
  const s = 1.2 + rand() * 1.3;
  put(
    primitives.sphere({ name: `shore-rock-${i}`, size: 1, material: mat(rockColors[(i + 2) % rockColors.length]!, 0.95), params: { widthSegments: 7, heightSegments: 5 } })
      .scale([s * 1.3, s * 0.6, s])
      .rotate(0, rand() * 6.28, 0)
      .position(2 + i * 4.5 + rand(), 0.1, 10 + rand() * 2)
  );
}

// ---------- tower ----------
const Y0 = 1.2; // tower base height
const H = 18;
const RB = 2.4; // bottom radius
const RT = 1.5; // top radius
const radiusAt = (h: number): number => RB + ((RT - RB) * h) / H;
const BANDS = 6;
const bandH = H / BANDS;

put(primitives.cylinder({ name: "plinth", size: [5.6, 0.7, 5.6], material: mat("#7a766f", 0.95), params: { radialSegments: 32 } }).position(0, Y0 + 0.1, 0));
for (let i = 0; i < BANDS; i += 1) {
  const rb = radiusAt(i * bandH);
  const rt = radiusAt((i + 1) * bandH);
  put(
    primitives.cylinder({
      name: `band-${i}`,
      size: [rb * 2, bandH, rb * 2],
      material: mat(i % 2 === 0 ? "#cc2f28" : "#f3efe4", 0.6),
      params: { radialSegments: 40, radiusBottom: 0.5, radiusTop: (0.5 * rt) / rb }
    }).position(0, Y0 + i * bandH + bandH / 2, 0)
  );
}

// door (facing +z)
put(primitives.box({ name: "door-frame", size: [1.5, 2.3, 0.3], material: mat("#d9d2c0", 0.8) }).position(0, Y0 + 1.15, RB - 0.05));
put(primitives.box({ name: "door", size: [1.1, 2.0, 0.3], material: mat("#4a2c18", 0.7) }).position(0, Y0 + 1.0, RB + 0.03));
put(primitives.sphere({ name: "door-knob", size: 0.14, material: mat("#d8b04a", 0.3, 0.8) }).position(0.35, Y0 + 1.0, RB + 0.2));
put(primitives.box({ name: "door-step", size: [2.0, 0.25, 1.0], material: mat("#8b867d", 0.95) }).position(0, Y0 - 0.15, RB + 0.5));

// windows spiralling up the tower
for (let i = 0; i < 6; i += 1) {
  const h = 4.2 + i * 2.3;
  const th = 0.9 + i * 1.15;
  const r = radiusAt(h);
  const x = Math.sin(th) * r, z = Math.cos(th) * r;
  put(primitives.box({ name: `window-frame-${i}`, size: [0.75, 1.1, 0.25], material: mat("#2b2b2e", 0.6) }).rotate(0, th, 0).position(x, Y0 + h, z));
  const gr = r + 0.09;
  put(primitives.box({ name: `window-glass-${i}`, size: [0.5, 0.8, 0.25], material: material.emissive({ color: "#2a4a6a", emissive: "#6fa4d4", emissiveIntensity: 0.6 }), castShadow: false }).rotate(0, th, 0).position(Math.sin(th) * gr, Y0 + h, Math.cos(th) * gr));
}

// ---------- gallery ----------
const GY = Y0 + H; // 19.2
put(primitives.cylinder({ name: "gallery-corbel", size: [4.3, 0.5, 4.3], material: mat("#34343a", 0.7), params: { radialSegments: 32, radiusTop: 0.5, radiusBottom: 0.3 } }).position(0, GY - 0.15, 0));
put(primitives.cylinder({ name: "gallery-floor", size: [5.2, 0.3, 5.2], material: mat("#2c2c32", 0.7), params: { radialSegments: 32 } }).position(0, GY + 0.2, 0));
const POSTS = 16;
const RR = 2.45;
for (let i = 0; i < POSTS; i += 1) {
  const a = (i / POSTS) * Math.PI * 2;
  put(primitives.cylinder({ name: `post-${i}`, size: [0.1, 1.0, 0.1], material: mat("#1f1f24", 0.5, 0.4), params: { radialSegments: 6 } }).position(Math.cos(a) * RR, GY + 0.85, Math.sin(a) * RR));
}
for (let i = 0; i < POSTS; i += 1) {
  const a = ((i + 0.5) / POSTS) * Math.PI * 2;
  const chord = 2 * RR * Math.sin(Math.PI / POSTS);
  put(primitives.box({ name: `rail-${i}`, size: [chord + 0.02, 0.09, 0.12], material: mat("#1f1f24", 0.5, 0.4) }).rotate(0, -a - Math.PI / 2, 0).position(Math.cos(a) * RR * Math.cos(Math.PI / POSTS), GY + 1.35, Math.sin(a) * RR * Math.cos(Math.PI / POSTS)));
}

// ---------- lantern room ----------
put(primitives.cylinder({ name: "lantern-base", size: [3.1, 0.45, 3.1], material: mat("#2c2c32", 0.6), params: { radialSegments: 24 } }).position(0, GY + 0.6, 0));
put(primitives.cylinder({ name: "lantern-glass", size: [2.5, 2.6, 2.5], material: material.pbr({ color: "#bfe6f2", roughness: 0.05, opacity: 0.28 }), castShadow: false, params: { radialSegments: 24 } }).position(0, GY + 2.15, 0));
for (let i = 0; i < 8; i += 1) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  put(primitives.box({ name: `mullion-${i}`, size: [0.08, 2.6, 0.08], material: mat("#222226", 0.5, 0.5) }).position(Math.cos(a) * 1.25, GY + 2.15, Math.sin(a) * 1.25));
}
put(primitives.cylinder({ name: "lamp-pedestal", size: [0.5, 0.9, 0.5], material: mat("#444449", 0.5, 0.6), params: { radialSegments: 12 } }).position(0, GY + 1.2, 0));
put(primitives.sphere({ name: "lamp", size: 0.95, material: material.emissive({ color: "#fff3c0", emissive: "#ffd36b", emissiveIntensity: 3 }), castShadow: false }).position(0, GY + 1.9, 0));
put(primitives.cylinder({ name: "lantern-cap", size: [3.2, 0.3, 3.2], material: mat("#2c2c32", 0.6), params: { radialSegments: 24 } }).position(0, GY + 3.6, 0));

// roof + finial
put(primitives.cylinder({ name: "roof", size: [3.8, 1.8, 3.8], material: mat("#b32a24", 0.5, 0.2), params: { radialSegments: 32, radiusBottom: 0.5, radiusTop: 0.02 } }).position(0, GY + 4.65, 0));
put(primitives.sphere({ name: "finial-ball", size: 0.4, material: mat("#d8b04a", 0.3, 0.8) }).position(0, GY + 5.65, 0));
put(primitives.cylinder({ name: "finial-spike", size: [0.07, 0.9, 0.07], material: mat("#d8b04a", 0.3, 0.8), params: { radialSegments: 8 } }).position(0, GY + 6.1, 0));

// rotating light beams
const beamMat = material.emissive({ color: "#fff0b0", emissive: "#ffe9a0", emissiveIntensity: 1.5, opacity: 0.3 });
sc = sc.add(
  group(
    "beam",
    [
      primitives.box({ name: "beam-a", size: [16, 0.6, 0.6], material: beamMat, castShadow: false }).position(9.5, 0, 0),
      primitives.box({ name: "beam-b", size: [16, 0.6, 0.6], material: beamMat, castShadow: false }).position(-9.5, 0, 0)
    ],
    { position: [0, GY + 1.9, 0] }
  ).runtime({ id: "beam", mutable: true })
);
partCount += 2;

// ---------- keeper's cottage ----------
const CX = 9, CZ = 4, CY = 0.85;
put(primitives.box({ name: "cottage-wall", size: [3.8, 2.4, 3.4], material: mat("#ece4d0", 0.9) }).position(CX, CY + 1.2, CZ));
put(primitives.box({ name: "cottage-foundation", size: [4.0, 0.3, 3.6], material: mat("#7a766f", 0.95) }).position(CX, CY + 0.05, CZ));
put(primitives.cylinder({ name: "cottage-roof", size: [6.3, 1.8, 6.3], material: mat("#7a3b2e", 0.8), params: { radialSegments: 4, radiusBottom: 0.5, radiusTop: 0.01 } }).rotate(0, Math.PI / 4, 0).position(CX, CY + 2.4 + 0.9, CZ));
put(primitives.box({ name: "cottage-chimney", size: [0.55, 1.5, 0.55], material: mat("#8c4a3a", 0.9) }).position(CX + 1.1, CY + 3.9, CZ - 0.6));
put(primitives.box({ name: "cottage-door", size: [0.85, 1.6, 0.12], material: mat("#5a3320", 0.7) }).position(CX - 0.9, CY + 0.9, CZ + 1.72));
put(primitives.box({ name: "cottage-window-a", size: [0.8, 0.7, 0.12], material: material.emissive({ color: "#2a4a6a", emissive: "#ffd070", emissiveIntensity: 0.9 }), castShadow: false }).position(CX + 0.9, CY + 1.4, CZ + 1.72));
put(primitives.box({ name: "cottage-window-b", size: [0.12, 0.7, 0.8], material: material.emissive({ color: "#2a4a6a", emissive: "#ffd070", emissiveIntensity: 0.9 }), castShadow: false }).position(CX - 1.92, CY + 1.4, CZ));
put(primitives.box({ name: "cottage-window-c", size: [0.12, 0.7, 0.8], material: material.emissive({ color: "#2a4a6a", emissive: "#ffd070", emissiveIntensity: 0.9 }), castShadow: false }).position(CX + 1.92, CY + 1.4, CZ));

const app = createAuraApp("#app", { scene: sc });
let t = 0;
app.onFrame((f) => {
  t += f.dt;
  app.nodes.require("beam").setRotation(0, t * 1.2, 0);
});
await app.ready();
window.__TASK_STATE__ = { ready: true, partCount, bandCount: BANDS };
window.__EVAL_READY__ = true;
