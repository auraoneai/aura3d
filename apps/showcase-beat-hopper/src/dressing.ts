/**
 * Beat Hopper procedural concert stage dressing (presentation only): GPU-instanced curved J-hang concert
 * line-array speaker towers (`dress-stack-a-*`), folded-horn modular synth stacks (`dress-stack-b-*`), and
 * floating twin direct-drive DJ turntable consoles (`dress-deck-*`) beside the elevated track.
 * Alternating clusters repeat every `CLUSTER_P = 32 m` (`PERIOD = 64 m` full left-right cycle) inside two
 * periodic scrolling stage groups (`grp-dress-stacks` grounded at `FLOOR_Y` so 132 BPM bass-thump scale keeps
 * speaker feet locked to the floor, and `grp-dress-decks` at `DECK.y`). Positive scales only (`det > 0`)
 * guarantee single-call GPU instancing on both WebGPU and WebGL2.
 */
import { group, type AuraApp, type AuraSceneBuilder, type AuraTransformSpec } from "@aura3d/engine";
import { buildConcertDressingNodes } from "./art/proceduralModels";
import { FLOOR_Y } from "./stage";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

/** One cluster every CLUSTER_P metres of track, alternating sides (full bilateral period = 2 * CLUSTER_P). */
const CLUSTER_P = 32;
const PERIOD = CLUSTER_P * 2;
const NEAR_Z = 20;
const FAR_Z = -180;
export const DRESSING_SLOTS = Math.ceil((NEAR_Z - (FAR_Z - PERIOD)) / CLUSTER_P);

const STACK_A = { x: 5.75, height: 8.6, dz: 0 } as const;
const STACK_B = { x: 7.8, height: 6.6, dz: 2.8 } as const;
const DECK = { x: 6.4, y: -2.9, size: 5.2, dz: -6 } as const;

export function addDressing(builder: AuraSceneBuilder): void {
  const stackATransforms: AuraTransformSpec[] = [];
  const stackBTransforms: AuraTransformSpec[] = [];
  const deckTransforms: AuraTransformSpec[] = [];

  for (let k = 0; k < DRESSING_SLOTS; k++) {
    const z = NEAR_Z - k * CLUSTER_P;
    const side = k % 2 === 0 ? -1 : 1;
    stackATransforms.push({
      position: [side * STACK_A.x, 0, z + STACK_A.dz],
      rotation: [0, -side * 0.32, 0]
    });
    stackBTransforms.push({
      position: [side * STACK_B.x, 0, z + STACK_B.dz],
      rotation: [0, -side * 0.42, 0]
    });
    deckTransforms.push({
      position: [-side * DECK.x, 0, z + DECK.dz],
      rotation: [0, side * 0.38, 0]
    });
  }

  const { stackChildren, deckChildren } = buildConcertDressingNodes({
    stackATransforms,
    stackBTransforms,
    deckTransforms,
    stackAHeight: STACK_A.height,
    stackBHeight: STACK_B.height,
    deckMaxDim: DECK.size
  });

  builder.add(
    group("grp-dress-stacks", stackChildren)
      .position(0, FLOOR_Y, 0)
      .runtime({ id: "grp-dress-stacks" })
  );

  builder.add(
    group("grp-dress-decks", deckChildren)
      .position(0, DECK.y, 0)
      .runtime({ id: "grp-dress-decks" })
  );
}

export interface DressingRuntime {
  update(dist: number, pulse: number): void;
}

export function bindDressing(node: (id: string) => NodeHandle): DressingRuntime {
  return {
    update(dist, pulse) {
      const zShift = dist % PERIOD;
      const thump = 1 + 0.045 * pulse;
      node("grp-dress-stacks")
        .setPosition(0, FLOOR_Y, zShift)
        .setScale([thump, 1 + 0.022 * pulse, thump]);
      node("grp-dress-decks")
        .setPosition(0, DECK.y + 0.14 * pulse, zShift);
    }
  };
}
