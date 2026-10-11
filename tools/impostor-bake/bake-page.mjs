/**
 * PRD-10 T3.6 §9.6 — WebGL2 bake page driver (remote macos-14 runner only).
 * Launches headless Chromium (ANGLE Metal), flattens the GLB in Node
 * (`glb-mesh.mjs`), and renders each hemi-octahedral view orthographically
 * into a tile with the in-page harness (`bake-gl.mjs`, the same code
 * `tests/browser/qr-prd10-impostor.spec.ts` runs): albedo + coverage alpha and
 * tile-space normal XY + depth. Writes raw RGBA atlases + a deterministic
 * atlas hash (SHA-256 over albedo then normal/depth bytes).
 *
 * Runs inside the lane capture job; do not run on a developer Mac
 * (tools/quality-rebuild-capture README — numbers aren't comparable).
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { BAKE_GL_SOURCE } from "./bake-gl.mjs";
import { loadGlbMesh, meshForPage } from "./glb-mesh.mjs";

const BAKE_ORIGIN = "https://a3d-impostor-bake.test/";

/** Open a secure-context page with the bake harness installed. */
export async function openBakePage(browser, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.route(BAKE_ORIGIN, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><canvas></canvas>" }));
  await page.goto(BAKE_ORIGIN);
  await page.addScriptTag({ content: BAKE_GL_SOURCE });
  return page;
}

/**
 * @param {{plan: {tiles: readonly {view:number, dir:number[], tileX:number, tileY:number}[], views:number, tileSize:number, atlasSize?: number, albedoOut:string, normalDepthOut:string}, source: string, materials?: readonly number[]}} args
 */
export async function bakeImpostorPage({ plan, source, materials, nodes }) {
  const mesh = loadGlbMesh(source, { ...(materials ? { materials } : {}), ...(nodes ? { nodes } : {}) });
  const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
  let albedo;
  let normalDepth;
  try {
    const page = await openBakePage(browser, plan.tileSize);
    const result = await page.evaluate(async ({ mesh, tiles, tileSize, views, center, radius }) => {
      const gl = document.querySelector("canvas").getContext("webgl2", { antialias: false, preserveDrawingBuffer: false });
      if (!gl) return { error: "no-webgl2" };
      const res = await window.__a3dBakeLoad(gl, mesh);
      const atlas = window.__a3dBakeAtlas(gl, res, tiles, center, radius, tileSize, views);
      const b64 = (u8) => {
        let s = "";
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return btoa(s);
      };
      return { albedo: b64(atlas.albedo), normalDepth: b64(atlas.normalDepth), glError: gl.getError() };
    }, { mesh: meshForPage(mesh), tiles: plan.tiles, tileSize: plan.tileSize, views: plan.views, center: mesh.bounds.center, radius: mesh.bounds.radius });
    if (result.error) throw new Error(`bake page: ${result.error}`);
    if (result.glError !== 0) throw new Error(`bake page: GL error 0x${result.glError.toString(16)}`);
    albedo = Buffer.from(result.albedo, "base64");
    normalDepth = Buffer.from(result.normalDepth, "base64");
  } finally {
    await browser.close();
  }
  const atlasHash = createHash("sha256").update(albedo).update(normalDepth).digest("hex");
  // Raw RGBA payloads with .ktx2 extension names — Basis compression lands via
  // the repo's ktx2 pipeline at admission (C-17); bytes here are deterministic.
  writeFileSync(plan.albedoOut, albedo);
  writeFileSync(plan.normalDepthOut, normalDepth);
  return { atlasHash, boundingSphere: { center: mesh.bounds.center, radius: mesh.bounds.radius } };
}
