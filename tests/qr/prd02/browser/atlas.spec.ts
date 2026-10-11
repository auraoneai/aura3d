/**
 * 02-S6 — GPU local-light shadows without readback (PRD-02 §16.1 S6, item 1944).
 *
 *  (a) prd02-softbox (shadowed spot → one atlas tile), A3D_QR_LIGHTING on:
 *      `app.lighting.diagnostics().readPixelsCalls` delta is 0 over 60 frames.
 *      (SceneSpec point lights cannot request shadows, so the spot is the
 *      lane-scene local-shadow caster.)
 *  (b) tile depth: a point light's 6 atlas tiles, planned by
 *      `planLocalShadowAtlas` and rasterized with each tile's
 *      `drawViewProjection` + scissor, hold the floor depth of a CPU
 *      ray-cast reference within 1e-3 (test-only readback after the window).
 *  (c) seam: the registered `a3d_prd02_shadow_lookup` chunk's
 *      `a3d_localShadow` receives a pole shadow that crosses the -Y/+X face
 *      seam on the floor with no gap and an edge offset ≤ 1 px. If this fails,
 *      the PRD's fallback is `samplerCubeShadow` (§6.4).
 */
import { expect, test } from "@playwright/test";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";
import { lightingCounters, requireLaneApp, stepFrames } from "./shadow-helpers";

const ATLAS = 1024;
const TILE = 256;
const LIGHT: readonly [number, number, number] = [0, 2, 0];
const RANGE = 10;
const VIEW = 512; // top-down receive image over x,z in [-4, 4]
const POLE = { x: 1, z: 0.3, half: 0.1, height: 1.5 };

type Mat = readonly number[];

