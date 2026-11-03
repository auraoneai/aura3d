import { describe, expect, it } from "vitest";
import { Bounds3, OrthographicCamera, Renderable, Scene, SceneNode, collectRenderables, queryScene, type Mat4 } from "@aura3d/scene";
import { Ray, Vector3 } from "@aura3d/math";
import { SelectionBox } from "../../../packages/controls/src/SelectionBox";
import { Geometry, MockRenderDevice, Renderer, UnlitMaterial, pickSceneRenderableHits } from "../../../packages/rendering/src";

function addRenderable(node: SceneNode): Renderable {
  const renderable = new Renderable({ geometry: `geometry:${node.name}`, material: `material:${node.name}` });
  node.renderable = renderable;
  return renderable;
}

function renderableNode(scene: Scene, name: string): SceneNode {
  const node = scene.createNode(name);
  addRenderable(node);
  return node;
}

function names(entries: readonly { node: SceneNode }[]): string[] {
  return entries.map(({ node }) => node.name);
}

function translation(x: number): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, 0, 0, 1
  ];
}

describe("scene renderable visibility", () => {
  it("excludes hidden subtrees, preserves preorder, and restores visibility on later collections", () => {
    const scene = new Scene();
    const rootRenderable = addRenderable(scene.root);
    const before = renderableNode(scene, "before");
    const container = scene.createNode("container");
    const hidden = renderableNode(scene, "hidden");
    const child = renderableNode(scene, "child");
    const grandchild = renderableNode(scene, "grandchild");
    const nestedHidden = renderableNode(scene, "nested-hidden");
    const nestedChild = renderableNode(scene, "nested-child");
    const sibling = renderableNode(scene, "sibling");
    const after = renderableNode(scene, "after");
    scene.root.addChild(before).addChild(container).addChild(after);
    container.addChild(hidden).addChild(sibling);
    hidden.addChild(child).addChild(nestedHidden);
    child.addChild(grandchild);
    nestedHidden.addChild(nestedChild);
    hidden.visible = false;
    nestedHidden.visible = false;

    const initial = scene.collectRenderables();
    expect(names(initial)).toEqual(["root", "before", "sibling", "after"]);
    expect(initial[0]).toEqual({ node: scene.root, renderable: rootRenderable });
    expect(child.visible).toBe(true);
    expect(grandchild.visible).toBe(true);

    hidden.visible = true;
    expect(names(scene.collectRenderables())).toEqual(["root", "before", "hidden", "child", "grandchild", "sibling", "after"]);
    child.visible = false;
    nestedHidden.visible = true;
    expect(names(scene.collectRenderables())).toEqual(["root", "before", "hidden", "nested-hidden", "nested-child", "sibling", "after"]);
    child.visible = true;
    expect(names(scene.collectRenderables())).toEqual([
      "root", "before", "hidden", "child", "grandchild", "nested-hidden", "nested-child", "sibling", "after"
    ]);
    scene.root.visible = false;
    expect(scene.collectRenderables()).toEqual([]);
    scene.root.visible = true;
    expect(names(scene.collectRenderables())).toEqual([
      "root", "before", "hidden", "child", "grandchild", "nested-hidden", "nested-child", "sibling", "after"
    ]);
  });

  it("treats the supplied root as the visibility boundary for subtree collection", () => {
    const hiddenAncestor = new SceneNode({ name: "outside-root" });
    const subtree = new SceneNode({ name: "subtree" });
    const descendant = new SceneNode({ name: "descendant" });
    addRenderable(subtree);
    addRenderable(descendant);
    hiddenAncestor.addChild(subtree);
    subtree.addChild(descendant);
    hiddenAncestor.visible = false;

    expect(collectRenderables(hiddenAncestor)).toEqual([]);
    expect(names(collectRenderables(subtree))).toEqual(["subtree", "descendant"]);
    subtree.visible = false;
    expect(collectRenderables(subtree)).toEqual([]);
    subtree.visible = true;
    expect(names(collectRenderables(subtree))).toEqual(["subtree", "descendant"]);
  });

  it("does not inspect renderables beneath a hidden ancestor", () => {
    const root = new SceneNode({ name: "root" });
    const hidden = new SceneNode({ name: "hidden" });
    const child = new SceneNode({ name: "child" });
    const renderable = addRenderable(child);
    let reads = 0;
    Object.defineProperty(child, "renderable", {
      configurable: true,
      get: () => {
        reads += 1;
        return renderable;
      }
    });
    root.addChild(hidden);
    hidden.addChild(child);
    hidden.visible = false;

    expect(collectRenderables(root)).toEqual([]);
    expect(reads).toBe(0);
    hidden.visible = true;
    expect(collectRenderables(root)).toEqual([{ node: child, renderable }]);
    expect(reads).toBe(1);
  });

  it("retains traversal's child snapshots when an earlier renderable removes a sibling", () => {
    const root = new SceneNode({ name: "root" });
    const first = new SceneNode({ name: "first" });
    const later = new SceneNode({ name: "later" });
    const firstRenderable = addRenderable(first);
    addRenderable(later);
    root.addChild(first).addChild(later);
    Object.defineProperty(first, "renderable", {
      configurable: true,
      get: () => {
        root.removeChild(later);
        return firstRenderable;
      }
    });

    expect(names(collectRenderables(root))).toEqual(["first", "later"]);
    expect(root.children).toEqual([first]);
  });

  it("retains custom SceneNode traversal order while excluding hidden descendants", () => {
    class ReverseNode extends SceneNode {
      override traverse(visitor: (node: SceneNode) => void): void {
        visitor(this);
        for (const child of [...this.children].reverse()) child.traverse(visitor);
      }
    }

    const root = new SceneNode({ name: "root" });
    const custom = new ReverseNode({ name: "custom" });
    const first = new SceneNode({ name: "first" });
    const hidden = new SceneNode({ name: "hidden" });
    const hiddenChild = new SceneNode({ name: "hidden-child" });
    const last = new SceneNode({ name: "last" });
    addRenderable(first);
    addRenderable(hiddenChild);
    addRenderable(last);
    root.addChild(custom);
    custom.addChild(first).addChild(hidden).addChild(last);
    hidden.addChild(hiddenChild);
    hidden.visible = false;

    expect(queryScene(root, {}).map((node) => node.name)).toEqual(["root", "custom", "last", "hidden", "hidden-child", "first"]);
    expect(names(collectRenderables(root))).toEqual(["last", "first"]);
  });

  it("checks hidden ancestors even when custom traversal visits descendants first", () => {
    class ChildrenFirstNode extends SceneNode {
      override traverse(visitor: (node: SceneNode) => void): void {
        for (const child of [...this.children]) child.traverse(visitor);
        visitor(this);
      }
    }

    const root = new ChildrenFirstNode({ name: "root" });
    const hidden = new ChildrenFirstNode({ name: "hidden" });
    const child = new SceneNode({ name: "child" });
    const sibling = new SceneNode({ name: "sibling" });
    addRenderable(child);
    addRenderable(sibling);
    root.addChild(hidden).addChild(sibling);
    hidden.addChild(child);
    hidden.visible = false;

    expect(names(collectRenderables(root))).toEqual(["sibling"]);
    hidden.visible = true;
    expect(names(collectRenderables(root))).toEqual(["child", "sibling"]);
    root.visible = false;
    expect(collectRenderables(root)).toEqual([]);
  });

  it("keeps scene queries and local visibility, name, layer, type, and bounds filters independent", () => {
    const scene = new Scene();
    const hidden = scene.createNode("hidden");
    const child = renderableNode(scene, "child-mesh");
    const hiddenLeaf = scene.createNode("hidden-leaf");
    const camera = scene.createPerspectiveCamera({ name: "child-camera" });
    const light = scene.createLight("point", "child-light");
    scene.root.addChild(hidden);
    hidden.addChild(child).addChild(camera).addChild(light);
    child.addChild(hiddenLeaf);
    hidden.visible = false;
    hiddenLeaf.visible = false;
    hidden.transform.setPosition(5, 0, 0);
    child.transform.setPosition(1, 0, 0);
    child.layerMask = 4;
    child.setLocalBounds(Bounds3.fromCenterSize([0, 0, 0], [1, 1, 1]));

    expect(scene.query({}).map((node) => node.name)).toEqual(["root", "hidden", "child-mesh", "hidden-leaf", "child-camera", "child-light"]);
    expect(scene.query({ visible: true }).map((node) => node.name)).toEqual(["root", "child-mesh", "child-camera", "child-light"]);
    expect(scene.query({ visible: false })).toEqual([hidden, hiddenLeaf]);
    expect(scene.findByName("child-mesh")).toEqual([child]);
    expect(scene.query({ type: "camera", visible: true })).toEqual([camera]);
    expect(scene.collectLights()).toEqual([light]);
    expect(scene.query({
      name: /^child-/,
      visible: true,
      layerMask: 4,
      bounds: Bounds3.fromCenterSize([6, 0, 0], [1, 1, 1])
    })).toEqual([child]);
    expect(child.transform.worldMatrix[12]).toBe(6);
    expect(queryScene(hidden, { name: "child-mesh", visible: true, layerMask: 4 })).toEqual([child]);
  });

  it("does not update matrices, dirty state, or manual transform mode while collecting", () => {
    const scene = new Scene();
    const parent = scene.createNode("parent");
    const child = renderableNode(scene, "child");
    scene.root.addChild(parent);
    parent.addChild(child);
    parent.transform.setPosition(4, 0, 0);
    child.transform.setLocalMatrix(translation(1));
    scene.updateWorldTransforms();
    expect(child.transform.worldMatrix[12]).toBe(5);
    expect(child.transform.matrixAutoUpdate).toBe(false);
    parent.transform.setPosition(8, 0, 0);
    parent.visible = false;

    const nodes = [scene.root, parent, child];
    const matrices = nodes.map((node) => node.transform.worldMatrix);
    const values = matrices.map((matrix) => [...matrix]);
    const dirty = nodes.map((node) => node.transform.isDirty());
    expect(scene.collectRenderables()).toEqual([]);
    parent.visible = true;
    expect(names(scene.collectRenderables())).toEqual(["child"]);
    nodes.forEach((node, index) => {
      expect(node.transform.worldMatrix).toBe(matrices[index]);
      expect(node.transform.worldMatrix).toEqual(values[index]);
      expect(node.transform.isDirty()).toBe(dirty[index]);
    });
    expect(child.transform.matrixAutoUpdate).toBe(false);
    scene.updateWorldTransforms();
    expect(child.transform.worldMatrix[12]).toBe(9);
  });

  it("leaves explicit invisible selection, filters, and instance matrices independent of render collection", () => {
    const scene = new Scene();
    const parent = scene.createNode("hidden");
    const child = scene.createNode("instanced");
    scene.root.addChild(parent);
    parent.addChild(child);
    parent.visible = false;
    parent.transform.setPosition(2, 0, 0);
    child.transform.setPosition(1, 0, 0);
    child.setLocalBounds(Bounds3.fromCenterSize([0, 0, 0], [0.5, 0.5, 0.5]));
    child.renderable = new Renderable({
      geometry: "geometry:instances",
      material: "material:instances",
      instanceTransforms: [...translation(-1), ...translation(1)]
    });
    const camera = new OrthographicCamera({ left: -6, right: 6, bottom: -6, top: 6, near: 0.1, far: 30 });
    camera.transform.setPosition(0, 0, 10);
    const firstRegion = [{ x: 0.25, y: -0.2 }, { x: 0.42, y: 0.2 }] as const;
    const secondRegion = [{ x: 0.58, y: -0.2 }, { x: 0.75, y: 0.2 }] as const;

    expect(scene.collectRenderables()).toEqual([]);
    expect(new SelectionBox(camera, scene.root).select(...firstRegion)).toEqual([]);
    const selection = new SelectionBox(camera, scene.root, { includeInvisible: true });
    expect(selection.select(...firstRegion)).toEqual([{ object: child, instanceId: 0 }]);
    expect(selection.select(...secondRegion)).toEqual([{ object: child, instanceId: 1 }]);
    const filtered = new SelectionBox(camera, scene.root, {
      includeInvisible: true,
      filter: (object, instanceId) => object === child && instanceId === 1
    });
    expect(filtered.select(...firstRegion)).toEqual([]);
    expect(filtered.select(...secondRegion)).toEqual([{ object: child, instanceId: 1 }]);
    expect(child.transform.worldMatrix[12]).toBe(3);
  });

  it("suppresses hidden descendants in mock render and picking, then restores them", async () => {
    const scene = new Scene();
    const hidden = scene.createNode("hidden");
    const nested = scene.createNode("nested");
    const child = scene.createNode("child");
    const sibling = scene.createNode("sibling");
    scene.root.addChild(hidden).addChild(sibling);
    hidden.addChild(nested);
    nested.addChild(child);
    hidden.transform.setPosition(1, 0, 0);
    child.transform.setPosition(-1, 0, 0);
    sibling.transform.setPosition(4, 0, 0);
    hidden.visible = false;
    child.renderable = new Renderable({ geometry: "geometry:cube", material: "material:unlit" });
    sibling.renderable = new Renderable({ geometry: "geometry:cube", material: "material:unlit" });
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.cube();
    const source = {
      scene,
      geometryLibrary: { "geometry:cube": geometry },
      materialLibrary: { "material:unlit": new UnlitMaterial() },
      frustumCulling: false
    };
    const ray = new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    try {
      renderer.render(source);
      expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual(["sibling"]);
      expect(pickSceneRenderableHits(source, ray)).toEqual([]);

      hidden.visible = true;
      renderer.render(source);
      expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label).sort()).toEqual(["child", "sibling"]);
      expect(pickSceneRenderableHits(source, ray).map((hit) => hit.node)).toEqual([child]);
      expect(child.transform.worldMatrix[12]).toBe(0);
    } finally {
      renderer.dispose();
      geometry.dispose();
    }
  });
});
