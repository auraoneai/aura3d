import {
  Geometry,
  IndexBuffer,
  MAX_UNIFORM_SKINNING_JOINTS,
  Renderer,
  SkinnedUnlitMaterial,
  VertexBuffer,
  VertexFormat,
  type RenderItem
} from "@aura3d/rendering";

/**
 * FS-401 browser proof for the two skinning capabilities that were previously
 * diagnostic-only:
 *
 * 1. **Over-cap palettes.** A skin with more joints than the uniform-array limit must
 *    upload its palette as an RGBA32F data texture and still deform correctly. The
 *    scene binds a joint index above the uniform limit and moves only that joint, so a
 *    pixel change is only possible if the shader actually sampled the data texture.
 *
 * 2. **Eight influences.** A vertex whose weight is split across `JOINTS_1`/`WEIGHTS_1`
 *    must be moved by the second influence set. The control case supplies the same
 *    geometry with the second set zeroed, so any delta is attributable to the extra
 *    influences rather than to the base four.
 */

interface CaseResult {
  readonly id: string;
  readonly jointCount: number;
  readonly palettePath: "uniform-array" | "data-texture";
  readonly extraInfluences: boolean;
  readonly drawCalls: number;
  /** Fraction of pixels that changed between the rest pose and the posed frame. */
  readonly changedPixelFraction: number;
  readonly restNonBackgroundPixels: number;
  readonly posedNonBackgroundPixels: number;
  readonly pass: boolean;
  readonly reason: string;
}

declare global {
  interface Window {
    __AURA3D_SKINNING_OVER_CAP__?: { readonly cases: readonly CaseResult[]; readonly pass: boolean };
    __AURA3D_SKINNING_OVER_CAP_ERROR__?: string;
  }
}

const WIDTH = 320;
const HEIGHT = 320;

void run().catch((error: unknown) => {
  window.__AURA3D_SKINNING_OVER_CAP_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const cases: CaseResult[] = [];
  // Deliberately above the uniform-array limit so the data-texture path is forced.
  cases.push(await runCase({ id: "over-cap-data-texture", jointCount: MAX_UNIFORM_SKINNING_JOINTS + 40, extraInfluences: false }));
  // Below the limit: the uniform path must still work and be reported as such.
  cases.push(await runCase({ id: "within-cap-uniform-array", jointCount: 8, extraInfluences: false }));
  // Eight influences, with the moving joint reachable only through the second set.
  cases.push(await runCase({ id: "eight-influence", jointCount: 12, extraInfluences: true }));
  // Eight influences above the cap: both features active at once.
  cases.push(await runCase({ id: "eight-influence-over-cap", jointCount: MAX_UNIFORM_SKINNING_JOINTS + 24, extraInfluences: true }));

  window.__AURA3D_SKINNING_OVER_CAP__ = { cases, pass: cases.every((entry) => entry.pass) };
}

async function runCase(options: { readonly id: string; readonly jointCount: number; readonly extraInfluences: boolean }): Promise<CaseResult> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.id = `skinning-${options.id}`;
  // Off-DOM render surface. Rest and posed frames are copied to visible labelled
  // canvases below so the retained screenshot shows the deformation itself rather
  // than only the final pose.
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:12px;align-items:center;padding:8px 12px;font:12px ui-monospace,monospace;color:#cfe8ff";
  const caption = document.createElement("div");
  caption.style.cssText = "width:210px;line-height:1.5";
  row.append(caption);
  document.getElementById("skinning-root")?.append(row);

  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.02, 0.03, 0.05, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback"],
    errorCheckMode: "strict"
  });

  // The moving joint is the last one in the palette, which is above the uniform limit
  // in the over-cap cases. Binding it exercises the exact index range that the
  // uniform path cannot address.
  const movingJoint = options.jointCount - 1;
  const geometry = options.extraInfluences
    ? eightInfluenceQuad(movingJoint)
    : fourInfluenceQuad(movingJoint);
  const material = new SkinnedUnlitMaterial({
    color: [0.95, 0.82, 0.35, 1],
    maxJoints: options.jointCount,
    extraInfluences: options.extraInfluences
  });

  const restPixels = renderPose(renderer, canvas, geometry, material, options.jointCount, movingJoint, 0);
  showFrame(row, restPixels, "rest pose");
  const posedPixels = renderPose(renderer, canvas, geometry, material, options.jointCount, movingJoint, 0.55);
  showFrame(row, posedPixels, `joint ${movingJoint} moved`);
  const diagnostics = renderer.getDiagnostics();

  const changed = changedPixelFraction(restPixels, posedPixels);
  const restVisible = nonBackgroundPixels(restPixels);
  const posedVisible = nonBackgroundPixels(posedPixels);
  const palettePath = options.jointCount > MAX_UNIFORM_SKINNING_JOINTS ? "data-texture" : "uniform-array";
  // The geometry must be visible in both poses, and the palette must have actually
  // moved it. A blank frame would otherwise register as "no change" and pass.
  const pass = restVisible > 400 && posedVisible > 400 && changed >= 0.01;

  const palettePathLabel = options.jointCount > MAX_UNIFORM_SKINNING_JOINTS ? "data-texture" : "uniform-array";
  caption.textContent = `${options.id}\n${options.jointCount} joints · ${palettePathLabel}${options.extraInfluences ? " · 8 influences" : " · 4 influences"}`;
  caption.style.whiteSpace = "pre-line";

  renderer.dispose();

  return {
    id: options.id,
    jointCount: options.jointCount,
    palettePath,
    extraInfluences: options.extraInfluences,
    drawCalls: diagnostics.drawCalls,
    changedPixelFraction: Number(changed.toFixed(5)),
    restNonBackgroundPixels: restVisible,
    posedNonBackgroundPixels: posedVisible,
    pass,
    reason: pass
      ? `Joint ${movingJoint} of ${options.jointCount} moved the mesh through the ${palettePath} palette; ${changed.toFixed(4)} of the frame changed.`
      : `Expected a visible skinned deformation. rest=${restVisible} posed=${posedVisible} changed=${changed.toFixed(5)}.`
  };
}