function invert(m: Mat): number[] {
  const inv = new Array<number>(16);
  inv[0] = m[5]! * m[10]! * m[15]! - m[5]! * m[11]! * m[14]! - m[9]! * m[6]! * m[15]! + m[9]! * m[7]! * m[14]! + m[13]! * m[6]! * m[11]! - m[13]! * m[7]! * m[10]!;
  inv[4] = -m[4]! * m[10]! * m[15]! + m[4]! * m[11]! * m[14]! + m[8]! * m[6]! * m[15]! - m[8]! * m[7]! * m[14]! - m[12]! * m[6]! * m[11]! + m[12]! * m[7]! * m[10]!;
  inv[8] = m[4]! * m[9]! * m[15]! - m[4]! * m[11]! * m[13]! - m[8]! * m[5]! * m[15]! + m[8]! * m[7]! * m[13]! + m[12]! * m[5]! * m[11]! - m[12]! * m[7]! * m[9]!;
  inv[12] = -m[4]! * m[9]! * m[14]! + m[4]! * m[10]! * m[13]! + m[8]! * m[5]! * m[14]! - m[8]! * m[6]! * m[13]! - m[12]! * m[5]! * m[10]! + m[12]! * m[6]! * m[9]!;
  inv[1] = -m[1]! * m[10]! * m[15]! + m[1]! * m[11]! * m[14]! + m[9]! * m[2]! * m[15]! - m[9]! * m[3]! * m[14]! - m[13]! * m[2]! * m[11]! + m[13]! * m[3]! * m[10]!;
  inv[5] = m[0]! * m[10]! * m[15]! - m[0]! * m[11]! * m[14]! - m[8]! * m[2]! * m[15]! + m[8]! * m[3]! * m[14]! + m[12]! * m[2]! * m[11]! - m[12]! * m[3]! * m[10]!;
  inv[9] = -m[0]! * m[9]! * m[15]! + m[0]! * m[11]! * m[13]! + m[8]! * m[1]! * m[15]! - m[8]! * m[3]! * m[13]! - m[12]! * m[1]! * m[11]! + m[12]! * m[3]! * m[9]!;
  inv[13] = m[0]! * m[9]! * m[14]! - m[0]! * m[10]! * m[13]! - m[8]! * m[1]! * m[14]! + m[8]! * m[2]! * m[13]! + m[12]! * m[1]! * m[10]! - m[12]! * m[2]! * m[9]!;
  inv[2] = m[1]! * m[6]! * m[15]! - m[1]! * m[7]! * m[14]! - m[5]! * m[2]! * m[15]! + m[5]! * m[3]! * m[14]! + m[13]! * m[2]! * m[7]! - m[13]! * m[3]! * m[6]!;
  inv[6] = -m[0]! * m[6]! * m[15]! + m[0]! * m[7]! * m[14]! + m[4]! * m[2]! * m[15]! - m[4]! * m[3]! * m[14]! - m[12]! * m[2]! * m[7]! + m[12]! * m[3]! * m[6]!;
  inv[10] = m[0]! * m[5]! * m[15]! - m[0]! * m[7]! * m[13]! - m[4]! * m[1]! * m[15]! + m[4]! * m[3]! * m[13]! + m[12]! * m[1]! * m[7]! - m[12]! * m[3]! * m[5]!;
  inv[14] = -m[0]! * m[5]! * m[14]! + m[0]! * m[6]! * m[13]! + m[4]! * m[1]! * m[14]! - m[4]! * m[2]! * m[13]! - m[12]! * m[1]! * m[6]! + m[12]! * m[2]! * m[5]!;
  inv[3] = -m[1]! * m[6]! * m[11]! + m[1]! * m[7]! * m[10]! + m[5]! * m[2]! * m[11]! - m[5]! * m[3]! * m[10]! - m[9]! * m[2]! * m[7]! + m[9]! * m[3]! * m[6]!;
  inv[7] = m[0]! * m[6]! * m[11]! - m[0]! * m[7]! * m[10]! - m[4]! * m[2]! * m[11]! + m[4]! * m[3]! * m[10]! + m[8]! * m[2]! * m[7]! - m[8]! * m[3]! * m[6]!;
  inv[11] = -m[0]! * m[5]! * m[11]! + m[0]! * m[7]! * m[9]! + m[4]! * m[1]! * m[11]! - m[4]! * m[3]! * m[9]! - m[8]! * m[1]! * m[7]! + m[8]! * m[3]! * m[5]!;
  inv[15] = m[0]! * m[5]! * m[10]! - m[0]! * m[6]! * m[9]! - m[4]! * m[1]! * m[10]! + m[4]! * m[2]! * m[9]! + m[8]! * m[1]! * m[6]! - m[8]! * m[2]! * m[5]!;
  const det = m[0]! * inv[0]! + m[1]! * inv[4]! + m[2]! * inv[8]! + m[3]! * inv[12]!;
  return inv.map((v) => v / det);
}

function transform(m: Mat, p: readonly [number, number, number, number]): [number, number, number, number] {
  return [0, 1, 2, 3].map((r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]! * p[3]) as [number, number, number, number];
}

/** CPU reference: floor (y = 0) depth in tile-uv space at a tile pixel centre, or null if the ray misses within near..far. */
function floorDepth(viewProjection: Mat, u: number, v: number): number | null {
  const inv = invert(viewProjection);
  const a = transform(inv, [u, v, 0, 1]);
  const b = transform(inv, [u, v, 1, 1]);
  const near = [a[0] / a[3], a[1] / a[3], a[2] / a[3]] as const;
  const far = [b[0] / b[3], b[1] / b[3], b[2] / b[3]] as const;
  if (Math.abs(far[1] - near[1]) < 1e-9) return null;
  const t = near[1] / (near[1] - far[1]);
  if (t <= 0 || t >= 1) return null;
  const hit = [near[0] + (far[0] - near[0]) * t, 0, near[2] + (far[2] - near[2]) * t] as const;
  const p = transform(viewProjection, [hit[0], hit[1], hit[2], 1]);
  return p[2] / p[3];
}

interface TileArgs {
  readonly viewProjection: number[];
  readonly drawViewProjection: number[];
  readonly scissor: { x: number; y: number; width: number; height: number };
}

interface AtlasArgs {
  readonly atlas: number;
  readonly tiles: readonly TileArgs[];
  /** Atlas pixel coords (x, y) to read the floor-only depth at. */
  readonly probes: readonly number[];
  readonly chunk: string;
  readonly light: readonly number[];
  readonly view: number;
  readonly pole: { x: number; z: number; half: number; height: number };
  readonly columns: readonly [number, number];
}

