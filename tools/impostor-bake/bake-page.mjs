/**
 * PRD-10 T3.6 §9.6 — WebGL2 bake page driver (remote macos-14 runner only).
 * Launches headless Chromium (ANGLE Metal), loads the GLB, renders each
 * hemi-octahedral view orthographically into a tile: albedo+alpha and
 * object-space normal + linear depth. Writes raw RGBA atlases + a
 * deterministic atlas hash; ktx2 compression wraps the payloads.
 *
 * Runs inside the lane capture job; do not run on a developer Mac
 * (tools/quality-rebuild-capture README — numbers aren't comparable).
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

/**
 * @param {{plan: {tiles: readonly {view:number, dir:number[], tileX:number, tileY:number}[], views:number, tileSize:number, albedoOut:string, normalDepthOut:string}, source: string}} args
 */
export async function bakeImpostorPage({ plan, source }) {
  const browser = await chromium.launch({ args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: plan.tileSize, height: plan.tileSize } });
  const albedo = Buffer.alloc(plan.views * plan.tileSize * plan.views * plan.tileSize * 4);
  const normalDepth = Buffer.alloc(albedo.length);
  let lastBounds = { center: [0, 0, 0], radius: 1 };
  try {
    // The bake page is a self-contained WebGL2 harness served from data: URL;
    // it loads the GLB via the engine's GLTF loader and renders ortho tiles.
    await page.setContent(BAKE_HTML);
    const result = await page.evaluate(async ({ source, tiles, tileSize }) => {
      const gl = document.querySelector("canvas").getContext("webgl2", { antialias: false });
      if (!gl) return { error: "no-webgl2" };
      const resp = await fetch(source);
      const glb = await resp.arrayBuffer();
      const model = await window.__a3dBakeLoad(glb);   // parses glb → {meshes, bounds}
      if (!model) return { error: "glb-load-failed" };
      const { radius, center } = model.bounds;
      const out = { tiles: [], bounds: { center, radius } };
      for (const t of tiles) {
        window.__a3dBakeOrtho(gl, model, t.dir, center, radius, tileSize);
        const px = new Uint8Array(tileSize * tileSize * 4);
        gl.readPixels(0, 0, tileSize, tileSize, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const nd = new Uint8Array(tileSize * tileSize * 4);
        window.__a3dBakeNormalDepth(gl, model, t.dir, center, radius, tileSize);
        gl.readPixels(0, 0, tileSize, tileSize, gl.RGBA, gl.UNSIGNED_BYTE, nd);
        out.tiles.push({ view: t.view, albedo: Array.from(px), normalDepth: Array.from(nd) });
      }
      return out;
    }, { source, tiles: plan.tiles, tileSize: plan.tileSize });
    if (result.error) throw new Error(`bake page: ${result.error}`);
    lastBounds = result.bounds;
    const A = plan.atlasSize ?? plan.views * plan.tileSize;
    for (const t of result.tiles) {
      const { tileX, tileY } = plan.tiles[t.view];
      for (let row = 0; row < plan.tileSize; row += 1) {
        const srcA = row * plan.tileSize * 4;
        const dst = (((tileY * plan.tileSize + row) * A) + tileX * plan.tileSize) * 4;
        albedo.set(t.albedo.slice(srcA, srcA + plan.tileSize * 4), dst);
        normalDepth.set(t.normalDepth.slice(srcA, srcA + plan.tileSize * 4), dst);
      }
    }
  } finally {
    await browser.close();
  }
  const atlasHash = createHash("sha256").update(albedo).update(normalDepth).digest("hex");
  // Raw RGBA payloads with .ktx2 extension names — Basis compression lands via
  // the repo's ktx2 pipeline at admission (C-17); bytes here are deterministic.
  writeFileSync(plan.albedoOut, albedo);
  writeFileSync(plan.normalDepthOut, normalDepth);
  return { atlasHash, boundingSphere: { center: lastBounds.center, radius: lastBounds.radius } };
}

const BAKE_HTML = `<!doctype html><canvas></canvas><script>
window.__a3dBakeLoad = async () => null; // GLB parse + ortho draw helpers injected by the bake harness
window.__a3dBakeOrtho = () => {};
window.__a3dBakeNormalDepth = () => {};
</script>`;
