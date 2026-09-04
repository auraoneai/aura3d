import { describe, expect, it } from "vitest";
import {
  ControlVector3,
  Picking,
  type ControlObject3DLike,
  type ControlPickMetadata
} from "../../../packages/controls/src";

function pickObject(
  type: string,
  name: string,
  position: readonly [number, number, number],
  options: {
    readonly scale?: readonly [number, number, number];
    readonly visible?: boolean;
    readonly children?: readonly ControlObject3DLike[];
    readonly userData?: Record<string, unknown>;
    readonly picking?: ControlPickMetadata;
  } = {}
): ControlObject3DLike {
  return {
    type,
    name,
    position: new ControlVector3(position[0], position[1], position[2]),
    scale: options.scale ? new ControlVector3(options.scale[0], options.scale[1], options.scale[2]) : new ControlVector3(1, 1, 1),
    visible: options.visible,
    children: options.children,
    userData: options.userData,
    picking: options.picking
  };
}

const FORWARD = new ControlVector3(0, 0, -1);

describe("F4 skinned and instanced picking", () => {
  it("picks a SkinnedMesh through the bind-pose sphere without triangle-level claims", () => {
    const skinned = pickObject("SkinnedMesh", "hero-rig", [0, 0, -4], {
      scale: [1, 2, 1],
      picking: { label: "Hero rig", pickRadius: 0.6, skinnedBoneCount: 24 }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], { children: [skinned] });

    const report = new Picking().report(scene, new ControlVector3(), FORWARD);

    expect(report.hit?.object).toBe(skinned);
    expect(report.hit?.metadata?.label).toBe("Hero rig");
    expect(report.diagnostics.candidateObjects).toBe(1);
    expect(report.diagnostics.skippedNonPickable).toBe(1);
  });

  it("orders skinned hits against static meshes by entry distance", () => {
    const offRay = pickObject("Mesh", "off-ray prop", [3, 0, -2], { scale: [0.2, 0.2, 0.2] });
    const skinned = pickObject("SkinnedMesh", "background extra", [0.1, 0, -6], {
      picking: { label: "Background extra", pickRadius: 0.4 }
    });
    const nearMesh = pickObject("Mesh", "foreground crate", [0, 0, -2.5], {
      picking: { label: "Foreground crate", pickRadius: 0.4 }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], { children: [offRay, skinned, nearMesh] });

    const report = new Picking().report(scene, new ControlVector3(), FORWARD);

    expect(report.hits.map((hit) => hit.object.name)).toEqual(["foreground crate", "background extra"]);
    expect(report.hit?.object).toBe(nearMesh);
  });

  it("picks the nearest instance of an InstancedMesh and reports its instanceId", () => {
    const crowd = pickObject("InstancedMesh", "crowd", [0, 0, 0], {
      picking: {
        label: "Crowd",
        pickRadius: 0.3,
        instancePositions: [
          [2.5, 0, -3],
          [0, 0, -5],
          [-2.5, 0, -7]
        ]
      }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], { children: [crowd] });

    const report = new Picking().report(scene, new ControlVector3(), FORWARD);

    expect(report.hit?.object).toBe(crowd);
    expect(report.hit?.metadata?.instanceId).toBe(1);
    expect(report.hits).toHaveLength(1);
  });

  it("supports tuple and vector instance centers and skips out-of-range instances", () => {
    const scatter = pickObject("InstancedMesh", "scatter", [0, 0, 0], {
      picking: {
        label: "Scatter",
        pickRadius: 0.25,
        instancePositions: [
          new ControlVector3(0, 0, -2),
          [0.05, 0, -3] as [number, number, number],
          [0, 0, -50]
        ]
      }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], { children: [scatter] });

    const report = new Picking().report(scene, new ControlVector3(), FORWARD, { near: 0, far: 10 });

    expect(report.hits.map((hit) => hit.metadata?.instanceId)).toEqual([0, 1]);
    expect(report.hit?.metadata?.instanceId).toBe(0);
    expect(report.diagnostics.skippedOutOfRange).toBe(1);
  });

  it("keeps invisible/disabled skinned and instanced objects skipped", () => {
    const hidden = pickObject("SkinnedMesh", "hidden rig", [0, 0, -2], {
      visible: false,
      picking: { label: "Hidden rig", pickRadius: 0.5 }
    });
    const disabled = pickObject("InstancedMesh", "disabled crowd", [0, 0, -2.5], {
      picking: { label: "Disabled crowd", pickRadius: 0.5, selectable: false, instancePositions: [[0, 0, -2.5]] }
    });
    const live = pickObject("InstancedMesh", "live prop", [0, 0, -3], {
      picking: { label: "Live prop", pickRadius: 0.5, instancePositions: [[0, 0, -3]] }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], { children: [hidden, disabled, live] });

    const report = new Picking().report(scene, new ControlVector3(), FORWARD);

    expect(report.hit?.object).toBe(live);
    expect(report.diagnostics.skippedInvisible).toBe(1);
    expect(report.diagnostics.skippedDisabled).toBe(1);
  });

  it("falls back to the object sphere when an InstancedMesh has no instance list", () => {
    const single = pickObject("InstancedMesh", "single rock", [0, 0, -4], {
      picking: { label: "Single rock", pickRadius: 0.5 }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], { children: [single] });

    const report = new Picking().report(scene, new ControlVector3(), FORWARD);

    expect(report.hit?.object).toBe(single);
    expect(report.hit?.metadata?.instanceId).toBeUndefined();
  });
});
