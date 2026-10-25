/**
 * Attachments must follow the FINAL pose of the frame: a procedural rotation
 * written after the clip (overlay pose, IK) only dirties local transforms, so
 * the bone lookup has to refresh world transforms before it is read.
 */

import { afterEach, describe, expect, it } from "vitest";
import { Scene, SceneNode } from "../../../packages/scene/src/index";
import {
  registerActorBoneAttachment,
  registerActorBoneMatrixSource,
  resetActorAnimationStateSources,
  resetActorBoneAttachments,
  resolveActorBoneAttachments
} from "../../../packages/engine/src/agent-api/app/actorAnimationHandle";
import { createActorBoneMatrixLookup } from "../../../packages/engine/src/agent-api/app/actorBoneMatrixLookup";

const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function quatAxis(axis: readonly [number, number, number], angle: number): [number, number, number, number] {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

function buildArm() {
  const scene = new Scene();
  const upper = new SceneNode({ id: "upper", name: "RightUpperArm" });
  const fore = new SceneNode({ id: "fore", name: "RightForearm" });
  upper.transform.setPosition(0, 1.4, 0);
  fore.transform.setPosition(0.3, 0, 0);
  upper.addChild(fore);
  scene.root.addChild(upper);
  return { scene, upper, fore, actor: { pipeline: { resources: { scene } } } };
}

function capture() {
  const writes = new Map<string, number[]>();
  return {
    writes,
    get: (id: string) => ({
      setPosition: (x: number, y: number, z: number) => void writes.set(id, [x, y, z]),
      setRotation: () => undefined,
      setScale: () => undefined
    })
  };
}

describe("bone attachments follow the final pose", () => {
  afterEach(() => {
    resetActorAnimationStateSources();
    resetActorBoneAttachments();
  });

  it("reads the forearm after a procedural rotation applied on top of the clip", () => {
    const { scene, upper, fore, actor } = buildArm();
    // Clip pose: applied and world transforms resolved (as the clip pass does).
    upper.transform.setRotation(...quatAxis([0, 0, 1], 0.2));
    scene.updateWorldTransforms();
    // Procedural override written after the clip: only local transforms change.
    upper.transform.setRotation(...quatAxis([0, 1, 0], 1.3));

    registerActorBoneMatrixSource("batter", createActorBoneMatrixLookup(actor));
    registerActorBoneAttachment("batter", { targetId: "bat", bone: "RightForearm", offset: IDENTITY, scale: 1 });
    const nodes = capture();
    expect(resolveActorBoneAttachments("batter", IDENTITY, nodes)).toBe(1);

    // Expected: the forearm world position of the FINAL pose.
    const reference = buildArm();
    reference.upper.transform.setRotation(...quatAxis([0, 1, 0], 1.3));
    reference.scene.updateWorldTransforms();
    const m = reference.fore.transform.worldMatrix;
    const written = nodes.writes.get("bat")!;
    expect(Math.abs(written[0]! - m[12]!)).toBeLessThan(1e-4);
    expect(Math.abs(written[1]! - m[13]!)).toBeLessThan(1e-4);
    expect(Math.abs(written[2]! - m[14]!)).toBeLessThan(1e-4);
    // And the live bone agrees after the lookup refreshed the scene.
    expect(Math.abs(fore.transform.worldMatrix[12]! - m[12]!)).toBeLessThan(1e-4);
  });

  it("returns null for an unknown bone without touching the scene", () => {
    const { actor } = buildArm();
    expect(createActorBoneMatrixLookup(actor)("NoSuchBone")).toBeNull();
  });
});
