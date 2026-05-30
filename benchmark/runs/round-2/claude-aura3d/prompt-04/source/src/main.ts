// Prompt 04 — Neon Tunnel Flythrough
//
// Built with the public @aura3d/engine API only. The engine exposes box/sphere/
// plane primitives (no TubeGeometry), so the tunnel is generated *procedurally*:
// a series of panel-rings stacked down the -Z axis, each ring a ring of box
// segments rotated to face the tube axis. Alternating rings are bright emissive
// neon bands; the structural rings are dark metallic walls lit by neon point
// lights that spiral down the bore. A dolly camera flies through the bore,
// bloom adds glow on the lights + emissive bands, and exponential fog provides
// depth falloff toward the vanishing point.

import {
  createAuraApp,
  scene,
  primitives,
  lights,
  effects,
  camera,
  timeline,
  type AuraColor,
  type AuraMaterialSpec,
} from "@aura3d/engine";

// ---- Tunnel parameters ------------------------------------------------------
const TUBE_RADIUS = 3.7; // bore radius — camera flies down the center
const SEGMENTS = 16; // panels per ring (smooth, round-ish tube)
const RING_SPACING = 2.6; // distance between rings along the tunnel axis
const RING_COUNT = 42; // rings receding into the distance
const Z_START = 9; // first ring sits just ahead of the camera start
const NEON_EVERY = 3; // every Nth ring is a bright emissive neon band

// Neon palette cycled along the tunnel for the emissive bands + point lights.
const NEON: readonly AuraColor[] = [
  "#00e9ff", // cyan
  "#ff2bd6", // magenta
  "#9a4dff", // violet
  "#21ffc4", // mint
  "#ff7a18", // amber
  "#ff2e63", // hot pink
];

const TWO_PI = Math.PI * 2;

const s = scene().background("#05030e");

// ---- Lighting ---------------------------------------------------------------
// Low ambient so the dark structural walls never go fully black...
s.add(lights.ambient({ color: "#13203f", intensity: 0.22 }));

// ...and neon point lights spiraling down the bore. These both illuminate the
// metallic walls and act as bloom anchors (glowing orbs receding into fog).
const LIGHT_COUNT = 8;
for (let i = 0; i < LIGHT_COUNT; i += 1) {
  const z = 6 - i * 7; // 6, -1, -8, ... marching down the tunnel
  const ang = i * (TWO_PI / LIGHT_COUNT) + i * 0.35; // spiral around the wall
  const color = NEON[i % NEON.length];
  s.add(
    lights.point({
      color,
      intensity: 1.35,
      position: [Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, z],
    }),
  );
}

// ---- Procedural tube geometry ----------------------------------------------
// Each ring is a ring of box panels. Even rings = dark metallic structure,
// odd rings = bright emissive neon bands ("emissive segments along the tunnel").
for (let k = 0; k < RING_COUNT; k += 1) {
  const z = Z_START - k * RING_SPACING;
  const isNeon = k % NEON_EVERY === 1;
  const depth = isNeon ? RING_SPACING * 0.42 : RING_SPACING * 0.88;
  const radius = isNeon ? TUBE_RADIUS - 0.12 : TUBE_RADIUS;
  const thickness = isNeon ? 0.45 : 0.3;

  // Chord length so panels tile the ring with a slight overlap (no gaps).
  const width = 2 * radius * Math.sin(Math.PI / SEGMENTS) * 1.1;

  const neonColor = NEON[Math.floor(k / NEON_EVERY) % NEON.length];
  const mat: AuraMaterialSpec = isNeon
    ? { color: neonColor, emissive: neonColor, metallic: 0.2, roughness: 0.28 }
    : { color: "#0b1024", emissive: "#0a1330", metallic: 0.9, roughness: 0.2 };

  for (let m = 0; m < SEGMENTS; m += 1) {
    const theta = m * (TWO_PI / SEGMENTS);
    s.add(
      primitives
        .box({
          // local X = tangential width, local Y = radial thickness, Z = depth
          size: [width, thickness, depth],
          material: mat,
        })
        .position(Math.cos(theta) * radius, Math.sin(theta) * radius, z)
        .rotate(0, 0, theta + Math.PI / 2),
    );
  }
}

// ---- Atmosphere: fog falloff + bloom glow -----------------------------------
s.add(effects.fog({ color: "#0a0524", density: 0.6 }));
s.add(effects.bloom({ color: "#ffffff", intensity: 0.95 }));

// ---- Flythrough camera ------------------------------------------------------
// Dolly the eye from just outside the mouth deep into the bore, always looking
// down the tunnel axis toward the far vanishing point.
s.camera(
  camera.dolly({
    from: [0, 0.7, 12],
    to: [0, -0.4, -52],
    target: [0, 0, -130],
    fov: 72,
    seconds: 14,
  }),
);
s.timeline(timeline.loop({ seconds: 14 }));

createAuraApp("#app", { scene: s, diagnostics: false });
