import { camera, createAuraApp, group, lights, looks, material, primitives, scene } from "@aura3d/engine";
import { clockcaseCamera, clockcaseModel } from "./three-bridge/clockcase.bridge";

const LOOK_ID = "interior-warm" as const;

// Layout (world units). The bridged case (recipes/clockcase.mjs) puts the dial centre at y 3.2, front of the marks at z ~0.38.
const DIAL: [number, number, number] = [0, 3.2, 0.39];
const PIVOT: [number, number, number] = [0, 2.36, -0.05];
const ROD = 1.3;
const SWING = 0.16; // radians, peak angle
const PERIOD = 2; // seconds per full left-right cycle
const WEIGHT_X = 0.28;
const WEIGHT_Z = -0.26;
const WEIGHT_START_Y = 1.75; // centre of weight at t=0
const WEIGHT_FLOOR_Y = 0.95;
const WEIGHT_SINK = 0.004; // world units per second

const brass = material.pbr({ color: "#d4a436", metallic: 0.85, roughness: 0.3 });
const darkBrass = material.pbr({ color: "#8a6a1e", metallic: 0.8, roughness: 0.4 });
const black = material.pbr({ color: "#16110b", roughness: 0.5 });
const red = material.pbr({ color: "#b3261e", roughness: 0.4 });
const cord = material.pbr({ color: "#2b2118", roughness: 0.9 });

const handsGroup = (id: string, z: number, children: ReturnType<typeof primitives.box>[]) =>
  group(id, children, { position: [DIAL[0], DIAL[1], z] }).runtime({ id, mutable: true });

const hourHand = handsGroup("hand-hour", 0.397, [
  primitives.box({ name: "hour-blade", size: [0.05, 0.22, 0.012], material: black }).position(0, 0.09, 0),
  primitives.box({ name: "hour-tip", size: [0.085, 0.07, 0.012], material: black }).position(0, 0.19, 0),
  primitives.box({ name: "hour-tail", size: [0.03, 0.06, 0.012], material: black }).position(0, -0.04, 0)
]);
const minuteHand = handsGroup("hand-minute", 0.41, [
  primitives.box({ name: "minute-blade", size: [0.032, 0.34, 0.012], material: black }).position(0, 0.14, 0),
  primitives.box({ name: "minute-tip", size: [0.05, 0.06, 0.012], material: black }).position(0, 0.3, 0),
  primitives.box({ name: "minute-tail", size: [0.025, 0.07, 0.012], material: black }).position(0, -0.05, 0)
]);
const secondHand = handsGroup("hand-second", 0.424, [
  primitives.box({ name: "second-blade", size: [0.012, 0.37, 0.01], material: red }).position(0, 0.12, 0),
  primitives.box({ name: "second-counter", size: [0.03, 0.08, 0.01], material: red }).position(0, -0.08, 0)
]);
const hub = primitives.cylinder({ name: "hand-hub", size: [0.07, 0.04, 0.07], material: brass })
  .position(DIAL[0], DIAL[1], 0.435).rotation(Math.PI / 2, 0, 0);

const pendulum = group("pendulum", [
  primitives.box({ name: "pendulum-rod", size: [0.02, ROD, 0.012], material: brass }).position(0, -ROD / 2, 0),
  primitives.cylinder({ name: "pendulum-bob", size: [0.3, 0.045, 0.3], material: brass })
    .position(0, -ROD, 0).rotation(Math.PI / 2, 0, 0),
  primitives.cylinder({ name: "pendulum-bob-core", size: [0.16, 0.06, 0.16], material: darkBrass })
    .position(0, -ROD, 0).rotation(Math.PI / 2, 0, 0),
  primitives.cylinder({ name: "pendulum-pivot", size: [0.05, 0.03, 0.05], material: brass })
    .position(0, 0, 0).rotation(Math.PI / 2, 0, 0)
], { position: PIVOT }).runtime({ id: "pendulum", mutable: true });

const weight = (side: "l" | "r", x: number) =>
  group(`weight-${side}`, [
    primitives.cylinder({ name: `weight-${side}-body`, size: [0.15, 0.4, 0.15], material: darkBrass }),
    primitives.cylinder({ name: `weight-${side}-cap`, size: [0.05, 0.05, 0.05], material: brass }).position(0, 0.225, 0),
    // The cord runs up behind the hood, so only the part below the hood bottom is visible.
    primitives.box({ name: `weight-${side}-cord`, size: [0.008, 1.2, 0.008], material: cord }).position(0, 0.8, 0)
  ], { position: [x, WEIGHT_START_Y, WEIGHT_Z] }).runtime({ id: `weight-${side}`, mutable: true });

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID, { exposureEv: -0.6 }))
    .add(clockcaseModel())
    .add(hourHand)
    .add(minuteHand)
    .add(secondHand)
    .add(hub)
    .add(pendulum)
    .add(weight("l", -WEIGHT_X))
    .add(weight("r", WEIGHT_X))
    // warm interior lighting: a lamp in front of the clock, a glow inside the case, a wash on the dial
    .add(lights.point({ name: "room-lamp", position: [-2.6, 3.6, 3.2], color: "#ffb866", intensity: 22, distance: 14 }))
    .add(lights.point({ name: "case-glow", position: [0, 1.7, 0.1], color: "#ff9a3c", intensity: 3.5, distance: 3 }))
    .add(lights.point({ name: "dial-glow", position: [0.6, 3.6, 1.6], color: "#ffd9a0", intensity: 6, distance: 5 }))
    .camera(clockcaseCamera ?? camera.perspective({ position: [0, 2.5, 7.5], target: [0, 2, 0], fov: 40 })),
  ...looks.appOptions(LOOK_ID)
});

interface ClockState {
  pendulumAngle: number;
  hourAngle: number;
  minuteAngle: number;
  secondAngle: number;
  weightY: number;
  period: number;
}
const state: ClockState = { pendulumAngle: 0, hourAngle: 0, minuteAngle: 0, secondAngle: 0, weightY: WEIGHT_START_Y, period: PERIOD };
(window as unknown as { __TASK_STATE__: ClockState }).__TASK_STATE__ = state;

let readyFlagged = false;
let elapsed = 0;
app.onFrame((f) => {
  elapsed += f.dt;
  // Simple harmonic swing: angle = A sin(2 pi t / T). Speed is zero at the extremes and peaks at the bottom.
  const swing = SWING * Math.sin((2 * Math.PI * elapsed) / PERIOD);
  app.nodes.require("pendulum").setRotation(0, 0, swing);

  const now = new Date();
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  const secondAngle = (s / 60) * Math.PI * 2; // one discrete tick per second
  const minuteAngle = (m / 60) * Math.PI * 2;
  const hourAngle = (h / 12) * Math.PI * 2;
  app.nodes.require("hand-second").setRotation(0, 0, -secondAngle);
  app.nodes.require("hand-minute").setRotation(0, 0, -minuteAngle);
  app.nodes.require("hand-hour").setRotation(0, 0, -hourAngle);

  const wy = Math.max(WEIGHT_FLOOR_Y, WEIGHT_START_Y - WEIGHT_SINK * elapsed);
  app.nodes.require("weight-l").setPosition(-WEIGHT_X, wy, WEIGHT_Z);
  app.nodes.require("weight-r").setPosition(WEIGHT_X, wy, WEIGHT_Z);

  state.pendulumAngle = swing;
  state.hourAngle = hourAngle;
  state.minuteAngle = minuteAngle;
  state.secondAngle = secondAngle;
  state.weightY = wy;

  if (!readyFlagged) {
    readyFlagged = true;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
});

void app.ready();
