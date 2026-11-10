import { camera, createAuraApp, group, lights, looks, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const LOOK_ID = "interior-warm" as const;

const wood = material.lacquer({ color: "#6b3a1e", roughness: 0.4 });
const darkWood = material.lacquer({ color: "#3e2210", roughness: 0.5 });
const innerWood = material.pbr({ color: "#4a2a14", roughness: 0.8 });
const brass = material.pbr({ color: "#d4a84a", metalness: 0.9, roughness: 0.28 });
const darkBrass = material.pbr({ color: "#8f6a22", metalness: 0.85, roughness: 0.4 });
const faceMat = material.pbr({ color: "#b9a67a", roughness: 0.9 });
const ink = material.pbr({ color: "#1a1410", roughness: 0.6 });
const red = material.pbr({ color: "#b3261e", roughness: 0.5 });
const glass = material.pbr({ color: "#9fb8c4", opacity: 0.04, alphaMode: "blend", roughness: 0.05, depthWrite: false });

// Layout (metres). Clock front faces +z, centred on x = 0.
const TRUNK_BOTTOM = 0.3;
const TRUNK_TOP = 1.55;
const HOOD_H = 0.62;
const DIAL_Y = TRUNK_TOP + HOOD_H / 2;
const PIVOT_Y = 1.5;
const ROD_LEN = 0.85;
const AMPLITUDE = 0.16; // radians
const WEIGHT_X = 0.17;
const WEIGHT_TOP_START = 1.12;
const WEIGHT_SINK_SPEED = 0.003; // metres per second
const WEIGHT_MAX_DROP = 0.45;

const rx = Math.PI / 2;

// --- Case ---
const caseParts = group("case", [
  primitives.box({ name: "plinth", size: [0.82, 0.3, 0.46], material: darkWood }).position(0, 0.15, 0),
  primitives.box({ name: "plinth moulding", size: [0.76, 0.05, 0.42], material: wood }).position(0, 0.325, 0),
  primitives.box({ name: "trunk back", size: [0.6, TRUNK_TOP - TRUNK_BOTTOM, 0.04], material: innerWood }).position(0, (TRUNK_TOP + TRUNK_BOTTOM) / 2, -0.14),
  primitives.box({ name: "trunk left", size: [0.05, TRUNK_TOP - TRUNK_BOTTOM, 0.34], material: wood }).position(-0.275, (TRUNK_TOP + TRUNK_BOTTOM) / 2, 0),
  primitives.box({ name: "trunk right", size: [0.05, TRUNK_TOP - TRUNK_BOTTOM, 0.34], material: wood }).position(0.275, (TRUNK_TOP + TRUNK_BOTTOM) / 2, 0),
  // Front frame around the glass opening
  primitives.box({ name: "frame left", size: [0.04, 1.2, 0.03], material: darkWood }).position(-0.26, 0.93, 0.17),
  primitives.box({ name: "frame right", size: [0.04, 1.2, 0.03], material: darkWood }).position(0.26, 0.93, 0.17),
  primitives.box({ name: "frame bottom", size: [0.56, 0.05, 0.03], material: darkWood }).position(0, 0.35, 0.17),
  primitives.box({ name: "frame top", size: [0.56, 0.04, 0.03], material: darkWood }).position(0, 1.53, 0.17),
  primitives.box({ name: "glass", size: [0.48, 1.12, 0.008], material: glass }).position(0, 0.94, 0.175),
  // Hood
  primitives.box({ name: "hood", size: [0.7, HOOD_H, 0.38], material: wood }).position(0, DIAL_Y, 0),
  primitives.box({ name: "hood cornice", size: [0.76, 0.06, 0.42], material: darkWood }).position(0, TRUNK_TOP + HOOD_H + 0.03, 0),
  primitives.box({ name: "hood base trim", size: [0.74, 0.04, 0.42], material: darkWood }).position(0, TRUNK_TOP - 0.01, 0),
  primitives.box({ name: "crown", size: [0.5, 0.08, 0.3], material: wood }).position(0, TRUNK_TOP + HOOD_H + 0.1, 0),
  primitives.sphere({ name: "finial", size: 0.09, material: brass }).position(0, TRUNK_TOP + HOOD_H + 0.19, 0)
]);

// --- Dial ---
const dialY = DIAL_Y;
const dialParts: ReturnType<typeof primitives.box>[] = [];
dialParts.push(
  primitives.cylinder({ name: "bezel", size: [0.56, 0.03, 0.56], material: brass }).position(0, dialY, 0.19).rotate(rx, 0, 0),
  primitives.cylinder({ name: "face", size: [0.5, 0.03, 0.5], material: faceMat }).position(0, dialY, 0.195).rotate(rx, 0, 0)
);
for (let i = 0; i < 12; i += 1) {
  const a = (i / 12) * Math.PI * 2;
  const big = i % 3 === 0;
  const r = 0.205;
  dialParts.push(
    primitives.box({ name: `hour mark ${i + 1}`, size: [big ? 0.024 : 0.014, big ? 0.06 : 0.042, 0.006], material: ink })
      .position(Math.sin(a) * r, dialY + Math.cos(a) * r, 0.2)
      .rotate(0, 0, -a)
  );
}
const dial = group("dial", dialParts);

// --- Hands (pivot at the dial centre) ---
const hourHand = group("hour hand", [
  primitives.box({ name: "hour blade", size: [0.026, 0.12, 0.006], material: ink }).position(0, 0.05, 0),
  primitives.box({ name: "hour tip", size: [0.04, 0.03, 0.006], material: ink }).position(0, 0.12, 0)
], { position: [0, dialY, 0.206] }).runtime({ id: "hourHand", mutable: true });

const minuteHand = group("minute hand", [
  primitives.box({ name: "minute blade", size: [0.016, 0.19, 0.006], material: ink }).position(0, 0.08, 0)
], { position: [0, dialY, 0.213] }).runtime({ id: "minuteHand", mutable: true });

const secondHand = group("second hand", [
  primitives.box({ name: "second blade", size: [0.006, 0.22, 0.004], material: red }).position(0, 0.07, 0),
  primitives.box({ name: "second counterweight", size: [0.018, 0.04, 0.004], material: red }).position(0, -0.06, 0)
], { position: [0, dialY, 0.219] }).runtime({ id: "secondHand", mutable: true });

const hub = primitives.cylinder({ name: "hub", size: [0.03, 0.03, 0.03], material: brass }).position(0, dialY, 0.222).rotate(rx, 0, 0);

// --- Escapement (visible at the top of the glass opening) ---
const teethN = 30;
const wheelParts = [primitives.cylinder({ name: "escape wheel disc", size: [0.1, 0.008, 0.1], material: brass }).rotate(rx, 0, 0)];
for (let i = 0; i < teethN; i += 1) {
  const a = (i / teethN) * Math.PI * 2;
  wheelParts.push(
    primitives.box({ name: `tooth ${i}`, size: [0.008, 0.018, 0.008], material: brass })
      .position(Math.sin(a) * 0.052, Math.cos(a) * 0.052, 0)
      .rotate(0, 0, -a - 0.4)
  );
}
const escapeWheel = group("escape wheel", wheelParts, { position: [0, 1.42, -0.06] }).runtime({ id: "escapeWheel", mutable: true });

const anchor = group("anchor", [
  primitives.box({ name: "anchor bar", size: [0.15, 0.012, 0.01], material: darkBrass }).position(0, 0, 0),
  primitives.box({ name: "anchor pallet left", size: [0.012, 0.04, 0.01], material: darkBrass }).position(-0.07, -0.02, 0),
  primitives.box({ name: "anchor pallet right", size: [0.012, 0.04, 0.01], material: darkBrass }).position(0.07, -0.02, 0)
], { position: [0, 1.46, -0.03] }).runtime({ id: "anchor", mutable: true });

// --- Pendulum ---
const pendulum = group("pendulum", [
  primitives.box({ name: "pendulum rod", size: [0.014, ROD_LEN, 0.008], material: darkBrass }).position(0, -ROD_LEN / 2, 0),
  primitives.sphere({ name: "pendulum bob", size: [0.2, 0.2, 0.05], material: brass }).position(0, -ROD_LEN - 0.04, 0),
  primitives.cylinder({ name: "pendulum bob boss", size: [0.07, 0.02, 0.07], material: darkBrass }).position(0, -ROD_LEN - 0.04, 0.03).rotate(rx, 0, 0)
], { position: [0, PIVOT_Y, 0.03] }).runtime({ id: "pendulum", mutable: true });

// --- Weights (sink slowly) ---
function makeWeight(id: string, x: number) {
  return group(`weight ${id}`, [
    primitives.cylinder({ name: `weight body ${id}`, size: [0.085, 0.24, 0.085], material: darkBrass }).position(0, -0.12, 0),
    primitives.cylinder({ name: `weight cap ${id}`, size: [0.03, 0.03, 0.03], material: brass }).position(0, 0.015, 0),
    primitives.box({ name: `weight chain ${id}`, size: [0.006, 0.6, 0.006], material: brass }).position(0, 0.3, 0)
  ], { position: [x, WEIGHT_TOP_START, -0.07] }).runtime({ id, mutable: true });
}
const weightL = makeWeight("weightL", -WEIGHT_X);
const weightR = makeWeight("weightR", WEIGHT_X);

// --- Room ---
const room = group("room", [
  primitives.plane({ name: "floor", size: [14, 1, 10], material: material.lacquer({ color: "#7a4a28", roughness: 0.35 }) }).position(0, 0, 2),
  primitives.plane({ name: "wall", size: [14, 1, 6], material: material.pbr({ color: "#c9b08a", roughness: 0.95 }) }).position(0, 3, -0.3).rotate(rx, 0, 0),
  primitives.box({ name: "skirting", size: [14, 0.14, 0.04], material: material.pbr({ color: "#efe3cc", roughness: 0.6 }) }).position(0, 0.07, -0.28),
  primitives.box({ name: "rug", size: [2.4, 0.01, 1.4], material: material.fabric({ color: "#7c2d2a" }) }).position(0, 0.005, 1.1)
]);

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID, { exposureEv: -0.6 }))
    .add(room)
    .add(caseParts)
    .add(dial)
    .add(hourHand)
    .add(minuteHand)
    .add(secondHand)
    .add(hub)
    .add(escapeWheel)
    .add(anchor)
    .add(pendulum)
    .add(weightL)
    .add(weightR)
    .add(lights.point({ name: "interior glow", position: [0, 1.0, 0.1], intensity: 2, color: "#ffb766", distance: 2.2, decay: 2 }))
    .add(lights.point({ name: "dial glow", position: [0, 1.9, 0.9], intensity: 0.4, color: "#ffc884", distance: 3, decay: 2 }))
    .add(lights.point({ name: "room lamp", position: [-1.8, 2.2, 1.8], intensity: 10, color: "#ffb870", distance: 8, decay: 2 }))
    .camera(camera.perspective({ position: [0, 1.55, 3.9], target: [0, 1.2, 0], fov: 42 })),
  ...looks.appOptions(LOOK_ID)
});

