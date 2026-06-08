/**
 * moon-garden.example.ts — the Moon Garden scene as an EpisodeDocument.
 *
 * THIS IS AN EXAMPLE FIXTURE, NOT THE DEFAULT. Nothing in the product loads it
 * automatically. It exists only so a user can EXPLICITLY render the reference scene
 * (e.g. point `AURA_DOCUMENT` at a serialized copy) and as test/demo material. The
 * generic `scene-player.ts` renders ANY EpisodeDocument; this one happens to be the
 * hand-authored Moon Garden used to validate that the schema captures a full scene
 * (cast, staging, camera, set, lights, props, dialogue). Real scenes come from
 * `animation-scene new --prompt`, never from this file.
 */

import type { EpisodeDocument, SetPiece, Vec3, Vec4 } from "../episode-document";

const DURATION = 60;
const YAW = (turns: number): number => Math.PI * turns;

// --- glow/material helpers (keep the data terse + faithful to makeGlowMaterial) ---
function glowPiece(
  id: string,
  geometry: SetPiece["geometry"],
  baseColor: Vec4,
  emissiveColor: Vec3,
  dim: number,
  full: number,
  position: Vec3,
  scale: Vec3
): SetPiece {
  return { id, geometry, position, scale, baseColor, metallic: 0, roughness: 0.85, emissiveColor, glow: { dim, full } };
}

const STONE_GOLD: Vec4 = [1, 0.882, 0.557, 1];
const STONE_CYAN: Vec4 = [0.49, 0.886, 1, 1];
const STAR_BASE: Vec4 = [0.9, 0.95, 1, 1];

function star(index: number, position: Vec3): SetPiece {
  const size = 0.12 + (index % 3) * 0.05;
  return glowPiece(`star-${index}`, "sphere", STAR_BASE, [0.78, 0.88, 1], 0.5, 1.2, position, [size, size, size]);
}

const STAR_Z = -9;
const STAR_POSITIONS: Vec3[] = [
  [-9.5, 7.5, STAR_Z], [-7.0, 5.2, STAR_Z], [-8.2, 3.0, STAR_Z], [-5.5, 8.0, STAR_Z],
  [-3.8, 6.0, STAR_Z], [-6.2, 1.6, STAR_Z], [5.4, 7.6, STAR_Z], [7.2, 5.4, STAR_Z],
  [8.6, 8.2, STAR_Z], [8.0, 2.8, STAR_Z], [4.2, 8.6, STAR_Z], [-10.5, 5.0, STAR_Z],
  [9.8, 4.0, STAR_Z], [-4.6, 2.2, STAR_Z], [6.0, 1.8, STAR_Z], [0.5, 8.8, STAR_Z]
];

