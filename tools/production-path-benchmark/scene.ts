/**
 * The one scene definition both engines build, shared so neither can quietly get an easier one.
 *
 * WS-1.4 replaces a benchmark that drew a 3-vertex triangle through a raw WebGL2 context and
 * reported the result as an engine comparison. The single most important property here is that the
 * content is *identical* and *declared once*: object count, grid layout, colours, camera, light rig
 * and canvas size all come from this file, so a difference in the measurement is a difference in the
 * engines rather than a difference in what they were asked to draw.
 */
export interface BenchmarkSceneObject {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  /** sRGB hex, applied identically as a PBR base colour in both engines. */
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
}

export interface BenchmarkSceneDefinition {
  readonly id: string;
  readonly label: string;
  readonly canvas: { readonly width: number; readonly height: number };
  /** Pinned to 1 so an adaptive device pixel ratio cannot change the pixel count between engines. */
  readonly pixelRatio: 1;
  readonly background: string;
  readonly camera: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly fovYDegrees: number;
    readonly near: number;
    readonly far: number;
  };
  readonly directionalLight: {
    readonly position: readonly [number, number, number];
    readonly intensity: number;
    readonly color: string;
  };
  readonly ambientIntensity: number;
  readonly objects: readonly BenchmarkSceneObject[];
  /** Frames rendered before any timing is recorded, so shader compilation is excluded. */
  readonly warmupFrames: number;
  /** Frames measured for the steady-state distribution. */
  readonly measuredFrames: number;
}

const PALETTE = ["#c8d3e0", "#8fb4d9", "#d9b48f", "#8fd9a8", "#d98fb4", "#b48fd9"] as const;

function grid(columns: number, rows: number, layers: number): readonly BenchmarkSceneObject[] {
  const objects: BenchmarkSceneObject[] = [];
  let index = 0;
  for (let layer = 0; layer < layers; layer += 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        objects.push({
          x: (column - (columns - 1) / 2) * 1.35,
          y: (row - (rows - 1) / 2) * 1.35,
          z: (layer - (layers - 1) / 2) * 1.35,
          scale: 0.5,
          color: PALETTE[index % PALETTE.length],
          // Deterministic, not random: a seeded RNG would still have to match across two runtimes.
          roughness: 0.25 + ((index % 5) / 5) * 0.6,
          metalness: index % 3 === 0 ? 0.85 : 0.05
        });
        index += 1;
      }
    }
  }
  return objects;
}

/**
 * 512 lit PBR boxes. Chosen to be large enough that per-object CPU submission dominates and the
 * measurement says something about the renderer, and small enough to complete inside a CI budget on
 * a headless GPU.
 */
export const PRODUCTION_PATH_BENCHMARK_SCENE: BenchmarkSceneDefinition = {
  id: "lit-pbr-box-grid-512",
  label: "512 lit PBR boxes, one directional light, identical camera",
  canvas: { width: 960, height: 600 },
  pixelRatio: 1,
  background: "#070b12",
  camera: {
    position: [14, 11, 18],
    target: [0, 0, 0],
    fovYDegrees: 45,
    near: 0.1,
    far: 200
  },
  directionalLight: {
    position: [8, 14, 10],
    intensity: 2.6,
    color: "#fff4e6"
  },
  ambientIntensity: 0.35,
  objects: grid(8, 8, 8),
  warmupFrames: 60,
  measuredFrames: 180
};
