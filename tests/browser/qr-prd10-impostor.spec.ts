import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { BAKE_GL_SOURCE } from "../../tools/impostor-bake/bake-gl.mjs";
import { loadGlbMesh, meshForPage } from "../../tools/impostor-bake/glb-mesh.mjs";
import { impostorBakePlan } from "../../tools/impostor-bake/index";
import { impostorShaderSources } from "../../packages/rendering/src/world/vegetation/ImpostorMaterial";

/**
 * PRD-10 S8 — impostor bake determinism + impostor/LOD0 silhouette IoU.
 *
 * 1. The `tools/impostor-bake` harness (`bake-gl.mjs`, the code the CLI's
 *    `--execute` path runs) bakes the 8×8 hemi-octahedral atlas (256 px
 *    tiles) of a real foliage model twice; SHA-256 over albedo‖normal-depth
 *    must match.
 * 2. The production impostor program (`impostorShaderSources()`, fragment =
 *    the registered `a3d_prd10_impostor` chunk) draws that atlas as a
 *    billboard from 8 views around the model; its coverage mask vs the LOD0
 *    mesh rendered from the same camera must reach IoU ≥ 0.9 at every view.
 *
 * Species: one pine from the admitted `propPineTree` corpus GLB (node
 * subtree `Cylinder.004`: bark + alpha-masked needle cards). The §6.6 world
 * foliage set (S13) has not shipped; this is the only admitted foliage mesh.
 * No skip path: a runner without WebGL2 fails this spec (P-22).
 */

const GLB = "public/aura-assets/propPineTree.12243e81.glb";
const SPECIES_NODE = "Cylinder.004";
const VIEWS = 8;
const TILE = 256;
const EVAL_SIZE = 256;
const ORIGIN = "https://a3d-impostor.test/";

