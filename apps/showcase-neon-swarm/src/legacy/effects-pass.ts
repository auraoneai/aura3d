// Visible effects pass (batch A): neon district arena. City haze (standard
// fog in main.ts) separates the swarm from the district edge, contact shadows seat the courier
// and the horde on the deck, a night IBL gives the metal props reflections,
// neon embers drift up through the arena and a framing vignette pulls the eye
// to the player pocket. Gameplay is untouched.
import { effects, environments, type AuraNodeInput } from "@aura3d/engine";

/** Linear HDR particle colour (array form; hex colours are capped at 1.0). */
const hdr = (r: number, g: number, b: number): string => [r, g, b] as unknown as string;

export function createNeonSwarmEffectsPass(options: { readonly reducedMotion: boolean }): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    // No volumetric-fog node: even at quality "off" it kept blockfall on
    // the CPU readback path (~18% fps, run 38335452473) and this route's
    // fps hovered at the 0.85 gate (0.87/0.85/0.83). The district haze
    // rides the scene's standard forward fog in main.ts instead.
    environments.preset("night", { name: "neon swarm night reflections", intensity: 0.2, background: false }),
    effects.vignette({ name: "neon swarm vignette", intensity: 0.3, smoothness: 2.2, roundness: 0.8 })
  ];
  if (!options.reducedMotion) {
    nodes.push(
      // Two interleaved ember columns (cyan + magenta) over the whole arena.
      ...[hdr(0.26, 1.2, 1.65), hdr(1.5, 0.3, 1.2)].map((color, index) => effects.particles({
        name: `neon swarm arena embers ${index + 1}`,
        seed: 7101 + index,
        emitter: "fountain",
        radius: 15,
        height: 6,
        speed: 1,
        gravity: 0,
        drag: 0,
        lifetime: [6, 9],
        maxParticles: 140,
        rate: 20,
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
