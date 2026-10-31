/**
 * Floating-island backdrop (presentation only): Meshy toy-style islands and balloons that drift past on both sides of the
 * road at the road's own scroll speed, following its curve. Placement is a pure function of the simulation's distance and
 * elapsed time, so it never touches the simulation or its random stream.
 */
import { defineAuraAssets, environments, lights, model, scene, type AuraApp, type AuraAssetRef, type AuraHdriId } from "@aura3d/engine";
import { LOOKS, sunDirection, type SplatLook } from "./look";
import { MODELS } from "./models";
import { curve } from "./sim";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type Scene = ReturnType<typeof scene>;

export interface Piece {
  readonly id: string;
  readonly kind: "islandTree" | "islandTower" | "balloon";
  readonly side: -1 | 1;
  readonly offset: number;
  readonly y: number;
  readonly z0: number;
  readonly size: number;
  readonly spin: number;
}

const SPAN = 150;
const NEAR = 12;
const FAR = NEAR - SPAN;

/** Deterministic layout: alternating sides, three model kinds, staggered depth, height and size. */
export const PIECES: readonly Piece[] = (() => {
  const kinds = ["islandTree", "islandTower", "balloon", "islandTree", "islandTower", "balloon", "islandTree", "balloon", "islandTower", "islandTree", "balloon", "islandTower"] as const;
  return kinds.map((kind, i): Piece => {
    const side = (i % 2 === 0 ? -1 : 1) as -1 | 1;
    const balloon = kind === "balloon";
    return {
      id: `backdrop-${i}`,
      kind,
      side,
      offset: (balloon ? 24 : 19) + ((i * 7) % 5) * 3.2,
      y: balloon ? 7 + ((i * 5) % 4) * 1.6 : -3.5 + ((i * 3) % 5) * 1.4,
      z0: (i / kinds.length) * SPAN + ((i * 11) % 7),
      size: balloon ? 7.5 : kind === "islandTower" ? 12 : 10,
      spin: (i % 3 === 0 ? 0.12 : -0.09)
    };
  });
})();

/**
 * Neutral-room IBL for the Meshy GLBs (LIGHT-01). Since 4.5.0 a scene with only authored lights gets no implicit
 * environment, so the islands, balloons and gems lost about half their luma (gem-double is mostly metal and needs the
 * reflections). 0.8 is calibrated at the evidence "roll" state against `evidence/splat-rush-port/screens/final/card@2x.jpg`
 * with the hemisphere contributing next to the environment and applied per normal (LIGHT-05/08): GLB-region luma
 * 98.7% of the card at 0.75 and 107.1% at 1 (lane G16 report). The toon road, gates and ball use custom shaders and
 * ignore it.
 */
export const BACKDROP_ENVIRONMENT_INTENSITY = 0.8;

/** Served E-A catalogue HDRI (`/hdri/<id>_1k.hdr`, CC0 Poly Haven; attribution in `public/hdri/ATTRIBUTION.md`). */
export const hdriAsset = (id: AuraHdriId): AuraAssetRef<"texture"> =>
  defineAuraAssets({ sky: { type: "texture", format: "hdr", url: `/hdri/${id}_1k.hdr`, metadata: { license: `CC0 1.0, Poly Haven ${id} (1k)` } } }).sky;

/** Distance of the engine key light from the origin along the sun direction. */
const SUN_DISTANCE = 100;

/** Runtime id of the carnival GLB key light (the time of day retints and re-aims it through `setLight`). */
export const BACKDROP_KEY_ID = "backdrop-key";

/**
 * Engine lights for the GLBs (the toon surfaces carry their own lighting). CR-L1: in the carnival look the key is the
 * same sun the toon shaders use (direction from `look.ts`, golden-stage colour and intensity scaled to the PBR path),
 * plus the rose bounce; CR-L3: the sky fill comes from the kloppenheim_06 IBL (background off).
 */
