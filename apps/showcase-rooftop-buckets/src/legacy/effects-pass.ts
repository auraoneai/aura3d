// Visible effects pass (batch A): dusk rooftop court. Warm volumetric dusk
// haze with sun inscatter (god rays off the low key), contact shadows under
// the athletes and hoop, a sunset IBL for the court finish and rim metal,
// golden dust motes hanging in the sun over the court and a soft vignette.
// Gameplay is untouched.
import { effects, environments, type AuraNodeInput } from "@aura3d/engine";

/** Linear HDR particle colour (array form; hex colours are capped at 1.0). */
const hdr = (r: number, g: number, b: number): string => [r, g, b] as unknown as string;

export function createRooftopEffectsPass(options: { readonly reducedMotion: boolean }): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    // Replaces the 0.005 dusk haze (a no-op at court scale): ≈8% on the
    // athletes at ≈10 m, 30%+ on the skyline behind the pavilion.
    effects.volumetricFog({
      name: "rooftop dusk volumetric haze",
      density: 0.03,
      color: "#6a4a78",
      intensity: 0.5
    }),
    effects.contactShadows({ length: 0.3, thickness: 0.05, steps: 16, intensity: 0.9, lights: "shadowed" }),
    environments.preset("sunset", { name: "rooftop sunset reflections", intensity: 0.7, background: false }),
    effects.vignette({ name: "rooftop vignette", intensity: 0.3, smoothness: 0.65, roundness: 0.8 })
  ];
  if (!options.reducedMotion) {
    nodes.push(
      effects.particles({
        name: "rooftop golden dust motes",
        seed: 8101,
        emitter: "fountain",
        radius: 9,
        height: 6,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [10, 14],
        maxParticles: 900,
        rate: 75,
        prewarm: 14,
        size: [0.04, 0.08],
        materialMode: "additive-glow",
        blend: "additive",
        color: hdr(1.1, 0.78, 0.42)
      }).position(0, 0, 0)
    );
  }
  return nodes;
}