export const moonGardenDocument: EpisodeDocument = {
  id: "moon-garden-001",
  duration: DURATION,
  assets: {
    characters: [
      { id: "miko", url: "/aura-assets/miko.catalog.glb", scale: 1.6, defaultClip: "Idle", mouthMorphIndex: -1 },
      { id: "luma", url: "/aura-assets/luma2.catalog.glb", scale: 1.6, defaultClip: "Idle", mouthMorphIndex: -1 }
    ],
    props: [{ id: "mushroom", url: "/aura-assets/mushroom.catalog.glb" }]
  },
  set: {
    clearColor: [0.043, 0.058, 0.101, 1],
    studioLightingScale: 0.4,
    environment: {
      color: [0.34, 0.4, 0.52],
      intensity: 0.32,
      proceduralMap: {
        skyColor: [0.16, 0.22, 0.34],
        horizonColor: [0.22, 0.26, 0.32],
        groundColor: [0.05, 0.06, 0.08],
        specularColor: [0.85, 0.9, 1],
        intensity: 0.4,
        specularIntensity: 0.7
      }
    },
    pieces: [
      // Crater/garden floor (auto-framed).
      {
        id: "garden-floor",
        geometry: "cube",
        position: [0, -0.06, 0],
        scale: [60, 0.12, 60],
        baseColor: [0.09, 0.29, 0.245, 1],
        metallic: 0.02,
        roughness: 0.78,
        emissiveColor: [0.03, 0.09, 0.08],
        emissiveStrength: 0.18,
        includeInAutoFrame: true
      },
      // Far night-sky backdrop.
      {
        id: "garden-sky",
        geometry: "cube",
        position: [0, 8.0, -12],
        scale: [60, 36, 0.4],
        baseColor: [0.04, 0.16, 0.255, 1],
        metallic: 0,
        roughness: 1,
        emissiveColor: [0.06, 0.28, 0.4],
        emissiveStrength: 0.55
      },
      // Moon halo + orb.
      glowPiece("moon-halo", "sphere", [0.4, 0.72, 0.95, 1], [0.32, 0.62, 0.9], 0.35, 0.62, [2.5, 2.55, -6.2], [3.9, 3.9, 3.9]),
      glowPiece("moon-orb", "sphere", [0.62, 0.84, 1, 1], [0.36, 0.62, 0.88], 0.4, 0.62, [2.5, 2.55, -6.0], [2.1, 2.1, 2.1]),
      // Stars.
      ...STAR_POSITIONS.map((p, i) => star(i, p)),
      // Glow stones.
      glowPiece("glow-stone-l", "sphere", STONE_GOLD, [1, 0.882, 0.557], 0.12, 1.85, [-1.7, 0.12, 0.45], [0.26, 0.13, 0.2]),
      glowPiece("glow-stone-c", "sphere", STONE_CYAN, [0.49, 0.886, 1], 0.1, 1.7, [-0.15, 0.1, 0.35], [0.2, 0.1, 0.16]),
      glowPiece("glow-stone-r", "sphere", STONE_GOLD, [1, 0.882, 0.557], 0.12, 1.85, [1.75, 0.12, 0.4], [0.26, 0.13, 0.2]),
      glowPiece("glow-stone-back", "sphere", STONE_CYAN, [0.49, 0.886, 1], 0.1, 1.7, [0.55, 0.1, -0.7], [0.2, 0.1, 0.16]),
      // Broom prop (handle + glowing bristles).
      {
        id: "broom-handle",
        geometry: "cylinder",
        position: [-0.55, 0.5, 0.25],
        scale: [0.045, 1.0, 0.045],
        roll: -0.55,
        baseColor: [0.55, 0.42, 0.26, 1],
        metallic: 0.1,
        roughness: 0.7,
        emissiveColor: [0.12, 0.1, 0.06],
        emissiveStrength: 0.1
      },
      {
        ...glowPiece("broom-bristles", "cube", STONE_GOLD, [1, 0.882, 0.557], 0.18, 1.0, [-0.82, 0.18, 0.27], [0.32, 0.18, 0.12]),
        roll: -0.2
      }
    ],
    lights: [
      { id: "garden-key", kind: "point", color: [0.86, 0.93, 1], position: [-2.6, 3.6, 2.6], intensity: 4.4, range: 18 },
      { id: "garden-cyan-fill", kind: "point", color: [0.49, 0.886, 1], position: [2.4, 2.0, 1.4], intensity: 2.0, range: 13 },
      { id: "garden-warm-rim", kind: "point", color: [1, 0.78, 0.45], position: [0.4, 1.8, -2.0], intensity: 2.8, range: 13 }
    ]
  },
  walkableBounds: { min: [-3.6, 0, -2], max: [3.6, 0, 2] },
  shots: [
    { shotId: "shot-moon-garden-open", presetId: "establishing", startTime: 0, endTime: 20, cameraSubject: [0.025, 0.75, 0] },
    { shotId: "shot-glow-stone-teamwork", presetId: "two-shot", startTime: 20, endTime: 42, cameraSubject: [-0.06, 0.75, 0.215] },
    { shotId: "shot-moon-garden-finish", presetId: "close-up", startTime: 42, endTime: 60, cameraSubject: [-0.95, -0.2, 0] }
  ],
  blocking: [
    {
      characterId: "miko",
      shots: [
        { shotId: "shot-moon-garden-open", clip: "Loops", waypoints: [{ time: 0, position: [-0.95, 0, 0], yaw: YAW(0.12) }] },
        { shotId: "shot-glow-stone-teamwork", clip: "Loops", sweeping: true, waypoints: [{ time: 20, position: [-0.37, 0, 0.23], yaw: YAW(-0.5) }] },
        { shotId: "shot-moon-garden-finish", clip: "Loops", waypoints: [{ time: 42, position: [-0.65, 0, 0], yaw: YAW(0.12) }] }
      ]
    },
    {
      characterId: "luma",
      shots: [
        { shotId: "shot-moon-garden-open", clip: "Run", waypoints: [{ time: 0, position: [1.0, 0, 0], yaw: YAW(-0.12) }] },
        { shotId: "shot-glow-stone-teamwork", clip: "Run", waypoints: [{ time: 20, position: [0.25, 0, 0.2], yaw: YAW(-0.62) }] },
        { shotId: "shot-moon-garden-finish", clip: "Idle", waypoints: [{ time: 42, position: [0.68, 0, 0], yaw: YAW(-0.12) }] }
      ]
    }
  ],
  setDressing: [
    { propId: "mushroom", position: [-2.4, 0, 0.4], scale: 0.16, feetOffset: 2.8 },
    { propId: "mushroom", position: [2.5, 0, 0.2], scale: 0.14, feetOffset: 2.8 },
    { propId: "mushroom", position: [-1.6, 0, 1.0], scale: 0.1, feetOffset: 2.8 },
    { propId: "mushroom", position: [1.8, 0, 0.9], scale: 0.11, feetOffset: 2.8 },
    { propId: "mushroom", position: [0.2, 0, -1.5], scale: 0.13, feetOffset: 2.8 },
    { propId: "mushroom", position: [-3.4, 0, -0.6], scale: 0.08, feetOffset: 2.8 },
    { propId: "mushroom", position: [3.3, 0, -0.4], scale: 0.085, feetOffset: 2.8 },
    { propId: "mushroom", position: [-2.7, 0, -1.6], scale: 0.07, feetOffset: 2.8 },
    { propId: "mushroom", position: [2.6, 0, -1.7], scale: 0.075, feetOffset: 2.8 },
    { propId: "mushroom", position: [-0.9, 0, 1.4], scale: 0.06, feetOffset: 2.8 },
    { propId: "mushroom", position: [1.1, 0, 1.5], scale: 0.065, feetOffset: 2.8 }
  ],
  worldState: { glowSpanSeconds: DURATION },
  dialogue: {
    language: "en",
    lines: [
      { lineId: "shot-moon-garden-open:line-1", speakerId: "miko", startTime: 0, endTime: 10, text: "Luma, the moon lilies are losing their sparkle." },
      { lineId: "shot-moon-garden-open:line-2", speakerId: "luma", startTime: 10, endTime: 20, text: "Then we sweep softly and wake the glow stones." },
      { lineId: "shot-glow-stone-teamwork:line-1", speakerId: "miko", startTime: 20, endTime: 31, text: "I will polish the blue stones one tiny circle at a time." },
      { lineId: "shot-glow-stone-teamwork:line-2", speakerId: "luma", startTime: 31, endTime: 42, text: "And I will hum the garden's sleepy cleanup song." },
      { lineId: "shot-moon-garden-finish:line-1", speakerId: "luma", startTime: 42, endTime: 51, text: "The moon lilies are twinkling again." },
      { lineId: "shot-moon-garden-finish:line-2", speakerId: "miko", startTime: 51, endTime: 60, text: "Goodnight, little garden. Keep glowing." }
    ]
  }
};
