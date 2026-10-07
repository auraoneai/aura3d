/* PRD-06 T2.0 browser harness: proves a `Texture` with `dimension:"2d-array"`
 * reaches the GPU through texStorage3D + texSubImage3D — a sampler2DArray
 * program texelFetches layer 2 and reads the uploaded color back (WebKit
 * included, §18). A second pass exercises Texture.update + region.layer. */
export {};

function bufferFrom(data: string | ArrayLike<number> | ArrayBufferView | ArrayBuffer): Uint8Array & { equals(o: Uint8Array): boolean; toString(enc?: string): string } {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        : Uint8Array.from(data as ArrayLike<number>);
  const out = bytes as Uint8Array & { equals(o: Uint8Array): boolean; toString(enc?: string): string };
  out.equals = (other) => out.length === other.length && out.every((v, i) => v === other[i]);
  const nativeToString = out.toString.bind(out);
  out.toString = (enc?: string) => {
    if (enc !== "base64") return nativeToString();
    let s = "";
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return out;
}
(globalThis as { Buffer?: unknown }).Buffer ??= {
  from: bufferFrom,
  isBuffer: (value: unknown) => value instanceof Uint8Array,
  concat: (parts: readonly Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { merged.set(p, off); off += p.length; }
    return merged;
  }
};

interface TextureArrayReport {
  status: "running" | "done" | "error";
  error?: string;
  /** texelFetch(layer 2) readback after the initial texStorage3D + texSubImage3D upload. */
  layer2?: readonly number[];
  /** layer 2 readback after Texture.update(data, {layer:2}) — proves the region offset. */
  layer2AfterUpdate?: readonly number[];
  /** layer 0 readback after the layer-2 update — proves neighbors untouched. */
  layer0AfterUpdate?: readonly number[];
  /** layer 1 readback, always. */
  layer1?: readonly number[];
}

declare global {
  interface Window {
    __PRD06_TEXTURE_ARRAY__?: TextureArrayReport;
  }
}

const W = 4;
const H = 4;
const LAYERS = 3;

const LAYER_COLORS = [
  [200, 10, 10, 255],
  [10, 200, 10, 255],
  [30, 60, 190, 255]
] as const;
const LAYER2_UPDATED = [250, 220, 40, 255] as const;

function layerPlane(color: readonly number[]): Uint8Array {
  const plane = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i += 1) plane.set(color, i * 4);
  return plane;
}

async function main(): Promise<void> {
  const report: TextureArrayReport = { status: "running" };
  window.__PRD06_TEXTURE_ARRAY__ = report;
  try {
    const {
      Texture,
      TextureBinding,
      VertexAttribute,
      VertexFormat,
      WebGL2Device
    } = await import("../../../../packages/rendering/src/index.js");
    const stage = document.getElementById("stage") ?? document.body;
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    stage.appendChild(canvas);
    const device = WebGL2Device.create({ canvas, preserveDrawingBuffer: true, errorCheckMode: "strict" });

    const data = new Uint8Array(W * H * 4 * LAYERS);
    data.set(layerPlane(LAYER_COLORS[0]), 0);
    data.set(layerPlane(LAYER_COLORS[1]), W * H * 4);
    data.set(layerPlane(LAYER_COLORS[2]), 2 * W * H * 4);
    const texture = new Texture({
      width: W,
      height: H,
      layers: LAYERS,
      dimension: "2d-array",
      format: "rgba8",
      colorSpace: "linear",
      label: "prd06-texture-array",
      data
    });

    const MARKER = "@aura3d-qr:prd06-texture-array";
    const shader = device.createShaderProgram({
      label: "prd06-texture-array",
      marker: MARKER,
      vertex: `#version 300 es
// ${MARKER}
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`,
      fragment: `#version 300 es
// ${MARKER}
precision mediump float;
uniform highp sampler2DArray u_arr;
uniform float u_layer;
out vec4 outColor;
void main() { outColor = texelFetch(u_arr, ivec3(0, 0, int(u_layer)), 0); }`
    });
    const vertexBuffer = device.createBuffer("vertex", 24, new Float32Array([-1, -1, 3, -1, -1, 3]));
    const vertexFormat = new VertexFormat([new VertexAttribute({ semantic: "position", components: 2, offset: 0, shaderName: "a_position" })]);
    const readLayer = (layer: number): readonly number[] => {
      device.beginFrame(8, 8);
      device.draw({
        topology: "triangles",
        vertexBuffer,
        vertexFormat,
        vertexCount: 3,
        renderState: { depthTest: false, depthWrite: true, cullMode: "none", blend: false, depthCompare: "always" },
        shader,
        uniforms: new Map<string, import("../../../../packages/rendering/src/RenderDevice.js").UniformValue>([
          ["u_arr", new TextureBinding({ name: "u_arr", texture })],
          ["u_layer", layer]
        ])
      });
      const px = Array.from(device.readPixels(0, 0, 1, 1));
      device.endFrame();
      return px;
    };

    (report as { layer2?: readonly number[] }).layer2 = readLayer(2);
    (report as { layer1?: readonly number[] }).layer1 = readLayer(1);

    // Per-layer refresh: update() with {layer:2} must land on layer 2 only.
    texture.update(layerPlane(LAYER2_UPDATED), { x: 0, y: 0, width: W, height: H, layer: 2 });
    (report as { layer2AfterUpdate?: readonly number[] }).layer2AfterUpdate = readLayer(2);
    (report as { layer0AfterUpdate?: readonly number[] }).layer0AfterUpdate = readLayer(0);

    (report as { status: string }).status = "done";
  } catch (error) {
    (report as { status: string }).status = "error";
    (report as { error?: string }).error = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  }
}

void main();
