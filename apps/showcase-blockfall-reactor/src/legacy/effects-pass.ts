// Visible effects pass (batch A): the arcade room gets depth haze with key-light
// inscatter, contact shadows under the cabinet and board, slow drifting room
// dust plus reactor plasma motes, and a framing vignette. Every effect here is
// default-on in the engine (lighting / post / vfx lanes); gameplay is untouched.
import { effects, type AuraNodeInput } from "@aura3d/engine";

/**
 * Particle colours as raw linear HDR triples: the emitter lowering treats an
 * [r, g, b] array as linear radiance (a hex string is capped at 1.0), which is
 * the only way to make motes bright enough to bloom. The public type is the
 * string form, hence the cast.
 */
const hdr = (r: number, g: number, b: number): string => [r, g, b] as unknown as string;

export interface BlockfallEffectsPassOptions {
  readonly reducedMotion: boolean;
}

export function createBlockfallEffectsPass(options: BlockfallEffectsPassOptions): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    // No volumetric-fog node: even at quality "off" it kept this route on
    // the CPU readback path (~18% fps vs the pre-pass frame on L4). The
    // scene's own standard fog node carries the room depth haze.
    effects.vignette({ name: "blockfall arcade vignette", intensity: 0.3, smoothness: 2.2, roundness: 0.8 })
  ];
  if (!options.reducedMotion) {
    nodes.push(
      // Reactor plasma motes rising either side of the board. (The wide
      // room-dust column was dropped in the perf pass: three CPU-updated
      // emitters cost more frame than the motes read at board scale.)
      ...[-2.15, 2.15].map((x, index) => effects.particles({
        name: `blockfall reactor plasma motes ${index + 1}`,
        seed: 4111 + index,
        emitter: "fountain",
        radius: 0.35,
        height: 3.4,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [2.2, 3.4],
        maxParticles: 18,
        rate: 7,
        prewarm: 4,
        size: [0.03, 0.055],
        materialMode: "spark",
        blend: "additive",
        color: index === 0 ? hdr(2.2, 0.55, 1.6) : hdr(0.5, 2.0, 1.1)
      }).position(x, -0.4, 0.6))
    );
  }
  return nodes;
}
