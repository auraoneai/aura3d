import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Hotfix check for the brand and likeness cleanup (remote only, software WebGL2): each affected game boots from its built
 * dist with 0 console errors, every GLB it requests answers 200, none of the removed originals is requested, and the
 * frame is not black. Build first: `vite build apps/showcase-<slug> --config vite.config.ts --outDir ../../tests/browser/hotfix-dist-<slug>`
 * and copy the referenced public/aura-assets files into `hotfix-dist-<slug>/aura-assets`.
 */
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };
const REMOVED = ["teleopWaymoHero.6d2a9bfb", "teleopWaymoTraffic.f476abe7", "teleopCorvette.e7009c34", "teleopCybercab.08358a58", "showcaseCcByFormulaOpponent.5dba5c01", "showcaseTsukubaCircuit.8c139a57", "turboTsukubaVisualTrack.ab53a493", "rooftopAthleteDefender.c0947539", "rooftopAthleteShooter.49b62313", "rooftopShooter.49b62313", "rooftopDefender.6c43f9e1", "diamondAthlete.4e29f649", "fcSoccerStrikerMeshy.a675e393", "fcGoalkeeperMeshy.156eb05c", "linksGolferAthleteMeshy.a39990ad", "rzQuarterbackMeshy.9368c81f", "rzDefenderLinemanMeshy.38e261b9", "hoopsAthleteBig.a11d61c5", "hoopsAthleteGuard.fbef844e"];

function serve(dist: string): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    let file = path.join(dist, decodeURIComponent((req.url ?? "/").split("?")[0]!));
    if (!file.startsWith(dist)) { res.statusCode = 403; res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
  }));
}

const GAMES: Array<{ slug: string; expectGlb: RegExp }> = [
  { slug: "aura-hoops-3d", expectGlb: /hoopsAthlete(Big|Guard)Clean\./ },
  { slug: "aura-diamond-3d", expectGlb: /diamondAthleteClean\./ },
  { slug: "aura-links-3d", expectGlb: /linksGolferAthleteClean\./ },
  { slug: "aura-fc-3d", expectGlb: /fc(SoccerStriker|Goalkeeper)Clean\./ },
  { slug: "red-zone-3d", expectGlb: /rz(Quarterback|DefenderLineman)Clean\./ },
  { slug: "teleoperator", expectGlb: /teleop(Waymo|Corvette|Cybercab)Clean\./ }
];
const OUT = process.env.HOTFIX_OUT ?? "tests/reports/hotfix";
test.setTimeout(600_000);

for (const game of GAMES) {
  test(`${game.slug}: boots clean, cleaned models load, no removed original is requested`, async ({ page }) => {
    const dist = path.resolve(`tests/browser/hotfix-dist-${game.slug}`);
    const { origin, close } = await serve(dist);
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    const bad: string[] = [];
    const glb: Array<{ url: string; status: number }> = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 220)));
    page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 220)); });
    page.on("response", (r) => {
      const url = r.url().replace(origin, "");
      if (/\.glb(\?|$)/.test(url)) glb.push({ url, status: r.status() });
      if (r.status() >= 400 && !/favicon|local\.css|fonts\//.test(url)) bad.push(`http${r.status()} ${url}`);
    });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${origin}/?autostart=1&diag=1`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => document.querySelectorAll("canvas").length > 0, undefined, { timeout: 120_000 });
    await page.waitForTimeout(20_000);
    const shot = await page.screenshot({ path: `${OUT}/${game.slug}.png` });
    const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
    console.log(`HOTFIX_FRAME ${game.slug} ${jpg.toString("base64")}`);
    const luma = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = document.createElement("canvas"); c.width = 96; c.height = 54;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, 96, 54);
      const d = ctx.getImageData(0, 0, 96, 54).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      return s / (d.length / 4);
    }, shot.toString("base64"));
    const requestedRemoved = glb.filter((g) => REMOVED.some((r) => g.url.includes(r)));
    const cleaned = glb.filter((g) => game.expectGlb.test(g.url));
    const result = { slug: game.slug, meanLuma: Math.round(luma * 10) / 10, glbRequests: glb.length, glbNon200: glb.filter((g) => g.status !== 200).map((g) => `${g.status} ${g.url}`), cleanedRequested: cleaned.map((g) => `${g.status} ${g.url}`), requestedRemoved, errors, httpErrors: bad };
    writeFileSync(`${OUT}/${game.slug}.json`, JSON.stringify(result, null, 2));
    console.log("HOTFIX " + JSON.stringify(result));
    await close();
    expect(errors, "console errors").toEqual([]);
    expect(requestedRemoved, "removed originals requested").toEqual([]);
    expect(result.glbNon200, "GLB requests that did not answer 200").toEqual([]);
    expect(cleaned.length, "cleaned model requested").toBeGreaterThan(0);
    expect(luma, "frame is not black").toBeGreaterThan(8);
  });
}
