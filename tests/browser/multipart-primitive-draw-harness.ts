import {
  Geometry,
  IndexBuffer,
  Renderer,
  UnlitMaterial,
  VertexBuffer,
  VertexFormat,
  auditPrimitiveSubmission,
  type RenderItem
} from "@aura3d/rendering";

/**
 * Live per-draw GL proof for a multi-part glTF asset.
 *
 * ## Why this harness exists
 *
 * `auditPrimitiveSubmission` proves the *submission path* is coherent, and it runs without a browser. What it
 * explicitly cannot do is prove a pixel was written: a coherent draw request can still produce nothing if a shader
 * fails to link, a uniform upload errors, or the primitive lands outside the frustum.
 *
 * The false diagnosis this whole line of work corrected ("the renderer drops secondary glTF mesh primitives") was
 * reached *with* a browser and still concluded wrongly, because the evidence collected was one screenshot from one
 * camera angle plus an aggregate draw-call count. Neither could attribute pixels to a specific primitive.
 *
 * So this harness renders each primitive of the multi-part fixture **in isolation, on its own canvas**, under
 * `errorCheckMode: "strict"` — which calls `gl.getError()` after every uniform upload, vertex-format bind and draw,
 * and throws with the failing draw's label. Per primitive it captures:
 *
 *   - the device-reported draw-call count for that isolated render
 *   - whether any GL error was thrown, and at which stage
 *   - the count of non-background pixels actually written
 *   - the pixel bounding box, so a primitive that drew off-screen is distinguishable from one that drew nothing
 *
 * Isolation is the point: rendering all five together and counting pixels cannot tell you *which* one is missing.
 * That is exactly the ambiguity that cost this investigation a full pass.
 */

