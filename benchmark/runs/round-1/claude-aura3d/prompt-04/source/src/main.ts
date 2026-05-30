// Prompt 04: Neon Tunnel Flythrough
//
// Built entirely with the public @aura3d/engine API. The engine exposes only
// box / sphere / plane primitives, so the "tube geometry" is generated
// procedurally: a faceted dark tube wall (long Z-aligned rib boxes) plus a
// series of emissive neon hoops receding into fog. A dolly camera flies down
// the tunnel axis, bloom adds additive glow halos, and exponential fog gives
// the depth falloff.

import {
  createAuraApp,
  scene,
  primitives,
  material,
  lights,
  camera,
  effects,
  timeline,
  type AuraColor,
  type AuraVec3
} from "@aura3d/engine";

// ---------------------------------------------------------------------------
// Tunnel parameters
// ---------------------------------------------------------------------------
const FACETS = 12;          // sides of the faceted tube
const RADIUS = 3.2;         // tube inner radius
const Z_FRONT = 8;          // near end (behind the camera start)
const Z_BACK = -64;         // far end of the tunnel
const TUNNEL_LENGTH = Z_FRONT - Z_BACK; // 72
const CENTER_Z = (Z_FRONT + Z_BACK) / 2;
const HOOP_COUNT = 12;      // glowing neon rings along the tunnel

// Chord width of one facet panel on a regular FACETS-gon at RADIUS.
const FACET_CHORD = 2 * RADIUS * Math.sin(Math.PI / FACETS);

// Classic neon palette, cycled per hoop.
const NEON: AuraColor[] = [
  "#00e5ff", // cyan
  "#ff2bd6", // magenta
  "#8a5bff", // violet
  "#39ff14"  // acid green
];

const builder = scene().background("#05010d");

// ---------------------------------------------------------------------------
// 1. Bloom beacons (added FIRST).
//
// The engine's bloom collects additive glow halos from the FIRST 10 emissive
// primitives in scene order. By emitting one small emissive "beacon" per hoop
// up front, the glow halos are distributed evenly down the whole tunnel
// (rather than clustering on a single near ring), so bloom reads no matter
// where the flythrough camera currently is.
// ---------------------------------------------------------------------------
for (let i = 0; i < HOOP_COUNT; i += 1) {
  const z = Z_FRONT - (i / (HOOP_COUNT - 1)) * TUNNEL_LENGTH;
  const color = NEON[i % NEON.length];
  // Spiral the beacon angle so the halos trace a helix down the tube.
  const angle = i * 0.85;
  const r = RADIUS - 0.45;
  const pos: AuraVec3 = [Math.cos(angle) * r, Math.sin(angle) * r, z];
  builder.add(
    primitives.box({
      name: `neon-beacon-${i}`,
      position: pos,
      size: 0.55,
      material: material.emissive({ color: "#120016", emissive: color })
    })
  );
}

// ---------------------------------------------------------------------------
// 2. Faceted tube wall: long Z-aligned rib boxes wrapping the circle.
//    Dark, slightly metallic — they catch the colored neon lighting and
//    converge toward the vanishing point, selling the tube interior.
// ---------------------------------------------------------------------------
const wallMaterial = material.pbr({
  color: "#0c0c1a",
  roughness: 0.45,
  metallic: 0.35
});

for (let f = 0; f < FACETS; f += 1) {
  const theta = (f / FACETS) * Math.PI * 2;
  // Rotating a box about Z by (theta + 90deg) puts its width (local X) along
  // the tangent and its thickness (local Y) along the radius, so the broad
  // face points inward — exactly one panel of the tube wall.
  builder.add(
    primitives.box({
      name: `tube-rib-${f}`,
      position: [Math.cos(theta) * RADIUS, Math.sin(theta) * RADIUS, CENTER_Z],
      rotation: [0, 0, theta + Math.PI / 2],
      size: [FACET_CHORD * 1.02, 0.25, TUNNEL_LENGTH],
      material: wallMaterial
    })
  );
}

// ---------------------------------------------------------------------------
// 3. Emissive neon hoops: rings of glowing box segments at intervals down the
//    tunnel. These are the "emissive segments" and self-illuminate via the
//    material's emissive intensity, reinforced by the bloom halos above.
// ---------------------------------------------------------------------------
for (let i = 0; i < HOOP_COUNT; i += 1) {
  const z = Z_FRONT - (i / (HOOP_COUNT - 1)) * TUNNEL_LENGTH;
  const color = NEON[i % NEON.length];
  const hoopMat = material.emissive({ color: "#0b0011", emissive: color });
  const ringRadius = RADIUS - 0.1;
  for (let f = 0; f < FACETS; f += 1) {
    const theta = (f / FACETS) * Math.PI * 2;
    builder.add(
      primitives.box({
        name: `neon-hoop-${i}-${f}`,
        position: [Math.cos(theta) * ringRadius, Math.sin(theta) * ringRadius, z],
        rotation: [0, 0, theta + Math.PI / 2],
        size: [FACET_CHORD * 0.94, 0.42, 0.5],
        material: hoopMat
      })
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Lighting: faint ambient + two off-axis neon point lights that travel the
//    walls with colored falloff (added after the beacons so they don't steal
//    bloom-halo slots).
// ---------------------------------------------------------------------------
builder
  .add(lights.ambient({ intensity: 0.16, color: "#3a2b6b" }))
  .add(lights.point({ position: [1.4, 1.0, -2], intensity: 1.7, color: "#00e5ff" }))
  .add(lights.point({ position: [-1.4, -1.0, -26], intensity: 1.7, color: "#ff2bd6" }));

// ---------------------------------------------------------------------------
// 5. Atmosphere: exponential fog for depth falloff + additive bloom glow.
// ---------------------------------------------------------------------------
builder
  .add(effects.fog({ density: 1.0, color: "#06021a" }))
  .add(effects.bloom({ intensity: 1.15, color: "#ffffff" }));

// ---------------------------------------------------------------------------
// 6. Camera: dolly flythrough straight down the tube axis. The engine
//    ping-pongs from -> to while holding a fixed lookAt target far down the
//    tunnel, so every frame reads as flying into the neon tunnel.
// ---------------------------------------------------------------------------
builder
  .camera(
    camera.dolly({
      // Stay inside the tube for the whole path so every frame reads as an
      // immersive interior flythrough (the dolly ping-pongs from -> to).
      from: [0, 0, 4],
      to: [0, 0, -22],
      target: [0, 0, Z_BACK],
      seconds: 14,
      fov: 72
    })
  )
  .timeline(timeline.loop({ seconds: 14 }));

createAuraApp("#app", { scene: builder, diagnostics: false });
