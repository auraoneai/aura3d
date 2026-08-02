import { TransformControls, ControlVector3, type TransformControlHandleGeometry } from "@aura3d/controls";
import {
  Geometry,
  Renderer,
  ScreenSpaceLineMaterial,
  UnlitMaterial,
  type RenderItem
} from "@aura3d/rendering";

/**
 * FS-403 browser proof for interactive transform controls.
 *
 * Renders the gizmo's own handle geometry through the Aura3D renderer, then drives a
 * full pointer gesture (down, move, up) against it and reports both the rendered pixels
 * and the resulting object transform. The pixels prove the gizmo is a real rendered
 * object rather than a data structure; the transform proves the gesture is wired to it.
 *
 * Gizmo handles are drawn with the screen-space line material so arms stay legible at
 * any camera distance, which is how editor gizmos are expected to behave.
 */

interface Capture {
  readonly id: string;
  readonly label: string;
  readonly handleCount: number;
  readonly strokePixels: number;
  readonly colorBuckets: number;
}

interface DragProof {
  readonly mode: string;
  readonly pickedHandle: string | undefined;
  readonly startPosition: readonly [number, number, number];
  readonly endPosition: readonly [number, number, number];
  readonly startScale: readonly [number, number, number];
  readonly endScale: readonly [number, number, number];
  readonly startRotation: readonly [number, number, number];
  readonly endRotation: readonly [number, number, number];
  readonly totalDelta: number;
  readonly constrainedToAxis: boolean;
}

interface GizmoEvidence {
  readonly captures: readonly Capture[];
  readonly translateDrag: DragProof;
  readonly rotateDrag: DragProof;
  readonly scaleDrag: DragProof;
  readonly snappedDrag: { readonly requestedRaw: number; readonly committed: number; readonly snapIncrement: number };
  readonly missedPointerFallsThrough: boolean;
  readonly localSpaceDiffersFromWorld: boolean;
  readonly pass: boolean;
}

declare global {
  interface Window {
    __AURA3D_GIZMO__?: GizmoEvidence;
    __AURA3D_GIZMO_ERROR__?: string;
  }
}

const SIZE = 360;

