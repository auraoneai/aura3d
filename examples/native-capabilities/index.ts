/**
 * Prototype examples: choose one scenario, provide an admitted typed model,
 * await mounting, then dispose the returned app when leaving the route.
 *
 * This file does not auto-mount or select an asset. See the accompanying
 * native-capability recipes for setup, evidence and current limitations.
 */
import {
  bindOrbitPointer,
  camera,
  createAuraApp,
  createOrbitRig,
  effects,
  geometry,
  interactions,
  lights,
  looks,
  material,
  model,
  primitives,
  raycastFirst,
  scene,
  text3D,
  type AuraApp,
  type AuraAppTarget,
  type AuraAssetRef,
  type SceneQueryHit
} from "@aura3d/engine";
import { createWorkerRendererWorker } from "@aura3d/engine/worker";
import { exportGLTF, type AuraExportResult, type AuraExportScene } from "@aura3d/assets/exporters";

/** Each entry describes a separately mounted scenario, not a support claim. */
export const NATIVE_CAPABILITY_SCENARIOS = [
  { id: "typed-model", purpose: "Admitted model, camera and app lifecycle" },
  { id: "custom-geometry", purpose: "Independently authored indexed geometry" },
  { id: "material-lighting", purpose: "Material response to an authored directional light" },
  { id: "custom-shader", purpose: "Root custom GLSL on an abstract object" },
  { id: "postprocess", purpose: "A root color-grade effect" },
  { id: "animation", purpose: "An inspected animation clip on the admitted model" },
  { id: "controls", purpose: "Orbit around a named model" },
  { id: "bounds-query", purpose: "A conservative scene-bounds ray query" },
  { id: "world-text", purpose: "Bounded uppercase extruded text" },
  { id: "physics", purpose: "A bound sphere body falling onto a static box" },
  { id: "worker-render", purpose: "The same typed scene rendered by a dedicated render worker" },
  { id: "interchange-export", purpose: "Export authored geometry and material to GLB with loss warnings" }
] as const;

export type NativeCapabilityScenarioId = (typeof NATIVE_CAPABILITY_SCENARIOS)[number]["id"];

export interface NativeCapabilityScenarioOptions {
  readonly target: AuraAppTarget;
  /** Obtain from the project's generated `src/aura-assets.ts`, never a URL. */
  readonly asset: AuraAssetRef<"model">;
  /** Required for animation; inspect this name on the selected asset first. */
  readonly animationClip?: string;
  /** Set false for a caller-controlled `app.step()` loop in a test harness. */
  readonly autoStart?: boolean;
  /** worker-render only: supply a custom worker; defaults to the packaged render worker. */
  readonly createWorker?: () => Worker;
}

/**
 * Mount exactly one scenario. The supplied model must have an admitted hash.
 * The caller owns the returned app and must call `app.dispose()`.
 */
