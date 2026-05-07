import { Renderable, Scene } from "@galileo3d/scene";
import { Geometry, MockRenderDevice, ShadowPass, UnlitMaterial } from "@galileo3d/rendering";
import { createExample, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "03-shadows",
  title: "03 Shadows",
  purpose: "Use public light and render item APIs in the shadow validation slot.",
  acceptance: "A cube, light direction, and contact shadow proxy are visible until public shadow passes are available.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const scene = new Scene();
    const camera = scene.createOrthographicCamera({ name: "shadow-camera", left: -2.2, right: 2.2, bottom: -1.25, top: 1.25, near: 0.1, far: 20 });
    const light = scene.createLight("directional", "key-light");
    light.castsShadow = true;
    light.intensity = 1.5;
    const casterNode = scene.createNode("shadow-caster");
    casterNode.transform.setPosition(0, 0.25, -3);
    const contactNode = scene.createNode("contact-shadow-proxy");
    contactNode.transform.setPosition(0.22, -0.72, -3.02);
    contactNode.transform.setScale(1.9, 0.18, 1);
    scene.root.addChild(camera);
    scene.root.addChild(light);
    scene.root.addChild(casterNode);
    scene.root.addChild(contactNode);
    scene.addRenderable(casterNode, new Renderable({ geometry: "cube", material: "caster" }));
    scene.addRenderable(contactNode, new Renderable({ geometry: "shadow-proxy", material: "shadow" }));
    const casterMaterial = new UnlitMaterial({ color: [0.66, 0.78, 1, 1] });
    const shadowCaster = { geometry: Geometry.cube(1), material: casterMaterial, label: "shadow-caster-depth" };
    const shadowDevice = new MockRenderDevice();
    shadowDevice.beginFrame(256, 256);
    const shadowResult = new ShadowPass({ light, casters: [shadowCaster] }).execute({ device: shadowDevice, width: 256, height: 256 });
    shadowDevice.endFrame();

    return {
      renderSource: {
        scene,
        geometryLibrary: {
          cube: Geometry.cube(1),
          "shadow-proxy": Geometry.cube(1),
        },
        materialLibrary: {
          caster: casterMaterial,
          shadow: new UnlitMaterial({ color: [0, 0, 0, 0.42], renderState: { blend: true, depthWrite: false, cullMode: "none" } }),
        },
      },
      metrics: { lights: scene.collectLights().length, cameras: scene.collectCameras().length, sceneRenderables: scene.collectRenderables().length, shadowPassPublicApi: true, shadowRendered: shadowResult.rendered, webgl2: true },
    };
  });
}
