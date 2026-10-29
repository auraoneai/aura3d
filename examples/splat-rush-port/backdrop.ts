/**
 * Floating-island backdrop (presentation only): Meshy toy-style islands and balloons that drift past on both sides of the
 * road at the road's own scroll speed, following its curve. Placement is a pure function of the simulation's distance and
 * elapsed time, so it never touches the simulation or its random stream.
 */
import { environments, lights, model, scene, type AuraApp } from "@aura3d/engine";
import { MODELS } from "./models";
import { curve } from "./sim";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type Scene = ReturnType<typeof scene>;

interface Piece {
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

/** Scene nodes (models) plus the light rig the models need (the toon surfaces carry their own lighting). */
export function addBackdrop(builder: Scene): void {
  builder
    .add(environments.neutral({ name: "backdrop-environment", intensity: BACKDROP_ENVIRONMENT_INTENSITY }))
    .add(lights.hemisphere({ name: "backdrop-hemisphere", skyColor: "#ffffff", groundColor: "#7788aa", intensity: 1.15 }))
    .add(lights.directional({ name: "backdrop-key", position: [6, 12, 6], target: [0, 0, 0], intensity: 1.6, color: "#ffffff" }))
    .add(lights.directional({ name: "backdrop-fill", position: [-6, 8, -6], target: [0, 0, 0], intensity: 0.5, color: "#99bbff" }));
  for (const p of PIECES) {
    builder.add(model(MODELS[p.kind], { name: p.id, targetMaxDimension: p.size, castShadow: false, receiveShadow: false }).runtime({ id: p.id }));
  }
}

/** Smooth 0..1 ramp so a piece grows in at the far end and shrinks out near the camera instead of popping. */
const ramp = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

export function updateBackdrop(node: (id: string) => NodeHandle, distance: number, elapsed: number): void {
  for (const p of PIECES) {
    const z = ((((p.z0 + distance * 0.55) % SPAN) + SPAN) % SPAN) + FAR;
    const x = p.side * p.offset + curve(-distance + z);
    const fade = ramp((z - FAR) / 24) * ramp((NEAR - z) / 26);
    const bob = Math.sin(elapsed * 0.8 + p.z0) * (p.kind === "balloon" ? 0.5 : 0.25);
    node(p.id)
      .setVisible(fade > 0.02)
      .setPosition(x, p.y + bob, z)
      .setRotation(0, elapsed * p.spin + p.z0, 0)
      .setScale(Math.max(0.001, fade));
  }
}
