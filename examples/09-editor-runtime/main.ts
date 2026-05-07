import { EditorRuntime, TransformCommand, type TransformLike } from "@galileo3d/editor";
import { Geometry, UnlitMaterial } from "@galileo3d/rendering";
import { Renderable, Scene } from "@galileo3d/scene";
import { createExample, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "09-editor-runtime",
  title: "09 Editor Runtime",
  purpose: "Run a select and transform edit through public editor runtime commands.",
  acceptance: "A selected cube is moved by command history and editor mode remains inspectable.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, async () => {
    const runtime = new EditorRuntime();
    const scene = new Scene();
    const camera = scene.createOrthographicCamera({ name: "editor-camera", left: -2.2, right: 2.2, bottom: -1.25, top: 1.25, near: 0.1, far: 20 });
    const light = scene.createLight("directional", "editor-key");
    const selectedNode = scene.createNode("editor-selected-cube");
    const cube: TransformLike = { position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
    runtime.selection.set(["cube"]);
    await runtime.history.execute(new TransformCommand(cube, { position: { x: 1.35, y: 0.2, z: 0 }, scale: { x: 1, y: 1, z: 1 } }));
    selectedNode.transform.setPosition(cube.position.x - 0.65, cube.position.y, -3);
    scene.root.addChild(camera);
    scene.root.addChild(light);
    scene.root.addChild(selectedNode);
    scene.addRenderable(selectedNode, new Renderable({ geometry: "selected-cube", material: "selected-material" }));

    return {
      renderSource: {
        scene,
        geometryLibrary: { "selected-cube": Geometry.cube(1) },
        materialLibrary: { "selected-material": new UnlitMaterial({ color: [0.5, 0.93, 0.6, 1] }) },
      },
      metrics: { mode: runtime.mode, selected: runtime.selection.current().join(","), canUndo: runtime.history.canUndo, cameras: scene.collectCameras().length, lights: scene.collectLights().length, sceneRenderables: scene.collectRenderables().length, webgl2: true },
      dispose() {
        runtime.dispose();
      },
    };
  });
}
