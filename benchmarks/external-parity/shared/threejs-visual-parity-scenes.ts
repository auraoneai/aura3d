export interface V4ThreeJsParityScene {
  readonly id: string;
  readonly title: string;
  readonly g3dWorkflow: "product-configurator" | "asset-viewer" | "material-studio" | "scene-showcase" | "interactive-scene";
  readonly threeScene: "product-gltf" | "asset-gltf" | "material-metals" | "material-transparent" | "gallery-scene" | "interactive-orbit";
  readonly visualIntent: readonly string[];
  readonly g3dSetupLines: number;
  readonly threeSetupLines: number;
  readonly requiredGaps: readonly string[];
}

export const V4_THREEJS_PARITY_SCENES: readonly V4ThreeJsParityScene[] = [
  {
    id: "product-configurator",
    title: "Premium Product Configurator",
    g3dWorkflow: "product-configurator",
    threeScene: "product-gltf",
    visualIntent: ["same BoomBox GLB", "front three-quarter camera", "studio lighting", "PBR material response"],
    g3dSetupLines: 15,
    threeSetupLines: 74,
    requiredGaps: ["Three.js scene uses manual GLTFLoader/camera/light setup; G3D uses a product workflow preset."]
  },
  {
    id: "asset-review",
    title: "glTF Asset Review",
    g3dWorkflow: "asset-viewer",
    threeScene: "asset-gltf",
    visualIntent: ["same BoomBox GLB", "asset framing", "neutral review lighting", "runtime draw-call report"],
    g3dSetupLines: 10,
    threeSetupLines: 68,
    requiredGaps: ["This does not prove every glTF extension or loader edge case against Three.js."]
  },
  {
    id: "material-metals",
    title: "Physical Material Metals",
    g3dWorkflow: "material-studio",
    threeScene: "material-metals",
    visualIntent: ["metallic sphere", "textured PBR sphere", "normal-mapped block", "studio lighting"],
    g3dSetupLines: 8,
    threeSetupLines: 58,
    requiredGaps: ["Texture fidelity uses procedural reference swatches rather than licensed scan textures."]
  },
  {
    id: "material-transparent",
    title: "Transparent Material Review",
    g3dWorkflow: "material-studio",
    threeScene: "material-transparent",
    visualIntent: ["transparent/transmissive material intent", "gallery lighting", "specular highlights", "comparison layout"],
    g3dSetupLines: 8,
    threeSetupLines: 62,
    requiredGaps: ["Transparent material parity remains bounded to this scene and does not cover all order-independent transparency cases."]
  },
  {
    id: "gallery-scene",
    title: "Interior Gallery Scene",
    g3dWorkflow: "scene-showcase",
    threeScene: "gallery-scene",
    visualIntent: ["multi-object gallery layout", "warm/cool lighting", "PBR surfaces", "camera framing"],
    g3dSetupLines: 7,
    threeSetupLines: 54,
    requiredGaps: ["Interior scene is a bounded product-quality comparison, not a full architectural renderer benchmark."]
  },
  {
    id: "interactive-orbit",
    title: "Interactive Orbit Scene",
    g3dWorkflow: "interactive-scene",
    threeScene: "interactive-orbit",
    visualIntent: ["fixed-time interaction state", "orbiting product objects", "PBR materials", "runtime stats"],
    g3dSetupLines: 7,
    threeSetupLines: 48,
    requiredGaps: ["This captures a fixed interaction state, not input latency or long-run interaction stability."]
  },
  {
    id: "large-scene-performance",
    title: "Large Scene Performance",
    g3dWorkflow: "scene-showcase",
    threeScene: "gallery-scene",
    visualIntent: ["multi-object scene scale", "bounded frame diagnostics", "draw-call comparison", "resource budget report"],
    g3dSetupLines: 9,
    threeSetupLines: 64,
    requiredGaps: ["Large-scene comparison is bounded to workflow-scale diagnostics and does not claim broad performance superiority."]
  }
];
