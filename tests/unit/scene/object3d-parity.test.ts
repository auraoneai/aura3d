import { describe, expect, it } from "vitest";
import { GroupCompat, MeshCompat, Object3DCompat, SceneCompat } from "../../../packages/three-compat/src";
import { Group, Mesh, Scene } from "@galileo3d/scene";

describe("Three.js Object3D parity surface", () => {
  it("supports add/remove/traverse patterns used by Three.js scene ports", () => {
    const root = new Object3DCompat();
    const group = new GroupCompat();
    const mesh = new MeshCompat("geometry", "material");

    root.add(group);
    group.add(mesh);

    const types: string[] = [];
    root.traverse((object) => types.push(object.type));

    expect(types).toEqual(["Object3D", "Group", "Mesh"]);
    expect(mesh.parent).toBe(group);

    group.remove(mesh);
    expect(mesh.parent).toBeNull();
    expect(group.children).toHaveLength(0);
  });

  it("keeps the native G3D scene graph aligned with the compatibility entry points", () => {
    const sceneCompat = new SceneCompat();
    const scene = new Scene();
    const group = new Group({ name: "native-group" });
    const mesh = new Mesh({ name: "native-mesh", renderable: { geometry: "geometry:box", material: "material:pbr" } });

    scene.root.addChild(group);
    group.addChild(mesh);
    scene.updateWorldTransforms();

    expect(sceneCompat.type).toBe("Scene");
    expect(scene.collectRenderables()).toHaveLength(1);
    expect(mesh.parent).toBe(group);
  });
});