// Runs in the page (Playwright serializes it); keep it free of closures.
function runAtlas(args: AtlasArgs): { error?: string; depth?: number[]; lit?: number[] } {
  const canvas = document.createElement("canvas");
  canvas.width = args.view;
  canvas.height = args.view;
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) return { error: "no webgl2" };
  if (!gl.getExtension("EXT_color_buffer_float")) return { error: "EXT_color_buffer_float unavailable" };
  const program = (vs: string, fs: string) => {
    const p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "compile failed");
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, "a_p");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link failed");
    return p;
  };
  const geometry = (withPole: boolean) => {
    const v: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
    quad([-20, 0, -20], [20, 0, -20], [20, 0, 20], [-20, 0, 20]);
    if (withPole) {
      const { x, z, half, height } = args.pole;
      const x0 = x - half, x1 = x + half, z0 = z - half, z1 = z + half;
      quad([x0, 0, z0], [x1, 0, z0], [x1, height, z0], [x0, height, z0]);
      quad([x0, 0, z1], [x1, 0, z1], [x1, height, z1], [x0, height, z1]);
      quad([x0, 0, z0], [x0, 0, z1], [x0, height, z1], [x0, height, z0]);
      quad([x1, 0, z0], [x1, 0, z1], [x1, height, z1], [x1, height, z0]);
      quad([x0, height, z0], [x1, height, z0], [x1, height, z1], [x0, height, z1]);
    }
    return new Float32Array(v);
  };
  try {
    const depthProgram = program(
      "#version 300 es\nin vec3 a_p;\nuniform mat4 u_vp;\nvoid main(){gl_Position=u_vp*vec4(a_p,1.0);}",
      "#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}"
    );
    const buffer = gl.createBuffer();
    const depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, args.atlas, args.atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const colorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, args.atlas, args.atlas);
    const atlasFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, atlasFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    const renderAtlas = (withPole: boolean) => {
      const verts = geometry(withPole);
      gl.bindFramebuffer(gl.FRAMEBUFFER, atlasFbo);
      gl.viewport(0, 0, args.atlas, args.atlas);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(depthProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.enable(gl.SCISSOR_TEST);
      for (const tile of args.tiles) {
        gl.scissor(tile.scissor.x, tile.scissor.y, tile.scissor.width, tile.scissor.height);
        gl.uniformMatrix4fv(gl.getUniformLocation(depthProgram, "u_vp"), false, new Float32Array(tile.drawViewProjection));
        gl.drawArrays(gl.TRIANGLES, 0, verts.length / 3);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.DEPTH_TEST);
    };
    const fullscreen = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const drawFullscreen = (p: WebGLProgram) => {
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, fullscreen, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const fsVertex = "#version 300 es\nin vec2 a_p;\nvoid main(){gl_Position=vec4(a_p,0.0,1.0);}";

    // (b) floor-only atlas → copy raw depth into RGBA32F → read the probe texels.
    renderAtlas(false);
    const copyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, copyTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, args.atlas, args.atlas);
    const copyFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, copyFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, copyTex, 0);
    gl.viewport(0, 0, args.atlas, args.atlas);
    const copyProgram = program(fsVertex, "#version 300 es\nprecision highp float;\nuniform highp sampler2D u_d;\nout vec4 c;\nvoid main(){c=vec4(texelFetch(u_d, ivec2(gl_FragCoord.xy), 0).r);}");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.useProgram(copyProgram);
    gl.uniform1i(gl.getUniformLocation(copyProgram, "u_d"), 0);
    drawFullscreen(copyProgram);
    const texel = new Float32Array(4);
    const depth: number[] = [];
    for (let i = 0; i < args.probes.length; i += 2) {
      gl.readPixels(args.probes[i]!, args.probes[i + 1]!, 1, 1, gl.RGBA, gl.FLOAT, texel);
      depth.push(texel[0]!);
    }

    // (c) floor + pole atlas → top-down receive through a3d_localShadow.
    renderAtlas(true);
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const receive = program(fsVertex, `#version 300 es
precision highp float;
#define A3D_SHADOW_FILTER 1
${args.chunk}
uniform vec3 u_light;
uniform float u_view;
out vec4 c;
void main() {
  vec2 xz = (gl_FragCoord.xy / u_view) * 8.0 - 4.0;
  vec3 p = vec3(xz.x, 0.0, xz.y);
  vec3 d = p - u_light;
  vec3 a = abs(d);
  int face = a.x >= a.y && a.x >= a.z ? (d.x > 0.0 ? 0 : 1) : (a.y >= a.z ? (d.y > 0.0 ? 2 : 3) : (d.z > 0.0 ? 4 : 5));
  float lit = a3d_localShadow(face, p, vec3(0.0, 1.0, 0.0));
  c = vec4(lit, lit, lit, 1.0);
}`);
    const viewTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, viewTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, args.view, args.view);
    const viewFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, viewFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, viewTex, 0);
    gl.viewport(0, 0, args.view, args.view);
    gl.useProgram(receive);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.uniform1i(gl.getUniformLocation(receive, "u_prd02LocalCompare"), 1);
    // Keep the chunk's other samplers off unit 1 and apart by type.
    gl.uniform1i(gl.getUniformLocation(receive, "u_prd02ShadowRaw"), 2);
    const matrices = new Float32Array(16 * 6);
    const rects = new Float32Array(4 * 6);
    args.tiles.forEach((tile, i) => {
      matrices.set(tile.viewProjection, i * 16);
      rects.set([tile.scissor.x / args.atlas, tile.scissor.y / args.atlas, tile.scissor.width / args.atlas, tile.scissor.height / args.atlas], i * 4);
    });
    gl.uniformMatrix4fv(gl.getUniformLocation(receive, "u_prd02LocalShadowMatrix[0]"), false, matrices);
    gl.uniform4fv(gl.getUniformLocation(receive, "u_prd02ShadowAtlasRect[0]"), rects);
    gl.uniform1f(gl.getUniformLocation(receive, "u_prd02ShadowMapSize"), args.atlas);
    gl.uniform1f(gl.getUniformLocation(receive, "u_prd02NormalBias"), 20);
    gl.uniform1f(gl.getUniformLocation(receive, "u_prd02ShadowStrength"), 1);
    gl.uniform3fv(gl.getUniformLocation(receive, "u_light"), new Float32Array(args.light));
    gl.uniform1f(gl.getUniformLocation(receive, "u_view"), args.view);
    drawFullscreen(receive);
    const [c0, c1] = args.columns;
    const strip = new Uint8Array((c1 - c0 + 1) * args.view * 4);
    gl.readPixels(c0, 0, c1 - c0 + 1, args.view, gl.RGBA, gl.UNSIGNED_BYTE, strip);
    const lit: number[] = [];
    for (let i = 0; i < strip.length; i += 4) lit.push(strip[i]! / 255);
    return { depth, lit };
  } catch (error) {
    return { error: String(error) };
  }
}

