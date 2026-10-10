/**
 * S4 — legacy parity: `rigs.fromSpec` reproduces `resolveCameraFrame`
 * (index.ts:11078) exactly, over 40 golden tuples and several frame times.
 */
import { describe, expect, it } from "vitest";
import type { AuraCameraSpec, AuraSceneSnapshot } from "@aura3d/engine";
import { resolveCameraFrame, type AuraRuntimeNodeRegistry, createFromSpecRig, type LegacySpecRigDeps } from "@aura3d/engine/lanes";
import type { AuraCameraRigContext, AuraCameraPose } from "@aura3d/engine/contracts";

import {
  cases,
  ctx,
  EPS,
  fakeSnapshot,
  legacyDeps
} from "./legacyCases.js";

describe("S4 — fromSpec legacy parity (40 tuples)", () => {
  it(`covers ${cases.length} cases`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  for (const [i, c] of cases.entries()) {
    it(`${String(i).padStart(2, "0")} ${c.name}`, () => {
      const snapshot = fakeSnapshot(c.sceneNodes ?? []);
      const flat = (c.sceneNodes ?? []) as never[];
      const deps = legacyDeps(c.spec, c.registry, flat as never);
      const rig = createFromSpecRig(c.spec, deps);
      for (const t of c.times) {
        const expected = resolveCameraFrame(snapshot, c.spec, t, c.registry);
        const pose = rig.update(ctx(t));
        for (const [k, a, b] of [
          ["position.x", pose.position[0], expected.eye[0]],
          ["position.y", pose.position[1], expected.eye[1]],
          ["position.z", pose.position[2], expected.eye[2]],
          ["target.x", pose.target[0], expected.target[0]],
          ["target.y", pose.target[1], expected.target[1]],
          ["target.z", pose.target[2], expected.target[2]]
        ] as const) {
          expect(Math.abs(a - b), `${k} @t=${t}`).toBeLessThanOrEqual(EPS);
        }
      }
    });
  }

  it("fov/near/far/ortho fields pass through", () => {
    const spec = { mode: "perspective", fov: 33, near: 0.2, far: 321, orthographicSize: 4 } as AuraCameraSpec;
    const rig = createFromSpecRig(spec, legacyDeps(spec, undefined, []));
    const pose: AuraCameraPose = rig.update(ctx(0));
    expect(pose.fov).toBe(33);
    expect(pose.near).toBe(0.2);
    expect(pose.far).toBe(321);
    expect(pose.orthographicSize).toBe(4);
  });
});
