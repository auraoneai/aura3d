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
import { probes } from "@aura3d/engine/lanes";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LightProbeGenerator } from "three/examples/jsm/lights/LightProbeGenerator.js";
import { PROBE_STRIPE_ROOM } from "./specs";

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

// ---------- 02-S12 probe fixtures ----------------------------------------------

/** Room box shared by the prd02-probe-stripe-room spec and its probe (specs.ts). */
export { PROBE_STRIPE_ROOM };

/** Probe sample point for the red-wall bounce reference (in front of "white cube a"). */
export const RED_WALL_PROBE_POINT = [-1.6, 0.4, -0.4] as const;

/**
 * PRD 02 probe nodes the shared spec format cannot express. The lane page
 * appends them to the mounted Aura scene (`app.setScene`) — the public
 * `probes.reflection()` / `probes.irradianceVolume()` builders.
 */
export function auraProbeNodes(sceneId: string): readonly unknown[] {
  if (sceneId === "prd02-probe-stripe-room") {
    return [
      probes.reflection({ name: "stripe room probe", position: [0, 1.5, 0], box: { min: PROBE_STRIPE_ROOM.min, max: PROBE_STRIPE_ROOM.max }, resolution: 256, blendDistance: 1 }).toJSON()
    ];
  }
  if (sceneId === "prd02-red-wall-bounce") {
    return [probes.irradianceVolume({ name: "red wall volume", bounds: { min: [-3, 0, -4], max: [3, 3.2, 2] }, resolution: [4, 4, 4] }).toJSON()];
  }
  return [];
}

interface ProbeAppLike {
  readonly scene: { readonly nodes: readonly unknown[] };
  setScene(scene: unknown): void;
  step(dt: number): void;
}

/** Append the scene's probe nodes and let the `once` bakes run. */
export async function applyAuraProbes(sceneId: string, app: ProbeAppLike): Promise<number> {
  const nodes = auraProbeNodes(sceneId);
  if (nodes.length === 0) return 0;
  app.setScene({ ...app.scene, nodes: [...app.scene.nodes, ...nodes] });
  for (let frame = 0; frame < 12; frame += 1) {
    app.step(1 / 60);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  }
  return nodes.length;
}

/**
 * Three reference for the red-wall bounce: a CubeCamera capture at
 * `RED_WALL_PROBE_POINT` → `LightProbeGenerator.fromCubeRenderTarget` (SH
 * irradiance) added to the scene, then the READY frame is re-rendered.
 */
export async function applyThreeLightProbe(sceneId: string): Promise<boolean> {
  if (sceneId !== "prd02-red-wall-bounce") return false;
  const graph = window.__QR_THREE_GRAPH__;
  if (!graph) throw new Error(`${sceneId}: runThreeScene did not publish __QR_THREE_GRAPH__`);
  const target = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
  const cubeCamera = new THREE.CubeCamera(0.05, 40, target);
  cubeCamera.position.set(...RED_WALL_PROBE_POINT);
  graph.scene.add(cubeCamera);
  cubeCamera.update(graph.renderer, graph.scene);
  const probe = await LightProbeGenerator.fromCubeRenderTarget(graph.renderer, target);
  graph.scene.add(probe);
  graph.renderer.render(graph.scene, graph.camera);
  return true;
}
