// Visible effects pass (batch A): night-city atmosphere for the chase lens.
// Cool volumetric street haze gives the tower canyon depth, contact shadows
// seat the van and traffic on the asphalt, a night IBL puts sky reflections
// into the wet road and van paint, drifting street motes catch the practicals
// and warm steam rises off the depot dock. Gameplay is untouched.
import { effects, environments, type AuraNodeInput } from "@aura3d/engine";

/** Linear HDR particle colour (array form; hex colours are capped at 1.0). */
const hdr = (r: number, g: number, b: number): string => [r, g, b] as unknown as string;

export function createCourierEffectsPass(options: {
  readonly reducedMotion: boolean;
  readonly depot: { readonly x: number; readonly z: number };
}): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    // Replaces the old 0.0018 haze (a no-op at chase distances): ≈6% at the
    // van, 35-45% on towers 25-35 m out, so the skyline layers into depth.
    effects.volumetricFog({
      name: "courier night street volumetric haze",
      density: 0.03,
      color: "#3d5878",
      intensity: 0.55,
      volumetricQuality: "balanced"
    }),
    effects.contactShadows({ length: 0.3, thickness: 0.06, steps: 4, intensity: 0.85, lights: "shadowed" }),
    environments.preset("night", { name: "courier night reflections", intensity: 0.75, background: false }),
    effects.vignette({ name: "courier chase vignette", intensity: 0.3, smoothness: 2.2, roundness: 0.8 })
  ];
  if (!options.reducedMotion) {
    nodes.push(
      // City-wide motes: a 26 m column over the street grid, so they are in
      // every chase frame wherever the van drives.
      effects.particles({
        name: "courier street motes",
        seed: 6101,
        emitter: "fountain",
        radius: 26,
        height: 7,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [12, 16],
        maxParticles: 550,
        rate: 42,
        prewarm: 16,
        size: [0.05, 0.1],
        materialMode: "additive-glow",
        blend: "additive",
        color: hdr(0.42, 0.7, 0.95)
      }).position(0, 0.2, 2),
      effects.particles({
        name: "courier depot steam",
        seed: 6111,
        emitter: "fountain",
        radius: 0.9,
        height: 3.2,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [2.4, 3.6],
        maxParticles: 120,
        rate: 35,
        prewarm: 4,
        size: [0.16, 0.32],
        materialMode: "smoke",
        blend: "alpha",
        color: hdr(0.55, 0.5, 0.48)
      }).position(options.depot.x + 4.5, 0.1, options.depot.z)
    );
  }
  return nodes;
}
