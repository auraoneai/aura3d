/**
 * Beat Hopper Meshy stage dressing (presentation only): club speaker stacks and a floating neon DJ deck beside the
 * elevated track. Clusters are world-anchored every CLUSTER_P metres and alternate sides; a fixed pool of model
 * nodes is re-placed per frame from the run distance (`dist`), so the dressing scrolls 1:1 with the track and never
 * touches the sim, input or timing. The stacks thump on the sim beat (scale only). Models are typed
 * `model(assets.x)` assets admitted in `aura.assets.json`; every node is created visible and parked at scale 0.001
 * when its slot is out of range, never hidden.
 */
import { model, type AuraApp, type AuraSceneBuilder } from "@aura3d/engine";
import { assets } from "./aura-model-assets";
import { FLOOR_Y } from "./stage";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

/** One cluster every CLUSTER_P metres of track, alternating sides. */
const CLUSTER_P = 32;
/** World-z window the pool covers (camera sits at z ~ 8.5 looking down -z). */
const NEAR_Z = 16;
const FAR_Z = -124;
/** Slots grow in over the last FADE_M metres of the far window so new clusters never pop in at full size. */
const FADE_M = 18;
export const DRESSING_SLOTS = Math.ceil((NEAR_Z - FAR_Z) / CLUSTER_P) + 1;

/* layout: the tall stack stands on the neon floor just outside the girder, a shorter stack beside it a little closer
 * to the camera, and the DJ deck floats over the floor on the opposite side (the stage already floats its islands) */
const STACK_A = { x: 5.75, height: 8.6, dz: 0 } as const;
const STACK_B = { x: 7.8, height: 6.6, dz: 2.8 } as const;
const DECK = { x: 6.4, y: -2.9, size: 5.2, dz: -6 } as const;

const RIM_MAGENTA = { color: "#ff2fb3", power: 2.4, intensity: 0.75 } as const;
const RIM_CYAN = { color: "#23e6ff", power: 2.2, intensity: 0.7 } as const;

const ids = (k: number) => ({ a: `dress-stack-a-${k}`, b: `dress-stack-b-${k}`, deck: `dress-deck-${k}` });

export function addDressing(builder: AuraSceneBuilder): void {
  for (let k = 0; k < DRESSING_SLOTS; k++) {
    const id = ids(k);
    builder.add(model(assets.bhSpeakerStack, {
      name: id.a, scaleMode: "fit", targetHeight: STACK_A.height, castShadow: false, receiveShadow: false,
      position: [0, FLOOR_Y, 0], materialOverrides: [{ rim: RIM_MAGENTA }]
    }).runtime({ id: id.a }));
    builder.add(model(assets.bhSpeakerStackB, {
      name: id.b, scaleMode: "fit", targetHeight: STACK_B.height, castShadow: false, receiveShadow: false,
      position: [0, FLOOR_Y, 0], materialOverrides: [{ rim: RIM_CYAN }]
    }).runtime({ id: id.b }));
    builder.add(model(assets.bhTurntable, {
      name: id.deck, scaleMode: "fit", targetMaxDimension: DECK.size, castShadow: false, receiveShadow: false,
      position: [0, DECK.y, 0], materialOverrides: [{ rim: RIM_CYAN }]
    }).runtime({ id: id.deck }));
  }
}

export interface DressingRuntime {
  update(dist: number, pulse: number): void;
}

export function bindDressing(node: (id: string) => NodeHandle): DressingRuntime {
  return {
    update(dist, pulse) {
      /* cluster n sits at world z = -n * CLUSTER_P + dist; slot k shows cluster first + k */
      const first = Math.ceil((dist - NEAR_Z) / CLUSTER_P);
      const thump = 1 + 0.045 * pulse;
      for (let k = 0; k < DRESSING_SLOTS; k++) {
        const n = first + k;
        const z = -n * CLUSTER_P + dist;
        const id = ids(k);
        const a = node(id.a), b = node(id.b), deck = node(id.deck);
        if (n < 1 || z < FAR_Z) {
          /* before the first cluster or past the far window: park on-screen-safe at near-zero scale (never hidden) */
          a.setScale(0.001); b.setScale(0.001); deck.setScale(0.001);
          continue;
        }
        const grow = Math.min(1, Math.max(0.001, (z - FAR_Z) / FADE_M));
        const side = n % 2 === 0 ? -1 : 1;
        a.setPosition(side * STACK_A.x, FLOOR_Y, z + STACK_A.dz).setRotation(0, -side * 0.32, 0)
          .setScale([grow * thump, grow * (1 + 0.02 * pulse), grow * thump]);
        b.setPosition(side * STACK_B.x, FLOOR_Y, z + STACK_B.dz).setRotation(0, -side * 0.42, 0)
          .setScale([grow * thump, grow * (1 + 0.02 * pulse), grow * thump]);
        deck.setPosition(-side * DECK.x, DECK.y, z + DECK.dz).setRotation(0, side * 0.38, 0).setScale(grow);
      }
    }
  };
}
