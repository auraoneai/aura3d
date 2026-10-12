// Visible effects pass (batch A): hangar workshop + arena pit. Cool volumetric
// hangar haze lit by the floodlights, GTAO + contact shadows to seat the mechs
// on the deck, a studio IBL so the armour plates and deck metal reflect,
// welding sparks off the workbench practical, dust hanging in the floodlights
// over both the workshop and the pit, and a framing vignette. Gameplay is
// untouched.
import { effects, environments, type AuraNodeInput } from "@aura3d/engine";

/** Linear HDR particle colour (array form; hex colours are capped at 1.0). */
const hdr = (r: number, g: number, b: number): string => [r, g, b] as unknown as string;

export function createMechHangarEffectsPass(options: {
  readonly reducedMotion: boolean;
  readonly arenaCenterZ: number;
}): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    effects.volumetricFog({
      name: "hangar volumetric haze",
      density: 0.045,
      color: "#22364d",
      intensity: 0.5
    }),
    effects.ambientOcclusion({ name: "hangar deck occlusion", intensity: 0.38, radius: 0.62, density: 0.55, color: "#03060b" }),
    effects.contactShadows({ length: 0.3, thickness: 0.06, steps: 16, intensity: 0.9, lights: "shadowed" }),
    environments.preset("studio", { name: "hangar armour reflections", intensity: 0.7, background: false }),
    effects.vignette({ name: "hangar vignette", intensity: 0.34, smoothness: 0.6, roundness: 0.8 })
  ];
  if (!options.reducedMotion) {
    nodes.push(
      // Floodlight dust over the workshop bay and over the arena pit.
      ...[0, options.arenaCenterZ].map((z, index) => effects.particles({
        name: `hangar floodlight dust ${index + 1}`,
        seed: 9101 + index,
        emitter: "fountain",
        radius: 6.5,
        height: 5,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [10, 14],
        maxParticles: 650,
        rate: 55,
        prewarm: 14,
        size: [0.03, 0.06],
        materialMode: "additive-glow",
        blend: "additive",
        color: hdr(0.7, 0.8, 0.95)
      }).position(0, 0, z)),
      // Welding sparks at the warm workbench practical.
      effects.particles({
        name: "hangar welding sparks",
        seed: 9111,
        emitter: "fountain",
        radius: 0.18,
        height: 1.4,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [0.6, 1.1],
        maxParticles: 220,
        rate: 180,
        prewarm: 2,
        size: [0.02, 0.04],
        materialMode: "spark",
        blend: "additive",
        color: hdr(3.2, 1.6, 0.5)
      }).position(-2.6, 1.1, 1.9)
    );
  }
  return nodes;
}