void run().catch((error: unknown) => {
  window.__AURA3D_GIZMO_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const captures: Capture[] = [];
  for (const mode of ["translate", "rotate", "scale"] as const) {
    captures.push(await renderGizmo(mode));
  }

  const translateDrag = driveDrag("translate");
  const rotateDrag = driveDrag("rotate");
  const scaleDrag = driveDrag("scale");
  const snappedDrag = driveSnappedDrag();

  // A pointer that misses every handle must not start a drag, so a viewport can use
  // the event for scene selection instead.
  const missing = new TransformControls({ mode: "translate", size: 1, pickTolerance: 0.1 });
  missing.attach(makeTarget());
  missing.place([0, 0, 0]);
  const missedPointerFallsThrough = missing.pointerDown({ origin: new ControlVector3(9, 9, 5), direction: new ControlVector3(0, 0, -1) }) === false;

  const localSpaceDiffersFromWorld = compareSpaces();

  window.__AURA3D_GIZMO__ = {
    captures,
    translateDrag,
    rotateDrag,
    scaleDrag,
    snappedDrag,
    missedPointerFallsThrough,
    localSpaceDiffersFromWorld,
    pass: captures.every((entry) => entry.strokePixels > 200)
      && translateDrag.constrainedToAxis
      && rotateDrag.constrainedToAxis
      && scaleDrag.constrainedToAxis
      && Math.abs(snappedDrag.committed % snappedDrag.snapIncrement) < 1e-6
      && missedPointerFallsThrough
      && localSpaceDiffersFromWorld
  };
}

async function renderGizmo(mode: "translate" | "rotate" | "scale"): Promise<Capture> {
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

  const controls = new TransformControls({ mode, size: 1 });
  controls.attach(makeTarget());
  controls.place([0, 0, 0]);
  const handles = controls.handles();
  const viewProjection = perspectiveLookAt(45, 1, 4.2);

  // The object being transformed, so the gizmo is shown around real geometry.
  const items: RenderItem[] = [{
    label: "gizmo-target",
    geometry: Geometry.cube(0.5),
    material: new UnlitMaterial({ color: [0.35, 0.4, 0.5, 1] }),
    modelViewProjectionMatrix: viewProjection
  }];

  for (const handle of handles) {
    items.push({
      label: `gizmo-${handle.handle}`,
      geometry: Geometry.screenSpaceLineSegments(handle.segments.map((segment) => ({ start: segment.start, end: segment.end }))),
      material: new ScreenSpaceLineMaterial({
        color: handle.color,
        // Axis arms read thicker than plane outlines, matching editor convention.
        width: handle.kind === "axis-arrow" ? 5 : handle.kind === "rotation-ring" ? 4 : 2,
        resolution: [SIZE, SIZE],
        pixelRatio: 1
      }),
      modelViewProjectionMatrix: viewProjection
    });
  }

  renderer.render({ renderItems: items, cameraPolicy: "identity" });
  const pixels = renderer.device.readPixels(0, 0, SIZE, SIZE);
  showCanvas(`${mode} gizmo · ${handles.length} handles`, pixels, SIZE, SIZE, handles);
  const capture: Capture = {
    id: mode,
    label: `${mode} gizmo`,
    handleCount: handles.length,
    strokePixels: countStroke(pixels),
    colorBuckets: countColorBuckets(pixels)
  };
  renderer.dispose();
  canvas.remove();
  return capture;
}

function driveDrag(mode: "translate" | "rotate" | "scale"): DragProof {
  const controls = new TransformControls({ mode, size: 1, pickTolerance: 0.2 });
  const target = makeTarget();
  controls.attach(target);
  controls.place([0, 0, 0]);

  const startPosition = readVec(target.position);
  const startScale = readVec(target.scale);
  const startRotation = readVec(target.rotation);

  // Aim at the X arm (or the Z ring for rotate), then move the pointer.
  const downRay = mode === "rotate"
    ? { origin: new ControlVector3(1, 0, 5), direction: new ControlVector3(0, 0, -1) }
    : { origin: new ControlVector3(0.6, 0, 5), direction: new ControlVector3(0, 0, -1) };
  const pickedHandle = controls.pick(downRay)?.handle;
  controls.pointerDown(downRay);
  // Move diagonally: a correct implementation must ignore the off-axis component.
  const moveRay = mode === "rotate"
    ? { origin: new ControlVector3(0.71, 0.71, 5), direction: new ControlVector3(0, 0, -1) }
    : { origin: new ControlVector3(1.1, 0.8, 5), direction: new ControlVector3(0, 0, -1) };
  controls.pointerMove(moveRay);
  const committed = controls.pointerUp();

  const endPosition = readVec(target.position);
  const endScale = readVec(target.scale);
  const endRotation = readVec(target.rotation);

  // Constrained means: the handle's own axis changed, and the others did not.
  const constrainedToAxis = mode === "translate"
    ? Math.abs(endPosition[0] - startPosition[0]) > 1e-6 && Math.abs(endPosition[1] - startPosition[1]) < 1e-9 && Math.abs(endPosition[2] - startPosition[2]) < 1e-9
    : mode === "scale"
      ? Math.abs(endScale[0] - startScale[0]) > 1e-6 && Math.abs(endScale[1] - startScale[1]) < 1e-9 && Math.abs(endScale[2] - startScale[2]) < 1e-9
      : Math.abs(endRotation[2] - startRotation[2]) > 1e-6 && Math.abs(endRotation[0] - startRotation[0]) < 1e-9 && Math.abs(endRotation[1] - startRotation[1]) < 1e-9;

  return {
    mode,
    pickedHandle,
    startPosition, endPosition,
    startScale, endScale,
    startRotation, endRotation,
    totalDelta: Number((committed?.totalDelta ?? 0).toFixed(6)),
    constrainedToAxis
  };
}

function driveSnappedDrag(): GizmoEvidence["snappedDrag"] {
  const snapIncrement = 0.5;
  const controls = new TransformControls({
    mode: "translate",
    size: 1,
    pickTolerance: 0.3,
    snap: { enabled: true, position: snapIncrement }
  });
  controls.attach(makeTarget());
  controls.place([0, 0, 0]);
  controls.pointerDown({ origin: new ControlVector3(0.6, 0, 5), direction: new ControlVector3(0, 0, -1) });
  // A raw movement of 0.68 must land on the 0.5 grid.
  controls.pointerMove({ origin: new ControlVector3(1.28, 0, 5), direction: new ControlVector3(0, 0, -1) });
  const committed = controls.pointerUp();
  return { requestedRaw: 0.68, committed: Number((committed?.totalDelta ?? 0).toFixed(6)), snapIncrement };
}

function compareSpaces(): boolean {
  // 90 degrees about Z maps local +X onto world +Y, so the rendered arms must differ.
  const half = Math.PI / 4;
  const orientation: readonly [number, number, number, number] = [0, 0, Math.sin(half), Math.cos(half)];
  const world = new TransformControls({ mode: "translate", size: 1, space: "world" });
  world.place([0, 0, 0], orientation);
  const local = new TransformControls({ mode: "translate", size: 1, space: "local" });
  local.place([0, 0, 0], orientation);
  const worldX = world.handles().find((handle) => handle.handle === "x")?.direction ?? [0, 0, 0];
  const localX = local.handles().find((handle) => handle.handle === "x")?.direction ?? [0, 0, 0];
  return Math.abs(worldX[0] - localX[0]) > 0.5;
}

function makeTarget(): { position: ControlVector3; rotation: ControlVector3; scale: ControlVector3 } {
  return { position: new ControlVector3(0, 0, 0), rotation: new ControlVector3(0, 0, 0), scale: new ControlVector3(1, 1, 1) };
}

function readVec(value: { x: number; y: number; z: number }): readonly [number, number, number] {
  return [Number(value.x.toFixed(6)), Number(value.y.toFixed(6)), Number(value.z.toFixed(6))];
}

function showCanvas(label: string, pixels: Uint8Array, width: number, height: number, handles: readonly TransformControlHandleGeometry[]): void {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:inline-block;margin:8px;text-align:center;vertical-align:top";
  const view = document.createElement("canvas");
  view.width = width;
  view.height = height;
  view.style.cssText = "width:240px;height:240px;border:1px solid #22405c;display:block";
  const context = view.getContext("2d");
  if (context) {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const sourceRow = (height - 1 - y) * width * 4;
      const targetRow = y * width * 4;
      for (let x = 0; x < width * 4; x += 1) image.data[targetRow + x] = pixels[sourceRow + x] ?? 0;
    }
    context.putImageData(image, 0, 0);
  }
  const text = document.createElement("div");
  text.textContent = `${label} (${handles.map((handle) => handle.handle).join(", ")})`;
  text.style.cssText = "font:10px ui-monospace,monospace;color:#8fb6d6;padding-top:4px;max-width:250px";
  wrapper.append(view, text);
  document.getElementById("gizmo-root")?.append(wrapper);
}

function countStroke(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    if (red + green + blue > 120) count += 1;
  }
  return count;
}

function countColorBuckets(pixels: Uint8Array): number {
  const buckets = new Set<string>();
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    if (red + green + blue <= 120) continue;
    buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
  }
  return buckets.size;
}

function perspectiveLookAt(fovDegrees: number, aspect: number, distance: number): Float32Array {
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
  // Slight orbit so all three axes are visible rather than one pointing at the eye.
  const yaw = 0.6;
  const pitch = 0.42;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const rotation = new Float32Array([
    cy, sy * sp, -sy * cp, 0,
    0, cp, sp, 0,
    sy, -cy * sp, cy * cp, 0,
    0, 0, 0, 1
  ]);
  const translate = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1]);
  return multiply4(projection, multiply4(translate, rotation));
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
