import { Renderable, Scene } from "@aura3d/scene";
import { Geometry, UnlitMaterial } from "@aura3d/rendering";
import { createExample, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "01-basic-scene",
  title: "01 Basic Scene",
  purpose: "Build a small scene graph with a camera and renderer-facing cube items through public APIs.",
  acceptance: "Nested cubes and a grid are visible with scene traversal and render diagnostics available.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const scene = new Scene();
    const parent = scene.createNode("parent-cube");
    const child = scene.createNode("child-cube");
    const camera = scene.createOrthographicCamera({ name: "main-camera", left: -2.2, right: 2.2, bottom: -1.25, top: 1.25, near: 0.1, far: 20 });
    const light = scene.createLight("directional", "basic-scene-key");
    light.intensity = 1.2;
    parent.transform.setPosition(-0.55, 0, -3);
    child.transform.setPosition(1.15, 0.08, 0);
    child.transform.setScale(0.55, 0.55, 0.55);
    scene.root.addChild(parent);
    parent.addChild(child);
    scene.root.addChild(camera);
    scene.root.addChild(light);
    scene.addRenderable(parent, new Renderable({ geometry: "parent-cube", material: "parent-material" }));
    scene.addRenderable(child, new Renderable({ geometry: "child-cube", material: "child-material" }));
    scene.updateWorldTransforms();

    const parentMaterial = new UnlitMaterial({ color: [0.15, 0.6, 1, 1] });
    const childMaterial = new UnlitMaterial({ color: [0.8, 0.9, 0.25, 1] });

    return {
      renderSource: {
        scene,
        geometryLibrary: {
          "parent-cube": Geometry.cube(1),
          "child-cube": Geometry.cube(1),
        },
        materialLibrary: {
          "parent-material": parentMaterial,
          "child-material": childMaterial,
        },
      },
      metrics: { nodes: 5, cameras: scene.collectCameras().length, lights: scene.collectLights().length, sceneRenderables: scene.collectRenderables().length, webgl2: true },
    };
  });
}
