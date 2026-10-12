/**
 * Pulse Tunnel — default-boot effects pass (visible effects batch B).
 *
 * Presentation only: gate timing, collision and scoring stay in gameplay/.
 * Families wired for the neon corridor:
 *   - corridor key cascaded shadow + contact shadows on the deck
 *   - persistent height haze (violet floor mist) with a smoothed downbeat
 *     pulse: the pulse node now transitions instead of popping a dense fog
 *     on and off in one frame
 *   - neon dust streaming down the tunnel and cyan engine sparks
 *   - grade + vignette (bloom values are unchanged; see main.ts)
 * Plus the flash fix for the wall gates (see `PULSE_GATE_FLASH` below).
 */
import { effects, type AuraNodeInput } from "@aura3d/engine";

/**
 * Gate emissive levels. The pre-flash wall gate used emissiveIntensity 2.8 and
 * kept rendering until it was culled behind the camera, so it filled the frame
 * on every pass (luma 37 -> 128, then a one-frame drop). Lower the flash, and
 * hide gates as soon as they clear the player plane (render-only; the
 * gameplay gate keeps its own z and resolution).
 */
export const PULSE_GATE_FLASH = {
  bodyIntensity: 1.0,
  flashIntensity: 1.55,
  /** Gates further than this past the player plane are not drawn (camera at +2.4). */
  hidePastPlayer: 0.3
} as const;

const FOG_TRANSITION_SECONDS = 0.14;

export function pulseTunnelEffectsPass(options: { readonly reducedMotion: boolean; readonly playerZ: number }): readonly AuraNodeInput[] {
  const { reducedMotion, playerZ } = options;
  return [
    effects.contactShadows({ length: 0.2, thickness: 0.04, steps: 8, intensity: 0.85 }),
    effects.vignette({ intensity: 0.3, smoothness: 2.4, roundness: 1 }),
    // Neon dust streaming toward the camera from the tunnel throat.
    effects.particles({
      name: "tunnel neon dust stream",
      emitter: "ambient",
      materialMode: "additive-glow",
      rate: reducedMotion ? 14 : 40,
      maxParticles: 260,
      prewarm: 4,
      seed: 7101,
      lifetime: [3, 5],
      speed: 1.6,
      size: [0.025, 0.05],
      gravity: 0,
      drag: 0.02,
      color: "#c084fc"
    }).position(0, 0.7, playerZ - 9),
    effects.particles({
      name: "tunnel cyan deck sparks",
      emitter: "ambient",
      materialMode: "spark",
      rate: reducedMotion ? 10 : 30,
      maxParticles: 180,
      prewarm: 3,
      seed: 7102,
      lifetime: [1.6, 2.6],
      speed: 1.2,
      size: [0.02, 0.04],
      gravity: -0.2,
      color: "#22d3ee"
    }).position(0, 0.15, playerZ - 4)
  ];
}

/** Persistent floor haze; must come before the downbeat pulse fog node. */
export function pulseTunnelBaseHaze(): AuraNodeInput {
  return effects.fog({
    name: "tunnel violet floor haze",
    // heightDensity selects the C-21 height mode.
    color: "#2a1458",
    density: 0.012,
    heightDensity: 0.035,
    heightFalloff: 1.4,
    heightReference: -0.1,
    start: 1.2,
    maxOpacity: 0.62,
    affectsBackground: false,
    transitionSeconds: FOG_TRANSITION_SECONDS
  });
}

/** The downbeat pulse: a modest lift over the base haze, eased in and out. */
export function pulseTunnelDownbeatFog(): ReturnType<typeof effects.fog> {
  return effects.fog({
    name: "pulse downbeat fog pulse",
    color: "#341a66",
    density: 0.018,
    heightDensity: 0.05,
    heightFalloff: 1.4,
    heightReference: -0.1,
    start: 1.2,
    maxOpacity: 0.68,
    affectsBackground: false,
    transitionSeconds: FOG_TRANSITION_SECONDS
  });
}
