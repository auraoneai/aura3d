// Visible effects pass (batch A): the arcade room around the pinball cabinet
// gets violet volumetric haze for depth, contact shadows under the table and
// mechanisms, drifting neon dust through the key light, warm sparks rising off
// the backbox, a stronger IBL so the chrome rails and reflective floor pick up
// reflections, and a framing vignette. Gameplay is untouched.
import { effects, environments, type AuraNodeInput } from "@aura3d/engine";

/** Linear HDR particle colour (array form, see blockfall effects-pass). */
const hdr = (r: number, g: number, b: number): string => [r, g, b] as unknown as string;

export function createVaultEffectsPass(options: { readonly reducedMotion: boolean }): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    effects.volumetricFog({
      name: "vault arcade volumetric haze",
      density: 0.055,
      color: "#5a4380",
      intensity: 0.22,
      volumetricQuality: "balanced"
    }),
    effects.contactShadows({ length: 0.28, thickness: 0.05, steps: 8, intensity: 0.9, lights: "shadowed" }),
    // Studio IBL (background off) gives the steel rails, flippers and floor a
    // real reflection source instead of the dim implicit room probe.
    environments.preset("studio", { name: "vault reflection environment", intensity: 0.5, background: false }),
    effects.vignette({ name: "vault arcade vignette", intensity: 0.3, smoothness: 2.2, roundness: 0.8 })
  ];
  if (!options.reducedMotion) {
    nodes.push(
      effects.particles({
        name: "vault neon dust motes",
        seed: 5101,
        emitter: "fountain",
        radius: 5.5,
        height: 5,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [10, 14],
        maxParticles: 225,
        rate: 19,
        prewarm: 14,
        size: [0.03, 0.06],
        materialMode: "additive-glow",
        blend: "additive",
        color: hdr(0.45, 0.62, 0.95)
      }).position(0, -2.1, 0),
      effects.particles({
        name: "vault backbox sparks",
        seed: 5111,
        emitter: "fountain",
        radius: 1.2,
        height: 2.6,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [1.6, 2.6],
        maxParticles: 90,
        rate: 30,
        prewarm: 3,
        size: [0.025, 0.05],
        materialMode: "spark",
        blend: "additive",
        color: hdr(2.4, 1.1, 0.35)
      }).position(0, 1.6, -3.6)
    );
  }
  return nodes;
}
