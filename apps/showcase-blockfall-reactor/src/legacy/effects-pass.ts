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
    // Volumetric haze: the first volumetric-fog node replaces the old 0.028
    // depth haze, so the board (≈8.5 m) keeps most of its contrast while the
    // room behind it (12-16 m) separates into a violet atmosphere.
    effects.volumetricFog({
      name: "blockfall arcade volumetric haze",
      density: 0.05,
      color: "#5e4490",
      intensity: 0.2
    }),
    // Screen-space contact shadows from the key: grounds the cabinet and the
    // board frame on the floor instead of letting them float.
    effects.contactShadows({ length: 0.32, thickness: 0.06, steps: 8, intensity: 0.9, lights: "shadowed" }),
    effects.vignette({ name: "blockfall arcade vignette", intensity: 0.3, smoothness: 2.2, roundness: 0.8 })
  ];
  if (!options.reducedMotion) {
    nodes.push(
      // Room dust: a wide slow column (radius 6 m, 4.5 m tall) drifting
      // through the key light across the whole frame.
      effects.particles({
        name: "blockfall room dust motes",
        seed: 4101,
        emitter: "fountain",
        radius: 6,
        height: 4.5,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [9, 13],
        maxParticles: 420,
        rate: 40,
        prewarm: 13,
        size: [0.03, 0.06],
        materialMode: "additive-glow",
        blend: "additive",
        color: hdr(0.62, 0.5, 0.86)
      }).position(0, -0.6, 1.2),
      // Reactor plasma motes rising either side of the board.
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
        maxParticles: 150,
        rate: 48,
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
