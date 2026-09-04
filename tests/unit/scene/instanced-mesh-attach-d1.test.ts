import { describe, expect, it } from "vitest";
import { Scene } from "../../../packages/scene/src/Scene";

/** D1 `createInstancedMesh` auto-parent option (muse3jsparity-PRD). */
describe("Scene.createInstancedMesh attach option", () => {
  it("registers without parenting by default (compat)", () => {
    const scene = new Scene();
    const mesh = scene.createInstancedMesh();
    expect(mesh.parent).toBeNull();
    expect(scene.getNodeById(mesh.id)).toBe(mesh);
  });

  it("parents under the root with attach:true", () => {
    const scene = new Scene();
    const mesh = scene.createInstancedMesh({}, true);
    expect(mesh.parent).toBe(scene.root);
    expect(scene.root.children).toContain(mesh);
  });

  it("parents under an explicit parent node", () => {
    const scene = new Scene();
    const group = scene.createGroup();
    const mesh = scene.createInstancedMesh({}, { parent: group });
    expect(mesh.parent).toBe(group);
  });
});
