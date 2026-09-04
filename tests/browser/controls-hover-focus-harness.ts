import { ControlVector3, HoverOutline, Picking, frameSelection, type ControlObject3DLike } from "@aura3d/controls";
import {
  Geometry,
  Renderer,
  ScreenSpaceLineMaterial,
  UnlitMaterial,
  type RenderItem
} from "@aura3d/rendering";

/**
 * PART F browser proof: hover outline + focus framing (controls surface).
 *
 * Renders two cubes through the real WebGL2 renderer, picks the right cube
 * with the controls `Picking` layer, submits the resulting `HoverOutline`
 * entry as screen-space outline geometry, and asserts the outline changes
 * rendered pixels. Then applies `frameSelection` to the picked cube and
 * asserts the reframed render centers it. Decision logic lives in
 * `@aura3d/controls`; pixels come from `@aura3d/rendering`.
 */

interface HoverFocusEvidence {
  readonly hoverTone: string;
  readonly hoverEntries: number;
  readonly changedPlainToHover: number;
  readonly hoverBlueFraction: number;
  readonly changedHoverToSelected: number;
  readonly focusDistance: number;
  readonly focusExpected: number;
  readonly focusCentroidX: number;
  readonly focusCentroidY: number;
  readonly focusStrayPixels: number;
  readonly pass: boolean;
}

declare global {
  interface Window {
    __AURA3D_HOVER_FOCUS__?: HoverFocusEvidence;
    __AURA3D_HOVER_FOCUS_ERROR__?: string;
  }
}

const SIZE = 256;
const FOV = 45;
const LEFT: readonly [number, number, number] = [-1.4, 0, -5];
const RIGHT: readonly [number, number, number] = [1.4, 0, -5];
const CUBE = 0.6;