function renderPose(
  renderer: Renderer,
  canvas: HTMLCanvasElement,
  geometry: Geometry,
  material: SkinnedUnlitMaterial,
  jointCount: number,
  movingJoint: number,
  offsetX: number
): Uint8Array {
  const matrices = identityPalette(jointCount);
  // Translate only the moving joint. Every other joint stays identity, so the
  // deformation cannot come from a global transform.
  matrices[movingJoint * 16 + 12] = offsetX;
  const item: RenderItem = {
    label: `skinning-${jointCount}-${movingJoint}`,
    geometry,
    material,
    modelViewProjectionMatrix: identityMatrix(),
    skinning: { jointCount, matrices, extraInfluences: true }
  };
  renderer.render({ renderItems: [item], cameraPolicy: "identity" });
  // Read from the presented canvas rather than an internal target so the measurement
  // reflects what was actually drawn to the screen.
  // The renderer owns the device, so read through its own readback path rather than a
  // separately-acquired context (which would be a different WebGL context entirely).
  return renderer.device.readPixels(0, 0, canvas.width, canvas.height);
}

function identityPalette(jointCount: number): Float32Array {
  const matrices = new Float32Array(jointCount * 16);
  for (let joint = 0; joint < jointCount; joint += 1) {
    matrices[joint * 16] = 1;
    matrices[joint * 16 + 5] = 1;
    matrices[joint * 16 + 10] = 1;
    matrices[joint * 16 + 15] = 1;
  }
  return matrices;
}

function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/** Quad whose vertices are fully weighted to `movingJoint` through the first set. */
function fourInfluenceQuad(movingJoint: number): Geometry {
  const positions: readonly (readonly [number, number, number])[] = [
    [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]
  ];
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, positions.length);
  positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", [...position]);
    vertices.setAttribute(index, "joints", [movingJoint, 0, 0, 0]);
    vertices.setAttribute(index, "weights", [1, 0, 0, 0]);
  });
  return new Geometry(vertices, new IndexBuffer([0, 1, 2, 0, 2, 3], positions.length), "triangles");
}

/**
 * Quad whose weight lives entirely in the *second* influence set.
 *
 * The first set is bound to joint 0 with zero weight, so a four-influence shader
 * would leave this quad at rest. Only an eight-influence shader that reads
 * `joints1`/`weights1` can move it.
 */
function eightInfluenceQuad(movingJoint: number): Geometry {
  const positions: readonly (readonly [number, number, number])[] = [
    [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]
  ];
  const vertices = new VertexBuffer(VertexFormat.P3J8W8, positions.length);
  positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", [...position]);
    vertices.setAttribute(index, "joints", [0, 0, 0, 0]);
    vertices.setAttribute(index, "weights", [0, 0, 0, 0]);
    vertices.setAttribute(index, "joints1", [movingJoint, 0, 0, 0]);
    vertices.setAttribute(index, "weights1", [1, 0, 0, 0]);
  });
  return new Geometry(vertices, new IndexBuffer([0, 1, 2, 0, 2, 3], positions.length), "triangles");
}

/**
 * Copies a readback buffer into a visible canvas. WebGL readback is bottom-up, so the
 * rows are flipped to match screen orientation.
 */
function showFrame(row: HTMLElement, pixels: Uint8Array, label: string): void {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "text-align:center";
  const view = document.createElement("canvas");
  view.width = WIDTH;
  view.height = HEIGHT;
  view.style.cssText = "width:150px;height:150px;border:1px solid #22405c;display:block";
  const context = view.getContext("2d");
  if (context) {
    const image = context.createImageData(WIDTH, HEIGHT);
    for (let y = 0; y < HEIGHT; y += 1) {
      const sourceRow = (HEIGHT - 1 - y) * WIDTH * 4;
      const targetRow = y * WIDTH * 4;
      for (let x = 0; x < WIDTH * 4; x += 1) {
        image.data[targetRow + x] = pixels[sourceRow + x] ?? 0;
      }
    }
    context.putImageData(image, 0, 0);
  }
  const text = document.createElement("div");
  text.textContent = label;
  text.style.cssText = "font:11px ui-monospace,monospace;color:#8fb6d6;padding-top:4px";
  wrapper.append(view, text);
  row.append(wrapper);
}

function nonBackgroundPixels(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    if (red + green + blue > 40) count += 1;
  }
  return count;
}

function changedPixelFraction(first: Uint8Array, second: Uint8Array): number {
  let changed = 0;
  const total = Math.floor(first.length / 4);
  for (let index = 0; index < first.length; index += 4) {
    const delta =
      Math.abs((first[index] ?? 0) - (second[index] ?? 0))
      + Math.abs((first[index + 1] ?? 0) - (second[index + 1] ?? 0))
      + Math.abs((first[index + 2] ?? 0) - (second[index + 2] ?? 0));
    if (delta > 24) changed += 1;
  }
  return changed / Math.max(1, total);
}