interface PerPrimitiveDrawRecord {
  readonly label: string;
  readonly vertexCount: number;
  readonly indexCount: number;
  /** Draw calls the device reported for this primitive's isolated render. */
  readonly drawCalls: number;
  /** GL error message if `strict` mode threw, otherwise `null`. */
  readonly glError: string | null;
  /** Non-background pixels written by this primitive alone. */
  readonly writtenPixels: number;
  /** Bounding box of written pixels, or null when nothing was written. */
  readonly pixelBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

interface MultipartDrawEvidence {
  readonly schema: "aura3d-multipart-primitive-draw/1.0";
  readonly fixture: string;
  readonly errorCheckMode: "strict";
  readonly viewport: readonly [number, number];
  /** Submission-path audit, so submission and GPU evidence are reported side by side. */
  readonly submission: {
    readonly primitives: number;
    readonly submittable: number;
    readonly blocked: number;
    readonly blockedLabels: readonly string[];
    readonly expectedDrawCallsSinglePass: number;
    /** Primitives the frustum test rejected, so "no pixels" is attributable rather than ambiguous. */
    readonly culled: number;
    readonly culledLabels: readonly string[];
    /** Per-primitive frustum verdict keyed by label. */
    readonly frustumByLabel: Readonly<Record<string, string>>;
  };
  readonly perPrimitive: readonly PerPrimitiveDrawRecord[];
  /** Combined render of all primitives together, for a whole-asset draw-call count. */
  readonly combined: { readonly drawCalls: number; readonly writtenPixels: number; readonly glError: string | null };
  readonly allPrimitivesDrew: boolean;
  readonly glErrorCount: number;
}

declare global {
  interface Window {
    __AURA3D_MULTIPART_DRAW__?: MultipartDrawEvidence;
    __AURA3D_MULTIPART_DRAW_ERROR__?: string;
  }
}

const FIXTURE_URL = "/tests/fixtures/gltf-multipart/body-and-four-wheels.glb";
const VIEWPORT: readonly [number, number] = [320, 240];

void run().catch((error: unknown) => {
  window.__AURA3D_MULTIPART_DRAW_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const parts = await loadFixtureParts();
  if (parts.length === 0) throw new Error("fixture produced no parts");

  const items = parts.map((part) => part.item);
  /*
   * Audit against the *same* view-projection the harness renders with, so a `writtenPixels: 0` result is
   * attributable: `frustum: "culled"` means the renderer legitimately skipped it, while `frustum: "inside"` with
   * zero pixels is a real defect. Without this, those two are indistinguishable -- the exact ambiguity that made
   * the "renderer drops wheel primitives" misdiagnosis plausible.
   */
  const auditCamera = viewProjection(undefined);
  const audit = auditPrimitiveSubmission(items, { viewProjectionMatrix: auditCamera });

  const perPrimitive: PerPrimitiveDrawRecord[] = [];
  for (const part of parts) {
    perPrimitive.push(await renderIsolated(part));
  }
  const combined = await renderCombined(items);

  window.__AURA3D_MULTIPART_DRAW__ = {
    schema: "aura3d-multipart-primitive-draw/1.0",
    fixture: FIXTURE_URL,
    errorCheckMode: "strict",
    viewport: VIEWPORT,
    submission: {
      primitives: audit.records.length,
      submittable: audit.submittable,
      blocked: audit.blocked,
      blockedLabels: audit.blockedLabels,
      expectedDrawCallsSinglePass: audit.expectedDrawCalls(1),
      culled: audit.culled,
      culledLabels: audit.culledLabels,
      frustumByLabel: Object.fromEntries(audit.records.map((record) => [record.label, record.frustum]))
    },
    perPrimitive,
    combined,
    allPrimitivesDrew: perPrimitive.every((record) => record.writtenPixels > 0 && record.glError === null),
    glErrorCount: perPrimitive.filter((record) => record.glError !== null).length +
      (combined.glError === null ? 0 : 1)
  };
}

interface FixturePart {
  readonly label: string;
  readonly item: RenderItem;
  readonly vertexCount: number;
  readonly indexCount: number;
}

/**
 * Parse the fixture and build one render item per mesh node.
 *
 * Parsing is done here rather than through the asset pipeline so the harness depends only on the GLB bytes: the
 * property under test is that the renderer draws five primitives, not that a particular loader path works.
 */
async function loadFixtureParts(): Promise<readonly FixturePart[]> {
  const response = await fetch(FIXTURE_URL);
  if (!response.ok) throw new Error(`fixture fetch failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("fixture is not a binary GLB");
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GlbJson;
  const binStart = 20 + jsonLength + 8;

  const readAccessor = (index: number, components: number): Float32Array => {
    const accessor = json.accessors[index]!;
    const bufferView = json.bufferViews[accessor.bufferView]!;
    const offset = binStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const out = new Float32Array(accessor.count * components);
    for (let element = 0; element < accessor.count; element += 1) {
      for (let component = 0; component < components; component += 1) {
        out[element * components + component] = view.getFloat32(offset + (element * components + component) * 4, true);
      }
    }
    return out;
  };
  const readIndices = (index: number): number[] => {
    const accessor = json.accessors[index]!;
    const bufferView = json.bufferViews[accessor.bufferView]!;
    const offset = binStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const out: number[] = [];
    for (let element = 0; element < accessor.count; element += 1) {
      // The fixture declares uint32 indices deliberately, to exercise a wide index path on a small mesh.
      out.push(accessor.componentType === 5123
        ? view.getUint16(offset + element * 2, true)
        : view.getUint32(offset + element * 4, true));
    }
    return out;
  };

  // Compose world transforms so each part lands where the scene graph puts it.
  const parentOf = new Map<number, number>();
  json.nodes.forEach((node, index) => (node.children ?? []).forEach((child) => parentOf.set(child, index)));
  const localMatrix = (node: GlbNode): readonly number[] => {
    if (node.matrix) return node.matrix;
    const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
  };
  const multiply = (a: readonly number[], b: readonly number[]): number[] => {
    const out = new Array<number>(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[column * 4 + k]!;
        out[column * 4 + row] = sum;
      }
    }
    return out;
  };
  const worldMatrix = (index: number): number[] => {
    let matrix = [...localMatrix(json.nodes[index]!)];
    let parent = parentOf.get(index);
    while (parent !== undefined) {
      matrix = multiply(localMatrix(json.nodes[parent]!), matrix);
      parent = parentOf.get(parent);
    }
    return matrix;
  };

  const parts: FixturePart[] = [];
  json.nodes.forEach((node, nodeIndex) => {
    if (node.mesh === undefined) return;
    const primitive = json.meshes[node.mesh]!.primitives[0]!;
    const positions = readAccessor(primitive.attributes.POSITION, 3);
    const indices = readIndices(primitive.indices);
    const vertexCount = positions.length / 3;
    const vertices = new VertexBuffer(VertexFormat.P3, vertexCount);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      vertices.setAttribute(vertex, "position", [
        positions[vertex * 3] ?? 0,
        positions[vertex * 3 + 1] ?? 0,
        positions[vertex * 3 + 2] ?? 0
      ]);
    }
    // Distinct colour per material so a combined render is attributable by hue as well as by count.
    const isWheel = primitive.material === 1;
    parts.push({
      label: node.name ?? `node-${nodeIndex}`,
      vertexCount,
      indexCount: indices.length,
      item: {
        label: node.name ?? `node-${nodeIndex}`,
        geometry: new Geometry(vertices, new IndexBuffer(indices, vertexCount)),
        material: new UnlitMaterial({ color: isWheel ? [0.05, 0.85, 0.35, 1] : [0.85, 0.12, 0.12, 1] }),
        modelMatrix: worldMatrix(nodeIndex)
      }
    });
  });
  return parts;
}

/** Render one primitive alone and attribute every written pixel to it. */
async function renderIsolated(part: FixturePart): Promise<PerPrimitiveDrawRecord> {
  const { renderer, canvas } = await createRenderer(`iso-${part.label}`);
  let glError: string | null = null;
  let drawCalls = 0;
  let pixels: Uint8Array | undefined;
  try {
    renderer.render({ renderItems: [{ ...part.item, modelViewProjectionMatrix: viewProjection(part.item.modelMatrix) }], cameraPolicy: "identity" });
    drawCalls = renderer.device.getDiagnostics().drawCalls;
    pixels = renderer.device.readPixels(0, 0, VIEWPORT[0], VIEWPORT[1]);
  } catch (error) {
    // `strict` mode throws with the failing draw's label and stage, which is the diagnostic value.
    glError = error instanceof Error ? error.message : String(error);
  } finally {
    renderer.dispose();
    canvas.remove();
  }
  const measured = pixels ? measurePixels(pixels) : { writtenPixels: 0, pixelBounds: null };
  return {
    label: part.label,
    vertexCount: part.vertexCount,
    indexCount: part.indexCount,
    drawCalls,
    glError,
    ...measured
  };
}

/** Render every primitive together, for a whole-asset draw-call count. */
async function renderCombined(items: readonly RenderItem[]): Promise<MultipartDrawEvidence["combined"]> {
  const { renderer, canvas } = await createRenderer("combined");
  let glError: string | null = null;
  let drawCalls = 0;
  let writtenPixels = 0;
  try {
    renderer.render({
      renderItems: items.map((item) => ({ ...item, modelViewProjectionMatrix: viewProjection(item.modelMatrix) })),
      cameraPolicy: "identity"
    });
    drawCalls = renderer.device.getDiagnostics().drawCalls;
    writtenPixels = measurePixels(renderer.device.readPixels(0, 0, VIEWPORT[0], VIEWPORT[1])).writtenPixels;
  } catch (error) {
    glError = error instanceof Error ? error.message : String(error);
  } finally {
    renderer.dispose();
    canvas.remove();
  }
  return { drawCalls, writtenPixels, glError };
}

async function createRenderer(id: string): Promise<{ readonly renderer: Renderer; readonly canvas: HTMLCanvasElement }> {
  const canvas = document.createElement("canvas");
  canvas.width = VIEWPORT[0];
  canvas.height = VIEWPORT[1];
  canvas.id = `multipart-${id}`;
  canvas.style.display = "none";
  document.body.append(canvas);
  const renderer = await Renderer.create({
    canvas,
    width: VIEWPORT[0],
    height: VIEWPORT[1],
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.02, 0.03, 0.05, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback"],
    // The whole point: `gl.getError()` after every uniform upload, vertex-format bind, and draw.
    errorCheckMode: "strict"
  });
  return { renderer, canvas };
}

/**
 * A fixed camera that frames the whole fixture.
 *
 * Deliberately a three-quarter view, not dead-on. A head-on camera is what made a correctly-drawing car look
 * wheelless, and a harness that reproduced that framing would inherit the same blind spot.
 */
function viewProjection(modelMatrix: RenderItem["modelMatrix"]): Float32Array {
  const aspect = VIEWPORT[0] / VIEWPORT[1];
  const fov = (42 * Math.PI) / 180;
  const focal = 1 / Math.tan(fov / 2);
  const near = 0.1;
  const far = 100;
  const eye = [4.2, 2.6, 5.4] as const;
  const forward = normalize([-eye[0], -eye[1], -eye[2]]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const view = [
    right[0], up[0], -forward[0], 0,
    right[1], up[1], -forward[1], 0,
    right[2], up[2], -forward[2], 0,
    -dot(right, eye), -dot(up, eye), dot(forward, eye), 1
  ];
  const projection = [
    focal / aspect, 0, 0, 0,
    0, focal, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ];
  const viewProjectionMatrix = multiply4(projection, view);
  return new Float32Array(modelMatrix ? multiply4(viewProjectionMatrix, Array.from(modelMatrix)) : viewProjectionMatrix);
}

function multiply4(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}
function cross(a: readonly number[], b: readonly number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
function dot(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}
function normalize(v: readonly number[]): number[] {
  const length = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / length, v[1]! / length, v[2]! / length];
}

/** Count non-background pixels and their bounding box. */
function measurePixels(pixels: Uint8Array): Pick<PerPrimitiveDrawRecord, "writtenPixels" | "pixelBounds"> {
  const [width, height] = VIEWPORT;
  let written = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      // Clear colour is (0.02, 0.03, 0.05); anything meaningfully brighter is written geometry.
      if (red + green + blue <= 40) continue;
      written += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    writtenPixels: written,
    pixelBounds: maxX >= minX && maxY >= minY
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : null
  };
}

interface GlbJson {
  readonly nodes: readonly GlbNode[];
  readonly meshes: readonly { readonly primitives: readonly { readonly attributes: { readonly POSITION: number }; readonly indices: number; readonly material?: number }[] }[];
  readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly count: number; readonly componentType: number }[];
  readonly bufferViews: readonly { readonly byteOffset?: number }[];
}
interface GlbNode {
  readonly name?: string;
  readonly mesh?: number;
  readonly children?: readonly number[];
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
}
