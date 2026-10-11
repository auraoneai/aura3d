/**
 * Lane prd02 render-item fixtures (PRD-02 §6.4, item 1923). The lane page
 * registers these before the Aura app mounts, keyed off the broken control.
 *
 * `receive-shadow-off` / `receive-shadow-on` register the C-01 `collect`
 * contributor `createPrd02ReceiveShadowContributor` on the ground-plane render
 * items (label suffix "ground plane", the shared `ground()` name). Production
 * items get `receiveShadow` from the compiler only after Q-15-5 (#759) and
 * Q-04-2 (#764) land; until then this fixture is the only writer.
 *
 * `window.__qrPrd02Fixture.matched` counts the items the predicate matched, so
 * a spec can prove the fixture touched the receiver instead of passing on a
 * no-op.
 */
import { registerFrameContributor } from "@aura3d/rendering/contracts";
import { createPrd02ReceiveShadowContributor } from "@aura3d/rendering/lanes";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

declare global {
  interface Window {
    __qrPrd02Fixture?: { readonly control: string; matched: number };
  }
}

const GROUND_LABEL = "ground plane";

export function installReceiveShadowFixture(control: string): void {
  if (control !== "receive-shadow-off" && control !== "receive-shadow-on") return;
  const state = { control, matched: 0 };
  window.__qrPrd02Fixture = state;
  registerFrameContributor(
    createPrd02ReceiveShadowContributor({
      value: control === "receive-shadow-on",
      predicate: (item) => {
        const hit = (item.label ?? "").endsWith(GROUND_LABEL);
        if (hit) state.matched += 1;
        return hit;
      }
    })
  );
}

/**
 * PRD-02 §16.1 scene table: the three side of `prd02-no-lights` lights the
 * scene with `scene.environment = pmrem.fromScene(new RoomEnvironment())`
 * (the reference for the Aura neutral room, 02-S2). The shared translator
 * renders the spec as-is (no lights → black), so the lane page applies the
 * room environment to the published graph and re-renders the READY frame.
 */
export const THREE_ROOM_ENVIRONMENT_SCENES: ReadonlySet<string> = new Set(["prd02-no-lights"]);

export function applyThreeRoomEnvironment(sceneId: string): boolean {
  if (!THREE_ROOM_ENVIRONMENT_SCENES.has(sceneId)) return false;
  const graph = window.__QR_THREE_GRAPH__;
  if (!graph) throw new Error(`${sceneId}: runThreeScene did not publish __QR_THREE_GRAPH__`);
  const pmrem = new THREE.PMREMGenerator(graph.renderer);
  graph.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  graph.renderer.render(graph.scene, graph.camera);
  return true;
}
