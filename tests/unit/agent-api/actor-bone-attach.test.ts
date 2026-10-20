/**
 * Bone attachments — `resolveActorBoneAttachments` composes
 * `modelMatrix × boneWorld × offset` from the current-frame bone matrix and
 * writes the decomposed transform onto the target runtime node handle.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  registerActorBoneMatrixSource,
  registerActorBoneAttachment,
  resetActorAnimationStateSources,
  resetActorBoneAttachments,
  resolveActorBoneAttachments
} from "../../../packages/engine/src/agent-api/app/actorAnimationHandle";

const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major translation matrix. */
function translation(x: number, y: number, z: number): Float32Array {
  const m = new Float32Array(IDENTITY);
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function makeRegistry() {
  const written: { id: string; p: number[]; r: number[]; s: number }[] = [];
  const nodes = new Map<string, { setPosition: (x: number, y: number, z: number) => void; setRotation: (x: number, y: number, z: number) => void; setScale: (s: number) => void }>();
  return {
    written,
    register(id: string) {
      nodes.set(id, {
        setPosition: (x, y, z) => written.push({ id, p: [x, y, z], r: [0, 0, 0], s: 1 }),
        setRotation: (x, y, z) => { const last = written[written.length - 1]!; last.r = [x, y, z]; },
        setScale: (s) => { const last = written[written.length - 1]!; last.s = s; }
      });
    },
    get: (id: string) => nodes.get(id)
  };
}

describe("resolveActorBoneAttachments", () => {
  afterEach(() => {
    resetActorAnimationStateSources();
    resetActorBoneAttachments();
  });

  it("writes modelMatrix × boneWorld × offset onto the target handle", () => {
    registerActorBoneMatrixSource("batter", (bone) =>
      bone === "RightForearm" ? translation(0.25, 1.1, 0.3) : null
    );
    const registry = makeRegistry();
    registry.register("bat");
    registerActorBoneAttachment("batter", {
      targetId: "bat",
      bone: "RightForearm",
      offset: IDENTITY,
      scale: 1
    });
    const actorModel = translation(5, 0, -2);
    const resolved = resolveActorBoneAttachments("batter", actorModel, registry);
    expect(resolved).toBe(1);
    const write = registry.written[0]!;
    // (5,0,-2) + (0.25,1.1,0.3)
    expect(write.p[0]).toBeCloseTo(5.25);
    expect(write.p[1]).toBeCloseTo(1.1);
    expect(write.p[2]).toBeCloseTo(-1.7);
  });

  it("skips silently when the bone or target is missing", () => {
    registerActorBoneMatrixSource("batter", () => null);
    const registry = makeRegistry();
    const dispose = registerActorBoneAttachment("batter", {
      targetId: "ghost",
      bone: "RightForearm",
      offset: IDENTITY,
      scale: 1
    });
    expect(resolveActorBoneAttachments("batter", IDENTITY, registry)).toBe(0);
    dispose();
  });

  it("the disposer removes exactly one attachment", () => {
    registerActorBoneMatrixSource("batter", () => translation(0, 0, 0));
    const registry = makeRegistry();
    registry.register("a");
    registry.register("b");
    const disposeA = registerActorBoneAttachment("batter", { targetId: "a", bone: "Hips", offset: IDENTITY, scale: 1 });
    registerActorBoneAttachment("batter", { targetId: "b", bone: "Hips", offset: IDENTITY, scale: 1 });
    disposeA();
    expect(resolveActorBoneAttachments("batter", IDENTITY, registry)).toBe(1);
  });
});