void run().catch((error: unknown) => {
  window.__AURA3D_HOVER_FOCUS_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.display = "none";
  document.body.append(canvas);
  const renderer = await Renderer.create({
    canvas,
    width: SIZE,
    height: SIZE,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.02, 0.03, 0.05, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback"],
    errorCheckMode: "strict"
  });

  try {
    const wide = viewProjection(FOV, 1, [0, 0, 0]);
    const plain = renderScene(renderer, wide, []);
    showCanvas("plain", plain);

    // Pick the right cube exactly the way a viewport would: a pointer ray
    // from the camera through the right cube center.
    const left: ControlObject3DLike = {
      type: "Mesh",
      name: "left-cube",
      position: new ControlVector3(LEFT[0], LEFT[1], LEFT[2]),
      scale: new ControlVector3(1, 1, 1),
      picking: { id: "left-cube", label: "Left cube", pickRadius: 0.55 }
    };
    const right: ControlObject3DLike = {
      type: "Mesh",
      name: "right-cube",
      position: new ControlVector3(RIGHT[0], RIGHT[1], RIGHT[2]),
      scale: new ControlVector3(1, 1, 1),
      picking: { id: "right-cube", label: "Right cube", pickRadius: 0.55 }
    };
    const scene: ControlObject3DLike = {
      type: "Scene",
      name: "root",
      position: new ControlVector3(),
      children: [left, right]
    };
    const toRight = normalize([RIGHT[0], RIGHT[1], RIGHT[2]]);
    const hit = new Picking().report(
      scene,
      new ControlVector3(0, 0, 0),
      new ControlVector3(toRight[0], toRight[1], toRight[2])
    ).hit;
    if (hit?.object !== right) throw new Error("Picking missed the right cube.");

    const outline = new HoverOutline();
    outline.setHovered(hit.object);
    const hoverEntries = outline.entries();
    if (hoverEntries.length !== 1 || hoverEntries[0]?.tone !== "hover") {
      throw new Error("HoverOutline did not report a single hover entry.");
    }
    const hoverStyle = hoverEntries[0].style;
    const hovered = renderScene(renderer, wide, [outlineBox(RIGHT, CUBE / 2 + 0.12, hoverStyle.color, 4, wide)]);
    showCanvas("hover outline", hovered);
    const changedPlainToHover = countChanged(plain, hovered);
    const hoverBlueFraction = blueFraction(plain, hovered);

    outline.setSelected([right]);
    const selectedEntries = outline.entries();
    if (selectedEntries[0]?.tone !== "hover-selected") throw new Error("HoverOutline missed the hover-selected tone.");
    const selectedStyle = selectedEntries[0].style;
    const selected = renderScene(renderer, wide, [outlineBox(RIGHT, CUBE / 2 + 0.12, selectedStyle.color, 5, wide)]);
    showCanvas("selected outline", selected);
    const changedHoverToSelected = countChanged(hovered, selected);

    // Focus framing: the framed cube must land centered; the other cube
    // leaves the frame.
    const framed = frameSelection([right], { fovDegrees: FOV, margin: 1.25 });
    if (!framed) throw new Error("frameSelection returned no result.");
    const focusExpected = (0.55 * 1.25) / Math.tan(((FOV * Math.PI) / 180) / 2);
    const eye: readonly [number, number, number] = [framed.target.x, framed.target.y, framed.target.z + framed.distance];
    const focusedVp = viewProjection(FOV, 1, eye);
    const focused = renderScene(renderer, focusedVp, []);
    showCanvas("focus frame", focused);
    const centroid = brightCentroid(focused);
    const stray = countBrightInRegion(focused, 0, 0, Math.floor(SIZE * 0.2), SIZE);

    const evidence: HoverFocusEvidence = {
      hoverTone: hoverEntries[0]?.tone ?? "none",
      hoverEntries: hoverEntries.length,
      changedPlainToHover,
      hoverBlueFraction: Number(hoverBlueFraction.toFixed(4)),
      changedHoverToSelected,
      focusDistance: Number(framed.distance.toFixed(6)),
      focusExpected: Number(focusExpected.toFixed(6)),
      focusCentroidX: Number(centroid.x.toFixed(2)),
      focusCentroidY: Number(centroid.y.toFixed(2)),
      focusStrayPixels: stray,
      pass: hoverEntries[0]?.tone === "hover"
        && changedPlainToHover > 150
        && hoverBlueFraction > 0.5
        && changedHoverToSelected > 40
        && Math.abs(framed.distance - focusExpected) < 1e-6
        && Math.abs(centroid.x - SIZE / 2) < SIZE * 0.08
        && Math.abs(centroid.y - SIZE / 2) < SIZE * 0.08
        && stray === 0
    };
    window.__AURA3D_HOVER_FOCUS__ = evidence;
  } finally {
    renderer.dispose();
    canvas.remove();
  }
}

function cubeItem(center: readonly [number, number, number], size: number, vp: Float32Array): RenderItem {
  return {
    label: `cube-${center[0]}`,
    geometry: Geometry.cube(size),
    material: new UnlitMaterial({ color: [0.42, 0.45, 0.52, 1] }),
    modelViewProjectionMatrix: multiply4(vp, translation(center))
  };
}

function outlineBox(
  center: readonly [number, number, number],
  half: number,
  color: readonly [number, number, number, number],
  width: number,
  vp: Float32Array
): RenderItem {
  const [cx, cy, cz] = center;
  const corners: Record<string, readonly [number, number, number]> = {
    nnn: [cx - half, cy - half, cz - half],
    pnn: [cx + half, cy - half, cz - half],
    ppn: [cx + half, cy + half, cz - half],
    npn: [cx - half, cy + half, cz - half],
    nnz: [cx - half, cy - half, cz + half],
    pnz: [cx + half, cy - half, cz + half],
    ppz: [cx + half, cy + half, cz + half],
    npz: [cx - half, cy + half, cz + half]
  };
  const edges: Array<readonly [keyof typeof corners, keyof typeof corners]> = [
    ["nnn", "pnn"], ["pnn", "ppn"], ["ppn", "npn"], ["npn", "nnn"],
    ["nnz", "pnz"], ["pnz", "ppz"], ["ppz", "npz"], ["npz", "nnz"],
    ["nnn", "nnz"], ["pnn", "pnz"], ["ppn", "ppz"], ["npn", "npz"]
  ];
  return {
    label: "hover-outline",
    geometry: Geometry.screenSpaceLineSegments(
      edges.map(([from, to]) => ({ start: corners[from], end: corners[to] }))
    ),
    material: new ScreenSpaceLineMaterial({ color, width, resolution: [SIZE, SIZE], pixelRatio: 1 }),
    modelViewProjectionMatrix: vp
  };
}

function renderScene(renderer: Awaited<ReturnType<typeof Renderer.create>>, vp: Float32Array, extra: readonly RenderItem[]): Uint8Array {
  renderer.render({
    renderItems: [cubeItem(LEFT, CUBE, vp), cubeItem(RIGHT, CUBE, vp), ...extra],
    cameraPolicy: "identity"
  });
  return renderer.device.readPixels(0, 0, SIZE, SIZE);
}

function viewProjection(fovDegrees: number, aspect: number, eye: readonly [number, number, number]): Float32Array {
  const fov = (fovDegrees * Math.PI) / 180;
  const near = 0.1;
  const far = 100;
  const f = 1 / Math.tan(fov / 2);
  const projection = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ]);
  return multiply4(projection, translation([-eye[0], -eye[1], -eye[2]]));
}

