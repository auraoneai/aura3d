import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, UnlitMaterial } from "/packages/rendering/src/index.ts";
import { rotationZQuat, simpleBounds, startSimpleGraphicsShowcase } from "/apps/wow-common/src/simple-showcase.ts";

const triangle = Geometry.triangle();
const material = new UnlitMaterial({ name: "simple-triangle-coral", color: [1, 0.24, 0.1, 1] });

void startSimpleGraphicsShowcase({
  appId: "wow-simple-triangle",
  title: "A3D Simple Triangle",
  subtitle: "Minimal graphics-library route: one Geometry.triangle, one UnlitMaterial, one Renderer frame loop, and no imported assets.",
  labels: {
    concept: "first draw",
    primitive: "Geometry.triangle",
    api: "Renderer + UnlitMaterial"
  },
  createFrame: (timeSeconds) => ({
    renderItems: [{
      label: "simple-triangle",
      geometry: triangle,
      material,
      modelMatrix: composeMat4([0, 0, 0], rotationZQuat(timeSeconds * 0.8), [1.15, 1.15, 1.15])
    }],
    bounds: simpleBounds(1.25),
    cameraFrameOptions: { paddingRatio: 0.26, yawRadians: 0, pitchRadians: 0 }
  })
});
