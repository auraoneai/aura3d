// Visible effects pass (batch A): neon district arena. Volumetric city haze
// separates the swarm from the district edge, contact shadows seat the courier
// and the horde on the deck, a night IBL gives the metal props reflections,
// neon embers drift up through the arena and a framing vignette pulls the eye
// to the player pocket. Gameplay is untouched.
import { effects, environments, type AuraNodeInput } from "@aura3d/engine";

/** Linear HDR particle colour (array form; hex colours are capped at 1.0). */
const hdr = (r: number, g: number, b: number): string => [r, g, b] as unknown as string;

export function createNeonSwarmEffectsPass(options: { readonly reducedMotion: boolean }): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    // Replaces the plain 0.02 fog: ≈10% on the deck under the top-down lens
    // (≈14 m), 30-40% at the district edge.
    effects.volumetricFog({
      name: "neon swarm district volumetric haze",
      density: 0.02,
      color: "#26355a",
      intensity: 0.2
    }),
    effects.contactShadows({ length: 0.3, thickness: 0.06, steps: 12, intensity: 0.85, lights: "shadowed" }),
    environments.preset("night", { name: "neon swarm night reflections", intensity: 0.6, background: false }),
    effects.vignette({ name: "neon swarm vignette", intensity: 0.3, smoothness: 2.2, roundness: 0.8 })
  ];
  if (!options.reducedMotion) {
    nodes.push(
      // Two interleaved ember columns (cyan + magenta) over the whole arena.
      ...[hdr(0.35, 1.6, 2.2), hdr(2.0, 0.4, 1.6)].map((color, index) => effects.particles({
        name: `neon swarm arena embers ${index + 1}`,
        seed: 7101 + index,
        emitter: "fountain",
        radius: 15,
        height: 6,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [6, 9],
        maxParticles: 700,
        rate: 90,
        prewarm: 9,
        size: [0.06, 0.12],
        materialMode: "additive-glow",
        blend: "additive",
        color
      }).position(index === 0 ? -1 : 1, 0.05, 0))
    );
  }
  return nodes;
}