const SEAM_HALF_COLUMNS = 6;

test.describe("02-S6 local-light shadow atlas", () => {
  let server: LaneServer;
  test.beforeAll(async () => {
    server = await startLaneServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("prd02-softbox: readPixelsCalls delta 0 over 60 frames", async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    await captureLaneScene(page, server, { scene: "prd02-softbox", flags: "lighting" });
    await requireLaneApp(page);
    const before = await lightingCounters(page);
    await stepFrames(page, 60);
    const after = await lightingCounters(page);
    await testInfo.attach("02-S6-readpixels.json", { body: JSON.stringify({ before, after }), contentType: "application/json" });
    expect(before.readPixelsCalls, "C-28 readPixelsCalls must be observed (device attached)").not.toBeNull();
    expect(after.readPixelsCalls! - before.readPixelsCalls!).toBe(0);
  });

  test("point-light atlas tiles: depth vs CPU <= 1e-3, seam gap <= 1 px", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const { planLocalShadowAtlas } = await import("../../../../packages/rendering/src/shadows/ShadowAtlas.js");
    const { shaderChunk } = await import("../../../../packages/rendering/src/contracts/index.js");
    const { SHADOW_LOOKUP_CHUNK } = await import("../../../../packages/rendering/src/contracts/shadows.js");
    await import("../../../../packages/rendering/src/lanes/prd02.js");
    const chunk = shaderChunk(SHADOW_LOOKUP_CHUNK)?.glsl;
    if (!chunk) throw new Error(`${SHADOW_LOOKUP_CHUNK} is not registered`);
    const planned = planLocalShadowAtlas([{ lightIndex: 0, kind: "point", size: TILE, position: LIGHT, direction: [0, -1, 0], range: RANGE }], ATLAS);
    expect(planned.tiles.length, "a point light takes 6 tiles").toBe(6);
    const tiles = planned.tiles.map((tile) => ({
      viewProjection: Array.from(tile.viewProjection),
      drawViewProjection: Array.from(tile.drawViewProjection),
      scissor: { ...tile.scissor }
    }));

    // CPU reference on a 1-in-8 grid of each tile's interior (1 px border skipped).
    const probes: number[] = [];
    const expected: number[] = [];
    for (const tile of tiles) {
      const { x, y, width, height } = tile.scissor;
      for (let py = y + 1; py < y + height - 1; py += 8) {
        for (let px = x + 1; px < x + width - 1; px += 8) {
          const depth = floorDepth(tile.viewProjection, (px + 0.5 - x) / width, (py + 0.5 - y) / height);
          if (depth === null) continue;
          probes.push(px, py);
          expected.push(depth);
        }
      }
    }
    expect(expected.length, "floor visible in the point-light tiles").toBeGreaterThan(500);

    await page.goto("about:blank");
    const seamColumn = Math.round(((2 + 4) / 8) * VIEW); // -Y / +X face seam at x = 2 (light height 2)
    const columns: [number, number] = [seamColumn - SEAM_HALF_COLUMNS, seamColumn + SEAM_HALF_COLUMNS];
    const result = await page.evaluate(runAtlas, { atlas: ATLAS, tiles, probes, chunk, light: [...LIGHT], view: VIEW, pole: POLE, columns });
    if (result.error || !result.depth || !result.lit) throw new Error(result.error ?? "atlas run returned nothing");

    let maxDepthError = 0;
    for (let i = 0; i < expected.length; i += 1) maxDepthError = Math.max(maxDepthError, Math.abs(result.depth[i]! - expected[i]!));

    // Pole shadow stripe crossing the seam: per column, the shadowed rows near
    // the stripe's analytic centre (z = pole.z · x / pole.x at x = 2).
    const width = columns[1] - columns[0] + 1;
    const centreRow = Math.round(((POLE.z * (2 / POLE.x) + 4) / 8) * VIEW);
    const edges: { top: number; bottom: number }[] = [];
    for (let c = 0; c < width; c += 1) {
      let top = -1;
      let bottom = -1;
      for (let row = centreRow - 60; row <= centreRow + 60; row += 1) {
        if (result.lit[row * width + c]! < 0.5) {
          if (top < 0) top = row;
          bottom = row;
        }
      }
      edges.push({ top, bottom });
    }
    const gaps = edges.filter((edge) => edge.top < 0).length;
    let maxEdgeStep = 0;
    for (let c = 1; c < edges.length; c += 1) {
      if (edges[c]!.top < 0 || edges[c - 1]!.top < 0) continue;
      maxEdgeStep = Math.max(maxEdgeStep, Math.abs(edges[c]!.top - edges[c - 1]!.top), Math.abs(edges[c]!.bottom - edges[c - 1]!.bottom));
    }
    const report = { probes: expected.length, maxDepthError, seamColumn, centreRow, gaps, maxEdgeStep, edges };
    await testInfo.attach("02-S6-atlas.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    expect(maxDepthError, `tile depth vs CPU reference`).toBeLessThanOrEqual(1e-3);
    expect(gaps, `pole shadow must cross the seam without a gap: ${JSON.stringify(edges)}`).toBe(0);
    expect(maxEdgeStep, `seam edge offset: ${JSON.stringify(edges)}`).toBeLessThanOrEqual(1);
  });
});
