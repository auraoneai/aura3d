import { describe, expect, it } from "vitest";
import {
  ControlVector3,
  Picking,
  type ControlObject3DLike,
  type ControlPickMetadata
} from "../../../packages/controls/src";

describe("Picking contract", () => {
  it("uses ray radius tests instead of selecting the nearest object merely in front of the camera", () => {
    const offRayCloser = pickObject("Mesh", "off-ray closer tower", [3, 0, -2], {
      scale: [0.2, 0.2, 0.2]
    });
    const alignedFarther = pickObject("Mesh", "core district tower", [0.1, 0, -5], {
      scale: [0.3, 0.3, 0.3],
      userData: {
        a3dPicking: {
          id: "district-core",
          label: "Core district tower",
          pickRadius: 0.35,
          priority: 2
        }
      }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], { children: [offRayCloser, alignedFarther] });

    const report = new Picking().report(scene);

    expect(report.hit?.object).toBe(alignedFarther);
    expect(report.hit?.metadata?.id).toBe("district-core");
    expect(report.hit?.distance).toBeLessThan(report.hit?.distanceAlongRay ?? 0);
    expect(report.diagnostics.testedObjects).toBe(3);
    expect(report.diagnostics.candidateObjects).toBe(2);
    expect(report.diagnostics.skippedNonPickable).toBe(1);
    expect(report.diagnostics.skippedMissedRadius).toBe(1);
    expect(report.diagnostics.nearestHitLabel).toBe("Core district tower");
  });

  it("reports hotspot metadata, disabled/invisible skips, hit ordering, and labels for scaled scenes", () => {
    const disabledMarker = pickObject("Mesh", "disabled marker", [0, 0, -2], {
      userData: { a3dPicking: { selectable: false, label: "Disabled marker", pickRadius: 0.4 } }
    });
    const invisibleMesh = pickObject("Mesh", "invisible facade", [0, 0, -2.5], {
      visible: false,
      scale: [1, 1, 1]
    });
    const lowPriorityMesh = pickObject("Mesh", "building mass", [0, 0, -3], {
      userData: { a3dPicking: { label: "Building mass", pickRadius: 0.25, priority: 1 } }
    });
    const hotspot = pickObject("Group", "lens hotspot", [0, 0, -3], {
      userData: {
        a3dPicking: {
          id: "hotspot-lens",
          kind: "hotspot",
          label: "Lens hotspot",
          pickRadius: 0.25,
          priority: 10
        }
      }
    });
    const scene = pickObject("Scene", "root", [0, 0, 0], {
      children: [disabledMarker, invisibleMesh, lowPriorityMesh, hotspot]
    });

    const report = new Picking().report(scene, new ControlVector3(), new ControlVector3(0, 0, -1), {
      near: 1,
      far: 4
    });

    expect(report.hits.map((hit) => hit.metadata?.label ?? hit.object.name)).toEqual(["Lens hotspot", "Building mass"]);
    expect(report.hit?.object).toBe(hotspot);
    expect(report.diagnostics.hitCount).toBe(2);
    expect(report.diagnostics.skippedDisabled).toBe(1);
    expect(report.diagnostics.skippedInvisible).toBe(1);
    expect(report.diagnostics.nearestHitLabel).toBe("Lens hotspot");
  });

  it("validates unusable ray and picking radius inputs", () => {
    const scene = pickObject("Scene", "root", [0, 0, 0], {
      children: [
        pickObject("Mesh", "invalid radius", [0, 0, -2], {
          userData: { a3dPicking: { label: "Invalid", pickRadius: 0 } }
        })
      ]
    });
    const picking = new Picking();

    expect(() => picking.pick(scene, new ControlVector3(), new ControlVector3())).toThrow(/direction/);
    expect(() => picking.pick(scene)).toThrow(/pickRadius/);
  });
});

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
