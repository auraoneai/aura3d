import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, UnlitMaterial } from "/packages/rendering/src/index.ts";
import { rotationZQuat, simpleBounds, startSimpleGraphicsShowcase } from "/apps/wow-common/src/simple-showcase.ts";

const points = Geometry.points([
  [-0.78, -0.5, 0],
  [-0.35, 0.42, 0],
  [0.18, -0.16, 0],
  [0.58, 0.5, 0],
  [0.82, -0.42, 0]
]);
const lines = Geometry.lineSegments([
  [-0.78, -0.5, 0], [-0.35, 0.42, 0],
  [-0.35, 0.42, 0], [0.18, -0.16, 0],
  [0.18, -0.16, 0], [0.58, 0.5, 0],
  [0.58, 0.5, 0], [0.82, -0.42, 0]
]);
const pointMaterial = new UnlitMaterial({ name: "simple-round-points", color: [0.2, 0.9, 1, 1], pointSize: 16, roundPoints: true });
const lineMaterial = new UnlitMaterial({ name: "simple-lines", color: [1, 0.8, 0.18, 1] });

void startSimpleGraphicsShowcase({
  appId: "wow-simple-points-lines",
  title: "A3D Simple Points And Lines",
  subtitle: "Lightweight route for point and line primitives with unlit materials, round point sprites, and a tiny animated transform.",
  labels: {
    concept: "debug primitives",
    primitive: "Geometry.points + lineSegments",
    api: "UnlitMaterial point size"
  },
  createFrame: (timeSeconds) => ({
    renderItems: [
      {
        label: "simple-line-strip",
        geometry: lines,
        material: lineMaterial,
        modelMatrix: composeMat4([0, 0, 0], rotationZQuat(Math.sin(timeSeconds) * 0.12), [1.15, 1.15, 1.15])
      },
      {
        label: "simple-points",
        geometry: points,
        material: pointMaterial,
        modelMatrix: composeMat4([0, 0, 0.02], rotationZQuat(Math.sin(timeSeconds) * 0.12), [1.15, 1.15, 1.15])
      }
    ],
    bounds: simpleBounds(1.35),
    cameraFrameOptions: { paddingRatio: 0.28, yawRadians: 0, pitchRadians: 0 }
  })
});
