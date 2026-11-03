import { describe, expect, it } from "vitest";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import type { AuraLightNode, AuraSceneSnapshot, AuraVec3 } from "../../../packages/engine/src/agent-api/nodes/types";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import {
  createProductionRuntimeCollectedLights,
  createRuntimeAddedCollectedLights,
  productionRuntimeLightDirection
} from "../../../packages/engine/src/agent-api/compiler/observations";
import { queueRuntimeLightPatch, updateRuntimeLight } from "../../../packages/engine/src/agent-api/compiler/lights";

const paths = [
  { name: "legacy", flags: resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } }) },
  { name: "physical", flags: resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true } }) }
] as const;

function snapshot(node: AuraLightNode): AuraSceneSnapshot {
  return {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
    nodes: [node],
    diagnostics: { enabled: false }
  } as AuraSceneSnapshot;
}

function expectDirection(actual: readonly number[], expected: AuraVec3): void {
  expect(actual).toHaveLength(3);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 7));
}

function targetLight(kind: "point" | "spot"): AuraLightNode {
  const options = { name: "aimed", position: [1, 2, 3] as const, target: [4, 6, 3] as const, intensity: 8 };
  const builder = kind === "point" ? lights.point(options) : lights.spot(options);
  return builder.lookAt([-2, 2, 3]).rotate([0, Math.PI / 2, 0]).runtime({ id: "aimed" }).toJSON();
}

describe("punctual light target direction", () => {
  for (const kind of ["point", "spot"] as const) {
    for (const path of paths) {
      it(`${kind} uses target before lookAt and rotation in the ${path.name} mount and runtime-add paths`, () => {
        const node = targetLight(kind);
        const mounted = createProductionRuntimeCollectedLights(snapshot(node), path.flags);
        const added = createRuntimeAddedCollectedLights([node], path.flags);
        expect(mounted).toHaveLength(1);
        expect(added).toHaveLength(1);
        expect(added[0]!.lights).toHaveLength(1);
        expectDirection(mounted[0]!.direction, [0.6, 0.8, 0]);
        expectDirection(added[0]!.lights[0]!.direction, [0.6, 0.8, 0]);
      });

      it(`${kind} re-aims on movement and retains explicit runtime direction and visibility in the ${path.name} path`, () => {
        const node = targetLight(kind);
        const collected = createProductionRuntimeCollectedLights(snapshot(node), path.flags);
        const light = collected[0]!;
        const handle = {
          id: "aimed",
          version: 0,
          visible: true,
          position: [1, 2, 3] as [number, number, number],
          setPosition(x: number, y: number, z: number) {
            this.position = [x, y, z];
            this.version += 1;
          }
        };

        updateRuntimeLight(node, handle, collected, 0);
        handle.setPosition(4, 3, 3);
        updateRuntimeLight(node, handle, collected, 1);
        expectDirection(light.direction, [0, 1, 0]);
        handle.setPosition(4, 6, 6);
        updateRuntimeLight(node, handle, collected, 2);
        expectDirection(light.direction, [0, 0, -1]);
        handle.setPosition(4, 6, 3);
        updateRuntimeLight(node, handle, collected, 2.5);
        expectDirection(light.direction, [0, -1, 0]);
        expect(Array.from(light.source.transform.worldMatrix).every(Number.isFinite)).toBe(true);

        queueRuntimeLightPatch(handle, { direction: [1, 0, 0] });
        updateRuntimeLight(node, handle, collected, 3);
        handle.setPosition(8, 3, 3);
        updateRuntimeLight(node, handle, collected, 4);
        expectDirection(light.direction, [1, 0, 0]);
        handle.setPosition(4, 6, 3);
        updateRuntimeLight(node, handle, collected, 4.5);
        expectDirection(light.direction, [1, 0, 0]);
        handle.visible = false;
        handle.version += 1;
        updateRuntimeLight(node, handle, collected, 5);
        expect(light.intensity).toBe(0);
        expect(light.source.visible).toBe(false);
        handle.visible = true;
        handle.version += 1;
        updateRuntimeLight(node, handle, collected, 6);
        expect(light.intensity).toBe(8);
        expect(light.source.visible).toBe(true);
        expectDirection(light.direction, [1, 0, 0]);
      });

      it(`${kind} falls downward for coincident finite targets on the ${path.name} mount and runtime-add paths`, () => {
        for (const position of [[0, 0, 0], [1, 2, 3]] as const) {
          const options = { position, target: position, intensity: 4 };
          const node = (kind === "point" ? lights.point(options) : lights.spot(options)).toJSON();
          const mounted = createProductionRuntimeCollectedLights(snapshot(node), path.flags);
          const added = createRuntimeAddedCollectedLights([node], path.flags);
          for (const light of [mounted[0]!, added[0]!.lights[0]!]) {
            expectDirection(light.direction, [0, -1, 0]);
            expect(Array.from(light.source.transform.worldMatrix).every(Number.isFinite)).toBe(true);
          }
        }
      });
    }
  }

  it("uses a finite downward fallback when a spot coincides with the legacy default target", () => {
    const spot = lights.spot({ position: [0, 0.75, 0] }).toJSON();
    for (const path of paths) {
      const light = createProductionRuntimeCollectedLights(snapshot(spot), path.flags)[0]!;
      expectDirection(light.direction, [0, -1, 0]);
      expect(Array.from(light.source.transform.worldMatrix).every(Number.isFinite)).toBe(true);
    }
  });

  it("preserves lookAt before rotation and the existing fallbacks without a punctual target", () => {
    const point = lights.point({ position: [1, 2, 3] }).lookAt([-2, 2, 3]).rotate([0, Math.PI / 2, 0]).toJSON();
    expectDirection(productionRuntimeLightDirection(point, [1, 2, 3]), [-1, 0, 0]);
    const rotated = lights.point({ position: [1, 2, 3] }).rotate([0, Math.PI / 2, 0]).toJSON();
    expectDirection(productionRuntimeLightDirection(rotated, [1, 2, 3]), [-1, 0, 0]);
    const coincident = lights.point({ position: [1, 2, 3], target: [1, 2, 3] }).toJSON();
    expectDirection(productionRuntimeLightDirection(coincident, [1, 2, 3]), [0, -1, 0]);
  });
});
