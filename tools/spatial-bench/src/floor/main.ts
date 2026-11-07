// E6-02 floor probe: how cheap can the data path be at each layer, with the SAME point data the harness streams?
//   raw    : WebGL2 bufferSubData of an interleaved Float32Array (40 B/vertex = Aura3D's P3N3C4 layout; 16 B/vertex = three.js layout)
//   device : @aura3d/rendering VertexBuffer (public package) + WebGL2Device.create(): writeBytes(whole interleaved array) + upload()
//   engine-layer costs measured in isolation on a VertexBuffer: per-vertex setAttribute loop (what updateAttribute does today) and
//            computeBounds() (what refreshBounds does today) vs a typed min/max loop.
// Times are mean ms per operation over ITER iterations after warm-up; "fin" variants add gl.finish() to include the driver copy.
import { VertexBuffer, VertexFormat, WebGL2Device, computeBounds } from "@aura3d/rendering";
import { generate, type Cfg } from "../common/data";

declare global { interface Window { __SB_DONE__?: boolean; __SB_RESULT__?: unknown; __SB_STAGE__?: string } }

const ITER = 40;
function time(fn: () => void, iters = ITER): number {
  for (let i = 0; i < 3; i++) fn();
  const t = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - t) / iters;
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = { iter: ITER, sizes: {} };
  const canvas = document.createElement("canvas");
  canvas.width = 1280; canvas.height = 720;
  document.body.appendChild(canvas);
  const device = WebGL2Device.create({ canvas });
  const gl = canvas.getContext("webgl2")!;
  const fmt = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "normal", components: 3, offset: 12 },
    { semantic: "color", components: 4, offset: 24 }
  ], 40);
  for (const n of [100000, 250000, 1000000]) {
    window.__SB_STAGE__ = "n=" + n;
    const cfg = { id: "floor", points: n, instances: 0, segments: 0, rateHz: 10, fps: 60, labels: 0, orbit: false, probe: null, variant: null, shot: false, viewer: "aura" } as Cfg;
    const d = generate(cfg);
    const pos = d.pointPositions[0]!, col = d.pointColors[0]!;
    const r: Record<string, number> = {};
    // Interleave position + constant normal + color (u8 -> f32 /255) into the 40 B layout.
    const inter = new Float32Array(n * 10);
    const interleave = (): void => {
      for (let i = 0, j = 0; i < n; i++, j += 10) {
        inter[j] = pos[i * 3]!; inter[j + 1] = pos[i * 3 + 1]!; inter[j + 2] = pos[i * 3 + 2]!;
        inter[j + 3] = 0; inter[j + 4] = 1; inter[j + 5] = 0;
        inter[j + 6] = col[i * 4]! / 255; inter[j + 7] = col[i * 4 + 1]! / 255; inter[j + 8] = col[i * 4 + 2]! / 255; inter[j + 9] = col[i * 4 + 3]! / 255;
      }
    };
    r.interleave40ms = time(interleave);
    // raw GL uploads
    const buf40 = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf40);
    gl.bufferData(gl.ARRAY_BUFFER, inter.byteLength, gl.DYNAMIC_DRAW);
    r.rawSubData40ms = time(() => gl.bufferSubData(gl.ARRAY_BUFFER, 0, inter));
    r.rawSubData40finMs = time(() => { gl.bufferSubData(gl.ARRAY_BUFFER, 0, inter); gl.finish(); });
    const small = new Uint8Array(n * 16);
    const buf16 = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf16);
    gl.bufferData(gl.ARRAY_BUFFER, small.byteLength, gl.DYNAMIC_DRAW);
    r.rawSubData16ms = time(() => gl.bufferSubData(gl.ARRAY_BUFFER, 0, small));
    r.rawSubData16finMs = time(() => { gl.bufferSubData(gl.ARRAY_BUFFER, 0, small); gl.finish(); });
    gl.deleteBuffer(buf40); gl.deleteBuffer(buf16);

    // device layer: VertexBuffer + WebGL2Device
    const vb = new VertexBuffer(fmt, n);
    vb.upload(device); // allocate
    r.deviceWriteBytesMs = time(() => vb.writeBytes(0, inter));
    r.deviceWriteUploadMs = time(() => { vb.writeBytes(0, inter); vb.upload(device); });
    r.deviceWriteUploadFinMs = time(() => { vb.writeBytes(0, inter); vb.upload(device); gl.finish(); });
    r.deviceInterleaveWriteUploadMs = time(() => { interleave(); vb.writeBytes(0, inter); vb.upload(device); });
    // today's engine-layer costs, in isolation (iters reduced for the slow ones)
    const slowIters = n >= 1000000 ? 3 : 8;
    const p3 = [0, 0, 0], c4 = [0, 0, 0, 0];
    r.setAttributeLoopMs = time(() => {
      for (let i = 0; i < n; i++) {
        p3[0] = pos[i * 3]!; p3[1] = pos[i * 3 + 1]!; p3[2] = pos[i * 3 + 2]!;
        vb.setAttribute(i, "position", p3);
        c4[0] = col[i * 4]! / 255; c4[1] = col[i * 4 + 1]! / 255; c4[2] = col[i * 4 + 2]! / 255; c4[3] = col[i * 4 + 3]! / 255;
        vb.setAttribute(i, "color", c4);
      }
    }, slowIters);
    const geom = { vertexBuffer: vb, format: fmt };
    void geom;
    r.computeBoundsMs = time(() => { computeBounds(vb); }, slowIters);
    r.typedMinMaxMs = time(() => {
      let a = Infinity, b = Infinity, c = Infinity, e = -Infinity, f = -Infinity, g = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
        if (x < a) a = x; if (y < b) b = y; if (z < c) c = z; if (x > e) e = x; if (y > f) f = y; if (z > g) g = z;
      }
      if (a > g) throw new Error("unreachable");
    });
    r.isFiniteArrayFromEveryMs = time(() => { Array.from(pos).every(Number.isFinite); }, slowIters);
    r.isFiniteTypedLoopMs = time(() => { for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i]!)) throw new Error("x"); });
    r.sliceCopyMs = time(() => { pos.slice(); });
    vb.dispose();
    (out.sizes as Record<string, unknown>)[String(n)] = r;
  }
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  out.renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
  window.__SB_RESULT__ = { failed: false, floor: out };
  window.__SB_DONE__ = true;
}
main().catch((e) => { window.__SB_RESULT__ = { failed: true, cause: String(e?.stack ?? e) }; window.__SB_DONE__ = true; });
