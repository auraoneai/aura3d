import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Teleoperator generic-vehicle review (art lane). Remote only (tools/remote-acr/run.sh, RUN_ID prefix teleart,
 * software WebGL2). Frames every vehicle from four sides through the QA hooks and prints them as
 * `TELEART_FRAME name i n payload` chunks that tools/teleoperator-vehicles/decode.mjs turns back into JPEGs.
 */
const ROUTE = "/apps/showcase-teleoperator/";
const PLAYER_IDS = ["cruiser", "coupe", "truck", "gt", "interceptor"] as const;
const TRAFFIC_VIEWS: Array<{ name: string; slot: number }> = [
  { name: "sedan", slot: 0 },
  { name: "suv-hatch", slot: 3 },
  { name: "van", slot: 6 },
  { name: "pickup", slot: 7 },
  { name: "bus-boxtruck", slot: 9 }
];
const YAWS: Array<[string, number]> = [["rear", 0], ["rear34", Math.PI / 4], ["side", Math.PI / 2], ["front34", (3 * Math.PI) / 4], ["front", Math.PI]];

// tests/browser/teleart-cases.txt narrows the run: one `player:<id>:<yaw labels>` or `traffic:<name>:<yaw labels>` per line.
const CASES_FILE = path.resolve("tests/browser/teleart-cases.txt");
const CASE_LINES = existsSync(CASES_FILE) ? readFileSync(CASES_FILE, "utf8").trim().split(/\n+/).map((l) => l.trim()) : undefined;
// `viewport:390x844` and `overview` are options, every other line is a case
const VIEWPORT = CASE_LINES?.find((l) => l.startsWith("viewport:"))?.slice("viewport:".length).split("x").map(Number) as [number, number] | undefined;
const OVERVIEW = CASE_LINES?.includes("overview") ?? false;
const CASES = CASE_LINES?.filter((l) => !l.startsWith("viewport:") && l !== "overview").map((l) => l.split(":") as [string, string, string]);
const wants = (kind: string, name: string, label: string): boolean =>
  !CASES || CASES.some(([k, n, ls]) => k === kind && n === name && ls.split(",").includes(label));

type Hooks = Record<string, (...a: unknown[]) => unknown>;
const hooks = (page: Page) => <T,>(fn: (h: Hooks) => T) =>
  page.evaluate(fn as never, undefined) as Promise<T>;

async function frame(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  const b64 = (await page.screenshot({ type: "jpeg", quality: 86, clip })).toString("base64");
  const n = Math.ceil(b64.length / 16000);
  for (let i = 0; i < n; i++) console.log(`TELEART_FRAME ${name} ${i} ${n} ${b64.slice(i * 16000, (i + 1) * 16000)}`);
}

async function settle(page: Page, ms = 700): Promise<void> {
  await page.waitForTimeout(ms);
}

test("teleoperator: every vehicle framed from four sides", async ({ page }) => {
  test.setTimeout(2_400_000);
  const server: ExampleDevServer = await startExampleDevServer();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  try {
    const W = VIEWPORT?.[0] ?? 1280;
    const H = VIEWPORT?.[1] ?? 720;
    await page.setViewportSize({ width: W, height: H });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "load", timeout: 240_000 });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_SHOWCASE_TELEOPERATOR__?: unknown }).__AURA3D_SHOWCASE_TELEOPERATOR__), undefined, { timeout: 600_000 });
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(([f, a]) => (window as unknown as { __AURA3D_SHOWCASE_TELEOPERATOR__: Hooks }).__AURA3D_SHOWCASE_TELEOPERATOR__[f as string]!(...(a as unknown[])), [fn, args] as [string, unknown[]]);
    await call("setAutopilotLevel", "MAN");
    await call("qaSetPlayer", { x: 0, speed: 0 });
    for (let i = 0; i < 10; i++) await call("qaPlaceTrafficCar", i, { laneX: 60, zAhead: 400, speed: 0, direction: 1 });
    await settle(page, 1500);
    if (OVERVIEW || !CASES) await frame(page, `overview-${W}x${H}`);

    // playable cars: the chase camera frames the player car at the lower centre; crop around it plus one full frame
    const cropPlayer = { x: Math.round(W * 0.2), y: Math.round(H * 0.28), width: Math.round(W * 0.6), height: Math.round(H * 0.72) };
    for (const id of PLAYER_IDS) {
      if (!YAWS.some(([label]) => wants("player", id, label))) continue;
      await call("selectPlayableVehicle", id);
      for (const [label, yaw] of YAWS) {
        if (!wants("player", id, label)) continue;
        await call("qaSetYaw", yaw);
        await settle(page);
        await frame(page, `player-${id}-${label}-${W}x${H}`, cropPlayer);
      }
    }
    await call("qaSetYaw", 0);
    await call("selectPlayableVehicle", "waymo");
    await settle(page);

    // traffic cars staged ahead of the player in the same lane, standing still
    for (const view of TRAFFIC_VIEWS) {
      if (!YAWS.some(([label]) => wants("traffic", view.name, label))) continue;
      for (const [label, yaw] of YAWS) {
        if (!wants("traffic", view.name, label)) continue;
        await call("qaSetYaw", yaw);
        await call("qaPlaceTrafficCar", view.slot, { laneX: 0, zAhead: 11, speed: 0, direction: 1 });
        await settle(page);
        await frame(page, `traffic-${view.name}-${label}-${W}x${H}`);
      }
      await call("qaPlaceTrafficCar", view.slot, { laneX: 60, zAhead: 400, speed: 0, direction: 1 });
    }
    console.log(`TELEART_ERRORS ${JSON.stringify(errors)}`);
    console.log(`TELEART_DONE ${path.basename(ROUTE)}`);
  } finally {
    await server.close();
  }
});