test("S8: impostor bake is deterministic and impostor/LOD0 IoU ≥ 0.9 at 8 views", async ({ page }) => {
  test.setTimeout(180_000);
  const mesh = loadGlbMesh(resolve(GLB), { nodes: [SPECIES_NODE] });
  const plan = impostorBakePlan({ asset: "propPineTree", views: VIEWS, size: TILE, outDir: "tests/reports" });
  const sources = impostorShaderSources();
  // 8 evaluation views: 45° azimuth steps, offset off the frame grid, 10° up.
  const evalDirs = Array.from({ length: 8 }, (_, k) => {
    const az = ((k * 45 + 12.5) * Math.PI) / 180;
    const el = (10 * Math.PI) / 180;
    return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)] as [number, number, number];
  });

  await page.route(ORIGIN, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><canvas></canvas>" }));
  await page.goto(ORIGIN);
  await page.addScriptTag({ content: BAKE_GL_SOURCE });

  const result = await page.evaluate(async ({ mesh, tiles, views, tile, size, center, radius, vs, fs, evalDirs }) => {
    type W = Record<string, unknown>;
    const w = window as unknown as W & Window;
    const gl = (document.querySelector("canvas") as HTMLCanvasElement).getContext("webgl2", { antialias: false });
    if (!gl) return { error: "no-webgl2" };
    const res = await (w.__a3dBakeLoad as (...a: unknown[]) => Promise<unknown>)(gl, mesh);
    const bakeAtlas = w.__a3dBakeAtlas as (...a: unknown[]) => { albedo: Uint8Array; normalDepth: Uint8Array; atlasSize: number };
    const sha = async (a: Uint8Array, b: Uint8Array): Promise<string> => {
      const both = new Uint8Array(a.length + b.length);
      both.set(a);
      both.set(b, a.length);
      const d = new Uint8Array(await crypto.subtle.digest("SHA-256", both));
      return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
    };
    const bake1 = bakeAtlas(gl, res, tiles, center, radius, tile, views);
    const hash1 = await sha(bake1.albedo, bake1.normalDepth);
    const bake2 = bakeAtlas(gl, res, tiles, center, radius, tile, views);
    const hash2 = await sha(bake2.albedo, bake2.normalDepth);
    let atlasCoverage = 0;
    for (let i = 3; i < bake1.albedo.length; i += 4) if (bake1.albedo[i]! > 0) atlasCoverage += 1;

    // --- impostor program (production sources)
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`impostor ${type === gl.VERTEX_SHADER ? "VS" : "FS"}: ${gl.getShaderInfoLog(sh)}`);
      return sh;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`impostor link: ${gl.getProgramInfoLog(prog)}`);
    } catch (e) {
      return { error: String(e) };
    }
    const atlasTex = (data: Uint8Array, unit: number): void => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bake1.atlasSize, bake1.atlasSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    atlasTex(bake1.albedo, 1);
    atlasTex(bake1.normalDepth, 2);
    gl.activeTexture(gl.TEXTURE0);
    const quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const u = (n: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, n);

    const target = (w.__a3dBakeTarget as (...a: unknown[]) => { fb: WebGLFramebuffer })(gl, size);
    const lookPerspective = w.__a3dLookPerspective as (...a: unknown[]) => { mvp: Float32Array; eye: number[] };
    const drawMesh = w.__a3dDrawMesh as (...a: unknown[]) => void;
    // Visual proof: an 8×2 contact sheet (row 0 LOD0, row 1 impostor) on sky blue.
    const sheet = document.createElement("canvas");
    sheet.width = size * evalDirs.length;
    sheet.height = size * 2;
    const ctx2d = sheet.getContext("2d")!;
    ctx2d.fillStyle = "#9db8cf";
    ctx2d.fillRect(0, 0, sheet.width, sheet.height);
    const stash = (px: Uint8Array, col: number, row: number): void => {
      const img = ctx2d.createImageData(size, size);
      for (let y = 0; y < size; y += 1) {
        // GL rows are bottom-up; ImageData is top-down
        img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      }
      const tmp = document.createElement("canvas");
      tmp.width = size;
      tmp.height = size;
      tmp.getContext("2d")!.putImageData(img, 0, 0);
      ctx2d.drawImage(tmp, col * size, row * size);
    };
    let lastPx = new Uint8Array(0);
    const mask = (): Uint8Array => {
      const px = new Uint8Array(size * size * 4);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
      lastPx = px;
      const m = new Uint8Array(size * size);
      for (let i = 0; i < m.length; i += 1) m[i] = px[i * 4 + 3]! > 0 ? 1 : 0;
      return m;
    };
    const clear = (): void => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, size, size);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    };
    const dist = 30 * radius;
    const fov = 2 * Math.atan((1.05 * radius) / dist);
    const views8 = [] as { dir: number[]; iou: number; lod0: number; impostor: number }[];
    for (const dir of evalDirs) {
      const { mvp, eye } = lookPerspective(dir, center, dist, fov, dist - 2 * radius, dist + 2 * radius);
      clear();
      drawMesh(gl, res, mvp, 0);
      const a = mask();
      stash(lastPx, views8.length, 0);
      clear();
      gl.useProgram(prog);
      gl.bindVertexArray(quadVao);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(u("u_viewProjection"), false, mvp);
      gl.uniform3f(u("u_cameraPosition"), eye[0]!, eye[1]!, eye[2]!);
      gl.uniform1f(u("u_impostorRadius"), radius);
      gl.uniform3f(u("u_lodDistances"), 0, 0, 1e9);
      gl.uniform1f(u("u_impostorGridDim"), views);
      gl.uniform1f(u("u_impostorParallax"), 0);
      gl.uniform1f(u("u_impostorAlphaCutoff"), 0.5);
      gl.uniform1i(u("u_impostorWriteDepth"), 0);
      gl.uniform1i(u("u_impostorAlbedo"), 1);
      gl.uniform1i(u("u_impostorNormalDepth"), 2);
      // per-instance attributes as constants: centre, scale 1, yaw 0
      for (const [name, v] of [["a_instancePosition", center], ["a_instanceScale", [1]], ["a_instanceYaw", [0]]] as const) {
        const loc = gl.getAttribLocation(prog, name);
        if (loc < 0) continue;
        gl.disableVertexAttribArray(loc);
        gl.vertexAttrib4f(loc, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, 1);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      const b = mask();
      stash(lastPx, views8.length, 1);
      let inter = 0;
      let uni = 0;
      let na = 0;
      let nb = 0;
      for (let i = 0; i < a.length; i += 1) {
        na += a[i]!;
        nb += b[i]!;
        if (a[i]! & b[i]!) inter += 1;
        if (a[i]! | b[i]!) uni += 1;
      }
      views8.push({ dir, iou: uni === 0 ? 0 : inter / uni, lod0: na, impostor: nb });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { hash1, hash2, atlasCoverage, views: views8, glError: gl.getError(), sheet: sheet.toDataURL("image/png") };
  }, {
    mesh: meshForPage(mesh),
    tiles: plan.tiles,
    views: VIEWS,
    tile: TILE,
    size: EVAL_SIZE,
    center: mesh.bounds.center,
    radius: mesh.bounds.radius,
    vs: sources.vertex,
    fs: sources.fragment,
    evalDirs
  });

  expect("error" in result ? result.error : null, "CI runner must expose WebGL2 and compile the impostor program").toBeNull();
  const { sheet, ...r } = result as { sheet: string; hash1: string; hash2: string; atlasCoverage: number; views: { dir: number[]; iou: number; lod0: number; impostor: number }[]; glError: number };
  mkdirSync("tests/reports", { recursive: true });
  writeFileSync("tests/reports/qr-prd10-impostor.png", Buffer.from(sheet.replace(/^data:image\/png;base64,/, ""), "base64"));
  await test.info().attach("impostor-vs-lod0", { path: "tests/reports/qr-prd10-impostor.png", contentType: "image/png" });
  writeFileSync("tests/reports/qr-prd10-impostor.json", `${JSON.stringify({ glb: GLB, node: SPECIES_NODE, grid: VIEWS, tile: TILE, planHash: plan.planHash, ...r }, null, 2)}\n`);
  test.info().annotations.push({ type: "S8", description: `atlas sha256 ${r.hash1} / ${r.hash2}; IoU ${r.views.map((v) => v.iou.toFixed(3)).join(", ")}` });

  expect(r.glError).toBe(0);
  expect(r.atlasCoverage, "the bake must cover pixels (not an empty atlas)").toBeGreaterThan(VIEWS * VIEWS * 500);
  expect(r.hash2, "two bakes of the same GLB must produce identical atlas bytes").toBe(r.hash1);
  for (const v of r.views) {
    expect(v.lod0, "LOD0 reference must cover pixels").toBeGreaterThan(2000);
    expect(v.iou, `impostor/LOD0 IoU at view ${v.dir.map((x) => x.toFixed(2)).join(",")}`).toBeGreaterThanOrEqual(0.9);
  }
});
