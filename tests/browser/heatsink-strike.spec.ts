import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * heatsink strike layer: reduced remote check (software GL, small canvas, low quality). Remote-only
 * (tools/remote-acr/run.sh); never run under local Playwright.
 *
 * Replays the original's recorded 6000-step movement script with the gun held down in the live build, so the
 * result is the same deterministic strike replay the unit test pins (score, kills, barrels, shots, hits, hash),
 * photographs the canvas where targets are in range, a bolt is in flight, a target dies and a barrel blows up,
 * and drives the DOM HUD and results screen. The full-length original replay is covered by heatsink-port.spec.ts.
 */

const REPORT_ROOT = resolve("tests/reports/heatsink-strike");
const LAB = "/examples/heatsink-port/";
const REFERENCE = "tests/browser/data/heatsink-reference-replay.json";
const GOLDEN = { score: 2950, kills: 6, barrels: 4, shots: 872, hits: 33, bestChain: 3, hash: "e1d8bccd" };

interface OpsState { score: number; kills: number; barrels: number; shots: number; hits: number; chain: number; bestChain: number; medal: string; targetsAlive: number; hash: string }
interface Api {
  ready(): boolean;
  stepFrames(n: number, input?: unknown): unknown;
  replayStart(text: string): number;
  replayTo(target: number, lead?: number, grab?: boolean): { state: string; step: number; ops: OpsState; shot: { w: number; h: number; lit: number; url: string } | null };
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
}

/** the script text with the F (fire) flag added to every segment */
const withFire = (text: string): string =>
  text.split("\n").map((line) => {
    const m = /^(\d+x t\S+ b\S+ s\S+) (\S+)$/.exec(line.trim());
    if (!m) return line;
    const flags = m[2] === "-" ? "F" : m[2]!.includes("F") ? m[2]! : `${m[2]}F`;
    return `${m[1]} ${flags}`;
  }).join("\n");

test.describe("heatsink strike layer", () => {
  test.setTimeout(1_200_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_ROOT, { recursive: true }); });
  test.afterAll(async () => { await server.close(); });

  test("boots, shows the objective and score HUD, and the strike replay matches the pinned outcome", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 480, height: 270 });
    await page.goto(`${server.origin}${LAB}?manual=1&quality=low`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const w = window as unknown as { __AURA_HEATSINK__?: { ready(): boolean }; __AURA_HEATSINK_ERROR__?: string };
      return w.__AURA_HEATSINK__?.ready() === true || Boolean(w.__AURA_HEATSINK_ERROR__);
    }, undefined, { timeout: 540_000 });
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_HEATSINK_ERROR__?: string }).__AURA_HEATSINK_ERROR__ ?? null);
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    // the objective and the score blocks exist from the first frame (countdown)
    await page.evaluate("window.__AURA_HEATSINK__.stepFrames(30)");
    const hud = await page.evaluate(() => ({
      objective: document.getElementById("objective")?.textContent ?? "",
      score: document.getElementById("h-score")?.textContent ?? "",
      mult: document.getElementById("h-mult")?.textContent ?? "",
      targets: document.getElementById("h-targets")?.textContent ?? ""
    }));
    console.log("HEATSINK_STRIKE_HUD countdown", JSON.stringify(hud));
    expect(hud.objective).toMatch(/Destroy sentry drones/);
    expect(hud.score).toBe("0");
    expect(hud.mult).toBe("x1");
    expect(hud.targets).toBe("0/48");

    const ref = JSON.parse(readFileSync(resolve(REFERENCE), "utf8")) as { script: { text: string; totalSteps: number } };
    const total = await page.evaluate(`window.__AURA_HEATSINK__.replayStart(${JSON.stringify(withFire(ref.script.text))})`) as number;
    expect(total).toBe(ref.script.totalSteps);

    // walk the replay in 20-step strides; photograph the first sighting of each moment worth seeing
    const wants = new Set(["fire", "hit", "kill", "barrel"]);
    const shots: { moment: string; step: number; lit: number }[] = [];
    let prev: OpsState | null = null;
    let step = 200;
    while (step <= total) {
      const r = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${step}, 6, true)`) as ReturnType<Api["replayTo"]>;
      const o = r.ops;
      let moment: string | null = null;
      if (prev) {
        if (o.barrels > prev.barrels && wants.has("barrel")) moment = "barrel";
        else if (o.kills > prev.kills && wants.has("kill")) moment = "kill";
        else if (o.hits > prev.hits && wants.has("hit")) moment = "hit";
        else if (o.shots > prev.shots && wants.has("fire")) moment = "fire";
      }
      if (moment && r.shot) {
        wants.delete(moment);
        console.log(`@@HEATSINK_STRIKE_FRAME ${moment}-${step} ${r.shot.url.split(",")[1]}`);
        shots.push({ moment, step, lit: r.shot.lit });
      }
      prev = o;
      if (wants.size === 0 && step > 3000) break;
      step += 20;
    }
    console.log("HEATSINK_STRIKE_SHOTS", JSON.stringify(shots));

    const final = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${total}, 0)`) as ReturnType<Api["replayTo"]>;
    const o = final.ops;
    console.log("HEATSINK_STRIKE_FINAL", JSON.stringify(o));
    expect({ score: o.score, kills: o.kills, barrels: o.barrels, shots: o.shots, hits: o.hits, bestChain: o.bestChain, hash: o.hash }).toEqual(GOLDEN);

    const hudEnd = await page.evaluate(() => ({
      score: document.getElementById("h-score")?.textContent ?? "",
      mult: document.getElementById("h-mult")?.textContent ?? "",
      targets: document.getElementById("h-targets")?.textContent ?? "",
      objective: document.getElementById("objective")?.textContent ?? ""
    }));
    console.log("HEATSINK_STRIKE_HUD end", JSON.stringify(hudEnd));
    expect(Number(hudEnd.score)).toBe(GOLDEN.score);
    expect(hudEnd.targets).toBe(`${GOLDEN.kills}/48`);
    expect(hudEnd.objective).toMatch(/NEXT TARGET|NO TARGETS AHEAD/);

    const diag = await page.evaluate(`(function(o){ var d=o.diagnostics(); return { drawCalls: d && d.drawCalls || 0, errorCount: d && d.errors ? d.errors.length : 0 }; })(window.__AURA_HEATSINK__)`) as { drawCalls: number; errorCount: number };
    console.log("HEATSINK_STRIKE_DIAG", JSON.stringify(diag), JSON.stringify(errors.slice(0, 6)).slice(0, 400));
    writeFileSync(resolve(`${REPORT_ROOT}/heatsink-strike.json`), `${JSON.stringify({ schema: "aura3d-heatsink-strike/1.0", generatedAt: new Date().toISOString(), hud, hudEnd, shots, final: o, diag, errors }, null, 2)}\n`);

    expect(errors.filter((e) => /parity-not-implemented|Failed to resolve|shader|GLSL|compile|TypeError|ReferenceError/i.test(e)), errors.join("\n")).toEqual([]);
    expect(diag.errorCount).toBe(0);
    expect(shots.length, "at least a fire frame and a kill frame were photographed").toBeGreaterThanOrEqual(2);
    for (const s of shots) expect(s.lit, `${s.moment} frame is not black`).toBeGreaterThan(0.02);
  });
});