function translation(offset: readonly [number, number, number]): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    offset[0], offset[1], offset[2], 1
  ]);
}

function multiply4(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        (left[row] ?? 0) * (right[column * 4] ?? 0)
        + (left[4 + row] ?? 0) * (right[column * 4 + 1] ?? 0)
        + (left[8 + row] ?? 0) * (right[column * 4 + 2] ?? 0)
        + (left[12 + row] ?? 0) * (right[column * 4 + 3] ?? 0);
    }
  }
  return out;
}

function normalize(v: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function countChanged(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < a.length; index += 4) {
    const delta = Math.abs((a[index] ?? 0) - (b[index] ?? 0))
      + Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0))
      + Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0));
    if (delta > 30) count += 1;
  }
  return count;
}

function blueFraction(a: Uint8Array, b: Uint8Array): number {
  let changed = 0;
  let blue = 0;
  for (let index = 0; index < a.length; index += 4) {
    const delta = Math.abs((a[index] ?? 0) - (b[index] ?? 0))
      + Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0))
      + Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0));
    if (delta <= 30) continue;
    changed += 1;
    if ((b[index + 2] ?? 0) > (b[index] ?? 0) + 20) blue += 1;
  }
  return changed === 0 ? 0 : blue / changed;
}

function brightCentroid(pixels: Uint8Array): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = (y * SIZE + x) * 4;
      if ((pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0) <= 120) continue;
      sumX += x;
      // readPixels origin is bottom-left; report in top-left image space.
      sumY += SIZE - 1 - y;
      count += 1;
    }
  }
  return count === 0 ? { x: -1, y: -1 } : { x: sumX / count, y: sumY / count };
}

function countBrightInRegion(pixels: Uint8Array, x0: number, y0: number, x1: number, y1: number): number {
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const row = SIZE - 1 - y;
      const index = (row * SIZE + x) * 4;
      if ((pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0) > 120) count += 1;
    }
  }
  return count;
}

function showCanvas(label: string, pixels: Uint8Array): void {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:inline-block;margin:8px;text-align:center;vertical-align:top";
  const view = document.createElement("canvas");
  view.width = SIZE;
  view.height = SIZE;
  view.style.cssText = "width:200px;height:200px;border:1px solid #22405c;display:block";
  const context = view.getContext("2d");
  if (context) {
    const image = context.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      const sourceRow = (SIZE - 1 - y) * SIZE * 4;
      const targetRow = y * SIZE * 4;
      for (let x = 0; x < SIZE * 4; x += 1) image.data[targetRow + x] = pixels[sourceRow + x] ?? 0;
    }
    context.putImageData(image, 0, 0);
  }
  const text = document.createElement("div");
  text.textContent = label;
  text.style.cssText = "font:10px ui-monospace,monospace;color:#8fb6d6;padding-top:4px";
  wrapper.append(view, text);
  document.getElementById("hover-focus-root")?.append(wrapper);
}
