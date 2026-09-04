import { Ray, Vector3 } from "@aura3d/math";
import { InteractiveTransformGizmo } from "@aura3d/editor-runtime";
import {
  Geometry,
  Renderer,
  ScreenSpaceLineMaterial,
  UnlitMaterial,
  type RenderItem
} from "@aura3d/rendering";

/**
 * PART F browser proof: gizmo snapping through the editor route surface.
 *
 * Drives `InteractiveTransformGizmo` — the gizmo editor viewports use, not
 * the controls-package twin — with snap settings enabled, renders its own
 * handle geometry through the real WebGL2 renderer, and reports both the
 * rendered pixels and the quantized drag commits for translate and rotate.
 */

interface SnapDragEvidence {
  readonly pickedHandle: string | undefined;
  readonly totalDelta: number;
  readonly snapped: boolean;
  readonly snapIncrement: number;
}

interface EditorSnapEvidence {
  readonly handleCount: number;
  readonly strokePixels: number;
  readonly translateSnap: SnapDragEvidence;
  readonly rotateSnap: SnapDragEvidence;
  readonly unsnappedTranslateTotal: number;
  readonly pass: boolean;
}

declare global {
  interface Window {
    __AURA3D_EDITOR_SNAP__?: EditorSnapEvidence;
    __AURA3D_EDITOR_SNAP_ERROR__?: string;
  }
}

const SIZE = 360;

void run().catch((error: unknown) => {
  window.__AURA3D_EDITOR_SNAP_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
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
    const gizmo = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.3 });
    gizmo.configure({ snapEnabled: true, positionSnap: 0.5, rotationSnapDegrees: 15, scaleSnap: 0.1 });
    gizmo.place([0, 0, 0]);
    const handles = gizmo.handles();
    const viewProjection = perspectiveLookAt(45, 1, 4.2);

    const items: RenderItem[] = [{
      label: "snap-target",
      geometry: Geometry.cube(0.5),
      material: new UnlitMaterial({ color: [0.35, 0.4, 0.5, 1] }),
      modelViewProjectionMatrix: viewProjection
    }];
    for (const handle of handles) {
      items.push({
        label: `snap-gizmo-${String(handle.handle)}`,
        geometry: Geometry.screenSpaceLineSegments(handle.segments.map((segment) => ({ start: segment.start, end: segment.end }))),
        material: new ScreenSpaceLineMaterial({
          color: handle.color,
          width: handle.kind === "axis-arrow" ? 5 : 2,
          resolution: [SIZE, SIZE],
          pixelRatio: 1
        }),
        modelViewProjectionMatrix: viewProjection
      });
    }
    renderer.render({ renderItems: items, cameraPolicy: "identity" });
    const pixels = renderer.device.readPixels(0, 0, SIZE, SIZE);
    showCanvas("editor gizmo (snap on)", pixels);

    // Translate snap: the same 0.68-style gesture as the controls twin must
    // land on the 0.5 editor grid.
    const translate = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.3 });
    translate.configure({ snapEnabled: true, positionSnap: 0.5 });
    translate.place([0, 0, 0]);
    const downRay = new Ray(new Vector3(0.6, 0, 5), new Vector3(0, 0, -1));
    const pickedHandle = translate.pick(downRay)?.handle;
    translate.pointerDown(downRay);
    translate.pointerMove(new Ray(new Vector3(1.28, 0, 5), new Vector3(0, 0, -1)));
    const committed = translate.pointerUp();
    const translateSnap: SnapDragEvidence = {
      pickedHandle: pickedHandle !== undefined ? String(pickedHandle) : undefined,
      totalDelta: Number((committed?.totalDelta ?? Number.NaN).toFixed(6)),
      snapped: true,
      snapIncrement: 0.5
    };

    // Same gesture with snapping off: proves the grid did the quantizing.
    const free = new InteractiveTransformGizmo({ mode: "translate", size: 1, pickTolerance: 0.3 });
    free.place([0, 0, 0]);
    free.pointerDown(downRay);
    free.pointerMove(new Ray(new Vector3(1.28, 0, 5), new Vector3(0, 0, -1)));
    const unsnappedTranslateTotal = Number((free.pointerUp()?.totalDelta ?? Number.NaN).toFixed(6));

    // Rotate snap: a 68-degree gesture must land on the 15-degree grid (75).
    const rotate = new InteractiveTransformGizmo({ mode: "rotate", size: 1, pickTolerance: 0.1 });
    rotate.configure({ snapEnabled: true, rotationSnapDegrees: 15 });
    rotate.place([0, 0, 0]);
    const downAngle = (10 * Math.PI) / 180;
    const moveAngle = (78 * Math.PI) / 180;
    const rotateDown = new Ray(
      new Vector3(Math.cos(downAngle), Math.sin(downAngle), 5),
      new Vector3(0, 0, -1)
    );
    const rotatePicked = rotate.pick(rotateDown)?.handle;
    rotate.pointerDown(rotateDown);
    const dragUpdate = rotate.pointerMove(new Ray(
      new Vector3(Math.cos(moveAngle), Math.sin(moveAngle), 5),
      new Vector3(0, 0, -1)
    ));
    const rotateCommitted = rotate.pointerUp();
    const rotateSnap: SnapDragEvidence = {
      pickedHandle: rotatePicked !== undefined ? String(rotatePicked) : undefined,
      totalDelta: Number((rotateCommitted?.totalDelta ?? Number.NaN).toFixed(6)),
      snapped: dragUpdate?.snapped ?? false,
      snapIncrement: Number(((15 * Math.PI) / 180).toFixed(6))
    };

    const strokePixels = countStroke(pixels);
    window.__AURA3D_EDITOR_SNAP__ = {
      handleCount: handles.length,
      strokePixels,
      translateSnap,
      rotateSnap,
      unsnappedTranslateTotal,
      pass: handles.length >= 3
        && strokePixels > 200
        && translateSnap.pickedHandle === "x"
        && Math.abs(translateSnap.totalDelta - 0.5) < 1e-3
        && Math.abs(unsnappedTranslateTotal - translateSnap.totalDelta) > 0.05
        && rotateSnap.pickedHandle === "z"
        && Math.abs(rotateSnap.totalDelta - (75 * Math.PI) / 180) < 1e-3
        && rotateSnap.snapped
    };
  } finally {
    renderer.dispose();
    canvas.remove();
  }
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

function showCanvas(label: string, pixels: Uint8Array): void {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:inline-block;margin:8px;text-align:center;vertical-align:top";
  const view = document.createElement("canvas");
  view.width = SIZE;
  view.height = SIZE;
  view.style.cssText = "width:240px;height:240px;border:1px solid #22405c;display:block";
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
  text.style.cssText = "font:10px ui-monospace,monospace;color:#8fb6d6;padding-top:4px;max-width:250px";
  wrapper.append(view, text);
  document.getElementById("editor-snap-root")?.append(wrapper);
}