export async function mountNativeCapabilityScenario(
  id: NativeCapabilityScenarioId,
  options: NativeCapabilityScenarioOptions
): Promise<AuraApp> {
  if (!NATIVE_CAPABILITY_SCENARIOS.some((scenario) => scenario.id === id)) {
    throw new Error(`Unknown native capability scenario: ${String(id)}`);
  }
  if (!/^sha256-[\da-f]{64}$/i.test(options.asset.hash ?? "")) {
    throw new Error("Supply a generated, hashed model asset from src/aura-assets.ts.");
  }
  if (id === "animation" && !options.animationClip?.trim()) {
    throw new Error("The animation scenario requires an inspected animationClip name.");
  }

  const subject = model(options.asset, { name: "subject", targetMaxDimension: 1.6 })
    .position(-1, 0.8, 0)
    .runtime({ id: "subject", mutable: true });
  const stage = scene()
    .add(looks.preset("product-studio"))
    .camera(camera.perspective({ position: [3.8, 2.8, 6], target: [0, 0.8, 0], fov: 42 }))
    .add(id === "animation" ? subject.animate({ clip: options.animationClip!, loop: true }) : subject)
    .add(primitives.plane({ name: "floor", size: [8, 1, 8], material: material.pbr({ color: "#535962", roughness: 0.9 }) }));

  if (id === "custom-geometry") {
    const triangle = geometry.define({
      positions: new Float32Array([-0.7, 0, 0, 0.7, 0, 0, 0, 1.4, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: [0, 1, 2],
      bounds: { min: [-0.7, 0, 0], max: [0.7, 1.4, 0] }
    });
    stage.add(geometry.custom(triangle, { name: "triangle", material: material.pbr({ color: "#d88a4a", roughness: 0.6 }) }).position(1, 0.05, 0));
  } else if (id === "material-lighting") {
    stage.add(lights.directional({ name: "sample-key", position: [4, 5, 3], target: [0, 0, 0], intensity: 2, shadow: true }));
    stage.add(primitives.sphere({ name: "material-sample", material: material.pbr({ color: "#b4c8d4", metallic: 0.7, roughness: 0.35 }) }).position(1, 0.8, 0));
  } else if (id === "custom-shader") {
    const shader = material.custom({
      glsl: { fragment: "out vec4 outColor; void main() { outColor = vec4(0.12, 0.56, 0.72, 1.0); }" }
    });
    stage.add(primitives.sphere({ name: "shader-sample", material: shader }).position(1, 0.8, 0));
  } else if (id === "postprocess") {
    stage.add(effects.colorGrade({ contrast: 1.12, saturation: 0.8 }));
  } else if (id === "controls") {
    stage.add(interactions.orbit({ target: "subject" }));
  } else if (id === "world-text") {
    stage.add(text3D("AURA3D", { name: "text-sample", size: 0.35, depth: 0.05, material: material.pbr({ color: "#e0ba71" }) }).position(0.1, 0.8, 0));
  } else if (id === "physics") {
    stage.add(primitives.box({ name: "physics-floor", size: [3, 0.2, 3], material: material.pbr({ color: "#73807f" }) })
      .position(1, 0.1, 0)
      .runtime({ id: "physics-floor" })
      .physics({ type: "static", shape: "box", halfExtents: [1.5, 0.1, 1.5] }));
    stage.add(primitives.sphere({ name: "physics-ball", size: 0.6, material: material.pbr({ color: "#db8e4a" }) })
      .position(1, 2, 0)
      .runtime({ id: "physics-ball" })
      .physics({ type: "dynamic", shape: "sphere", radius: 0.3, mass: 1, restitution: 0 }));
  }

  if (id === "interchange-export") {
    stage.add(geometry.custom(EXPORT_TRIANGLE, { name: "export-sample", material: material.pbr({ color: "#d88a4a", roughness: 0.6 }) }).position(1, 0.05, 0));
  }

  const app = createAuraApp(options.target, {
    ...looks.appOptions("product-studio"),
    scene: stage,
    autoStart: options.autoStart ?? true,
    // Worker apps report strict failures through readyStrict(); the strict
    // option itself is a main-thread renderer option.
    ...(id === "worker-render" ? {} : { strict: true }),
    ...(id === "physics" ? { physics: { bindNodes: true } } : {}),
    // No silent main-thread fallback: an unsupported worker is reported as an error.
    ...(id === "worker-render" ? { worker: { createWorker: options.createWorker ?? createWorkerRendererWorker, fallback: "error" as const } } : {})
  });
  if (id === "physics") {
    app.onFrame(({ dt }) => { app.physics.step(dt); });
  }
  if (id === "worker-render" && app.execution?.active !== "worker") {
    app.dispose();
    throw new Error(`The worker-render scenario requires worker execution; active: ${String(app.execution?.active)}.`);
  }
  if (id === "interchange-export") {
    // Export is independent of rendering; fail the scenario if it does not
    // produce a binary glTF rather than reporting a mounted-but-unexported app.
    const exported = exportNativeScenarioGlb();
    const bytes = exported.data instanceof Uint8Array ? exported.data : undefined;
    if (!bytes || exported.mimeType !== "model/gltf-binary" || new TextDecoder().decode(bytes.subarray(0, 4)) !== "glTF") {
      app.dispose();
      throw new Error("The interchange-export scenario did not produce a binary glTF.");
    }
  }
  try {
    await app.readyStrict();
    if (id === "controls") {
      if (!app.canvas || !app.camera) throw new Error("The controls scenario requires a canvas and camera controller.");
      const pose = app.camera.presented();
      const distance = Math.hypot(
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2]
      );
      const rig = createOrbitRig({ target: "subject", distance, fov: pose.fov });
      app.camera.use(rig);
      const unbind = bindOrbitPointer(app.canvas, rig);
      const disposeApp = app.dispose.bind(app);
      let controlsBound = true;
      app.dispose = () => {
        try {
          if (controlsBound) {
            unbind();
            controlsBound = false;
          }
        } finally {
          disposeApp();
        }
      };
    }
    return app;
  } catch (error) {
    app.dispose();
    throw error;
  }
}

/**
 * Query the sample's subject from the front. The current default query uses
 * scene bounds; it is not a promise of exact triangle or deformed-mesh hits.
 */
export function queryNativeScenarioBounds(app: AuraApp): SceneQueryHit | undefined {
  return raycastFirst(
    { origin: [-1, 0.8, 6], direction: [0, 0, -1] },
    { nodes: app.scene.nodes }
  );
}

const EXPORT_POSITIONS = new Float32Array([-0.7, 0, 0, 0.7, 0, 0, 0, 1.4, 0]);
const EXPORT_NORMALS = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
const EXPORT_TRIANGLE = geometry.define({
  positions: EXPORT_POSITIONS,
  normals: EXPORT_NORMALS,
  indices: [0, 1, 2],
  bounds: { min: [-0.7, 0, 0], max: [0.7, 1.4, 0] }
});

/**
 * Export the interchange-export scenario's authored triangle and material as
 * a binary glTF. The exporter returns structured warnings for anything it
 * could not represent; inspect them instead of assuming a lossless round trip.
 */
export function exportNativeScenarioGlb(): AuraExportResult {
  const exportScene: AuraExportScene = {
    roots: [0],
    nodes: [{ name: "export-sample", mesh: 0, translation: [1, 0.05, 0] }],
    meshes: [{ name: "export-sample", primitives: [{
      attributes: { POSITION: { values: EXPORT_POSITIONS, itemSize: 3 }, NORMAL: { values: EXPORT_NORMALS, itemSize: 3 } },
      indices: new Uint16Array([0, 1, 2]),
      mode: "triangles",
      material: 0
    }] }],
    materials: [{ name: "export-sample", baseColor: [0.69, 0.25, 0.06, 1], metallic: 0, roughness: 0.6 }],
    metersPerUnit: 1,
    upAxis: "Y"
  };
  return exportGLTF(exportScene, { binary: true });
}
