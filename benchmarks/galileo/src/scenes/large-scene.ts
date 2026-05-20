import { forEngine } from "../../../shared/scenes/descriptor.js";
import scene from "../../../shared/scenes/large-scene.js";

export default {
  ...forEngine(scene, "galileo"),
  optimizationEvidence: {
    lodSelection: "examples/rendering-large-scene/harness.ts selects high/medium/low generated mesh LODs by camera distance and projected screen size.",
    staticBatching: "examples/rendering-large-scene/harness.ts batches 5,000 logical static meshes into instanced static draw submissions before Renderer.render.",
    stableCameraTiming: "tests/browser/rendering-large-scene.spec.ts verifies repeated camera positions through the WebGL2 Renderer path with bounded timing jitter."
  }
};
