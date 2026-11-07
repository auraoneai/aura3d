import {
  camera,
  createAuraApp,
  environments,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const BAR_COUNT = 64;
const RING_RADIUS = 4;
const BAR_RADIAL = 0.26;
const BAR_TANGENT = 0.26;
const MIN_HEIGHT = 0.15;
const INSTANCES_ID = "bars";

// One colour per bar: smooth hue gradient around the ring. Static, so computed once.
const barColors: string[] = [];
for (let i = 0; i < BAR_COUNT; i += 1) {
  barColors.push(`hsl(${Math.round((i / BAR_COUNT) * 360)}, 85%, 55%)`);
}

// Audio-visualizer style height: a mix of travelling and standing sine waves.
function barHeight(i: number, t: number): number {
  const a = (i / BAR_COUNT) * Math.PI * 2;
  const w1 = Math.sin(a * 3 + t * 1.7);
  const w2 = Math.sin(a * 7 - t * 2.9);
  const w3 = Math.sin(a * 2 + t * 0.8) * Math.sin(t * 1.3 + a);
  const mix = 0.5 * w1 + 0.3 * w2 + 0.35 * w3; // roughly [-1.15, 1.15]
  const n = Math.min(1, Math.max(0, mix * 0.5 + 0.5));
  return MIN_HEIGHT + n * n * 3.2 + n * 0.4;
}

function buildTransforms(t: number): AuraTransformSpec[] {
  const out: AuraTransformSpec[] = [];
  for (let i = 0; i < BAR_COUNT; i += 1) {
    const a = (i / BAR_COUNT) * Math.PI * 2;
    const h = barHeight(i, t);
    out.push({
      position: [Math.cos(a) * RING_RADIUS, h / 2, Math.sin(a) * RING_RADIUS],
      rotation: [0, -a, 0],
      scale: [BAR_RADIAL, h, BAR_TANGENT]
    });
  }
  return out;
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#0d1018" })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.hemisphere({ skyColor: "#b9c8ff", groundColor: "#2a2630", intensity: 0.7 }))
    .add(
      lights.directional({
        name: "key",
        position: [5, 9, 4],
        target: [0, 0, 0],
        intensity: 2.6,
        color: "#fff1e0",
        shadow: { mapSize: 2048, filter: "pcf", softness: 2, fit: { center: [0, 0, 0], extent: 8 } }
      })
    )
    .add(lights.directional({ name: "fill", position: [-6, 4, -3], target: [0, 0, 0], intensity: 0.8, color: "#8fa8ff" }))
    .add(
      primitives.plane({
        name: "floor",
        size: [18, 1, 18],
        material: material.pbr({ color: "#8c909a", roughness: 0.85, metallic: 0 }),
        castShadow: false,
        receiveShadow: true
      })
    )
    .add(
      instances
        .box({
          name: "bars",
          transforms: buildTransforms(0),
          colors: barColors,
          material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1 }),
          castShadow: true,
          receiveShadow: true
        })
        .runtime({ id: INSTANCES_ID, mutable: true })
    )
    .camera(camera.orbit({ position: [8.5, 6.5, 8.5], target: [0, 1, 0], fov: 42, autoRotate: 0.2 }))
});

let time = 0;
let signalled = false;

app.onFrame((frame) => {
  time += Math.min(frame.dt, 0.1);
  app.nodes.require(INSTANCES_ID).setInstances(buildTransforms(time), barColors);
  if (!signalled) {
    signalled = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
