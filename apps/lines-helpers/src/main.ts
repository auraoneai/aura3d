import { composeMat4 } from "/packages/scene/src/index.ts";
import { Geometry, ScreenSpaceLineMaterial } from "/packages/rendering/src/index.ts";
import { rotationYQuat, simpleBounds, startSimpleGraphicsShowcase } from "/apps/wow-common/src/simple-showcase.ts";

/**
 * Screen-space fat lines.
 *
 * Every stroke here is expanded in *pixel* space by the vertex shader, so widths stay
 * constant as the camera orbits and the scene animates. That is the behaviour a
 * world-space triangle quad cannot provide, because a world-space offset shrinks under
 * perspective.
 */

const RESOLUTION: readonly [number, number] = [1280, 720];

/** A closed square outline, so joins between segments are visible. */
function squareOutline(size: number, z: number) {
  const half = size / 2;
  const corners: readonly (readonly [number, number, number])[] = [
    [-half, -half, z], [half, -half, z], [half, half, z], [-half, half, z]
  ];
  return corners.map((start, index) => ({ start, end: corners[(index + 1) % corners.length]! }));
}

const thinOutline = Geometry.screenSpaceLineSegments(squareOutline(1.1, 0));
const thickOutline = Geometry.screenSpaceLineSegments(squareOutline(1.7, -0.35));
// A long diagonal run, so the dash pattern has room to repeat.
const dashedRun = Geometry.screenSpaceLineSegments([
  { start: [-1.5, -1.25, 0.3], end: [1.5, 1.25, 0.3] }
]);

const thinMaterial = new ScreenSpaceLineMaterial({
  name: "lines-helpers-thin", color: [0.35, 0.95, 1, 1], width: 2, resolution: RESOLUTION, cap: "butt"
});
const thickMaterial = new ScreenSpaceLineMaterial({
  name: "lines-helpers-thick", color: [1, 0.72, 0.2, 1], width: 9, resolution: RESOLUTION, cap: "round"
});
const dashedMaterial = new ScreenSpaceLineMaterial({
  name: "lines-helpers-dashed", color: [0.75, 0.95, 0.5, 1], width: 5, resolution: RESOLUTION, cap: "square",
  dashSize: 0.22, gapSize: 0.14
});

void startSimpleGraphicsShowcase({
  appId: "lines-helpers",
  title: "A3D Screen-Space Fat Lines",
  subtitle: "Pixel-width strokes that stay a constant thickness while the camera orbits, with round/square caps and world-unit dashes.",
  labels: {
    concept: "screen-space fat lines",
    primitive: "Geometry.screenSpaceLineSegments",
    api: "ScreenSpaceLineMaterial width in pixels"
  },
  createFrame: (timeSeconds) => {
    // Orbit so the strokes are seen at many angles and depths within one route.
    const spin = rotationYQuat(timeSeconds * 0.35);
    return {
      renderItems: [
        { label: "lines-helpers-thick-outline", geometry: thickOutline, material: thickMaterial, modelMatrix: composeMat4([0, 0, 0], spin, [1, 1, 1]) },
        { label: "lines-helpers-thin-outline", geometry: thinOutline, material: thinMaterial, modelMatrix: composeMat4([0, 0, 0], spin, [1, 1, 1]) },
        { label: "lines-helpers-dashed-run", geometry: dashedRun, material: dashedMaterial, modelMatrix: composeMat4([0, 0, 0], spin, [1, 1, 1]) }
      ],
      // Tight bounds around the widest stroke run keep the strokes large in frame; a
      // generous radius would frame mostly empty space.
      bounds: simpleBounds(1.6),
      cameraFrameOptions: { paddingRatio: 0.12, yawRadians: 0.35, pitchRadians: 0.22 }
    };
  }
});