const rad = Math.PI / 180;
let ready = false;
let f0 = 0;

app.onFrame(() => {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const sec = now.getSeconds();
  const min = now.getMinutes();
  const hr = now.getHours() % 12;
  const t = nowMs / 1000;

  // Clock hands: hour and minute continuous, second hand ticks once per second.
  app.nodes.require("hourHand").setRotation(0, 0, -((hr + min / 60 + sec / 3600) * 30) * rad);
  app.nodes.require("minuteHand").setRotation(0, 0, -((min + sec / 60) * 6) * rad);
  app.nodes.require("secondHand").setRotation(0, 0, -(sec * 6) * rad);

  // Pendulum: period 2 s, sinusoidal (slowest at the extremes, fastest at the centre).
  const theta = AMPLITUDE * Math.sin(Math.PI * t);
  app.nodes.require("pendulum").setRotation(0, 0, theta);
  // Anchor rocks with the pendulum, escape wheel advances one tooth per second.
  app.nodes.require("anchor").setRotation(0, 0, theta * 0.35);
  app.nodes.require("escapeWheel").setRotation(0, 0, -(Math.floor(t) % teethN) * ((Math.PI * 2) / teethN));

  // Weights sink very slowly from page load.
  const drop = Math.min(WEIGHT_MAX_DROP, (f0 === 0 ? 0 : (nowMs - f0) / 1000) * WEIGHT_SINK_SPEED);
  app.nodes.require("weightL").setPosition(-WEIGHT_X, WEIGHT_TOP_START - drop, -0.07);
  app.nodes.require("weightR").setPosition(WEIGHT_X, WEIGHT_TOP_START - drop * 0.85, -0.07);

  if (f0 === 0) f0 = nowMs;
  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();