export function backdropLightRig(look: SplatLook) {
  if (look.backdropLights === "original" || !look.toon || !look.sky) {
    return [
      lights.hemisphere({ name: "backdrop-hemisphere", skyColor: "#ffffff", groundColor: "#7788aa", intensity: 1.15 }),
      lights.directional({ name: "backdrop-key", position: [6, 12, 6], target: [0, 0, 0], intensity: 1.6, color: "#ffffff" }),
      lights.directional({ name: "backdrop-fill", position: [-6, 8, -6], target: [0, 0, 0], intensity: 0.5, color: "#99bbff" })
    ];
  }
  const golden = look.sky.stages[0];
  if (!golden) throw new Error("splat-rush-port: the carnival look has no sky stages");
  const d = sunDirection(golden.sunElevationDeg, look.toon.sunAzimuthDeg);
  const b = look.toon.bounceDirection;
  return [
    /* GU47 phase 2: the runtime id is what `app.nodes.require("backdrop-key")` resolves (world.ts drives the key through
     * `setLight` as the time of day moves). Without it the first carnival update threw, boot stopped before `ready`, and
     * every carnival capture showed the frozen boot frame (all backdrop pieces stacked at the origin, no ball). */
    lights.directional({
      name: "backdrop-key", position: [d[0] * SUN_DISTANCE, d[1] * SUN_DISTANCE, d[2] * SUN_DISTANCE], target: [0, 0, 0],
      intensity: BACKDROP_KEY_SCALE * golden.sunIntensity, color: golden.sunColor, shadow: { cascades: 1, maxDistance: 160 }
    }).runtime({ id: BACKDROP_KEY_ID }),
    lights.directional({ name: "backdrop-bounce", position: [b[0] * SUN_DISTANCE, b[1] * SUN_DISTANCE, b[2] * SUN_DISTANCE], target: [0, 0, 0], intensity: BACKDROP_KEY_SCALE * look.toon.bounceIntensity, color: golden.bounce })
  ];
}

/** Toon sun intensity 0.75 is a display-referred factor; the GLBs' PBR key needs about 3x for the same luma (phase-2 calibration). */
export const BACKDROP_KEY_SCALE = 3.2;

/** Scene nodes (models) plus the light rig the models need. `look` defaults to the 4.6.0 rig (tests). */
export function addBackdrop(builder: Scene, look: SplatLook = LOOKS.original): void {
  const env = look.environment;
  builder.add(env.kind === "hdri"
    ? environments.hdri({ name: "backdrop-environment", texture: hdriAsset(env.id), intensity: env.intensity, rotation: (env.rotationDeg * Math.PI) / 180, background: false })
    : environments.neutral({ name: "backdrop-environment", intensity: env.intensity }));
  for (const light of backdropLightRig(look)) builder.add(light);
  const shadows = look.backdropLights === "from-toon";
  for (const p of PIECES) {
    const island = p.kind !== "balloon";
    builder.add(model(MODELS[p.kind], { name: p.id, targetMaxDimension: p.size, castShadow: shadows && island, receiveShadow: shadows }).runtime({ id: p.id }));
  }
}

/** CR-AN2: balloon sway and island rocking, pure functions of time (radians, within ±amplitude). */
export function backdropSway(look: SplatLook, piece: Piece, elapsed: number): { readonly x: number; readonly z: number } {
  if (!look.sway) return { x: 0, z: 0 };
  const deg = piece.kind === "balloon" ? look.sway.balloonDeg : look.sway.islandDeg;
  const a = (deg * Math.PI) / 180, phase = piece.z0 * 0.37;
  const speed = piece.kind === "balloon" ? 0.9 : 0.45;
  return { x: a * Math.sin(elapsed * speed + phase), z: a * Math.sin(elapsed * speed * 0.73 + phase * 1.7) };
}

/** Smooth 0..1 ramp so a piece grows in at the far end and shrinks out near the camera instead of popping. */
const ramp = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

export function updateBackdrop(node: (id: string) => NodeHandle, distance: number, elapsed: number, look: SplatLook = LOOKS.original): void {
  for (const p of PIECES) {
    const z = ((((p.z0 + distance * 0.55) % SPAN) + SPAN) % SPAN) + FAR;
    const x = p.side * p.offset + curve(-distance + z);
    const fade = ramp((z - FAR) / 24) * ramp((NEAR - z) / 26);
    const bob = Math.sin(elapsed * 0.8 + p.z0) * (p.kind === "balloon" ? 0.5 : 0.25);
    const sway = backdropSway(look, p, elapsed);
    node(p.id)
      .setVisible(fade > 0.02)
      .setPosition(x, p.y + bob, z)
      .setRotation(sway.x, elapsed * p.spin + p.z0, sway.z)
      .setScale(Math.max(0.001, fade));
  }
}
