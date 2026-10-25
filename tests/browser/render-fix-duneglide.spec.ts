import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** Duneglide chase camera: the same chapter-0 flight with the clearance off and on. Remote only (tools/remote-acr/run.sh). */

const emit = (slug: string, name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SC ${slug} ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};
const say = (tag: string, data: unknown): void => { process.stdout.write(`@@FIXRC ${tag} ${JSON.stringify(data)}\n`); };
const raf = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const FLYB = "{ throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false }";
const FLY = "{ throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false }";
const SAMPLES = 60;
const SPAN = 20;

async function flight(page: Page, stopAtStep: number | null): Promise<{ blockedSteps: number[]; samples: number }> {
  const blockedSteps: number[] = [];
  let samples = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const step = (i + 1) * SPAN;
    if (stopAtStep !== null && step > stopAtStep) break;
    const blocked = await page.evaluate(({ span, input }) => {
      const api = (window as unknown as Record<string, any>).__AURA_SILT__;
      api.stepFrames(span, new Function(`return ${input}`)());
      return api.camera()?.blocked === true;
    }, { span: SPAN, input: step <= 300 ? FLYB : FLY });
    samples += 1;
    if (blocked) blockedSteps.push(step);
  }
  return { blockedSteps, samples };
}

test.describe("Duneglide chase camera", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("is inside scenery far less with clearance on than on the same flight with it off", async ({ browser }) => {
    const url = (extra: string) => `${server.origin}/examples/silt-and-signal-port/?manual=1&start=1&chapter=0&objective=2${extra}`;
    const ready = async (page: Page) => { await page.waitForFunction(() => (window as unknown as Record<string, { ready?: boolean }>).__AURA_SILT__?.ready === true, undefined, { timeout: 900_000, polling: 1000 }); };

    const off = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await off.goto(url("&camclear=0"), { waitUntil: "domcontentloaded" });
    await ready(off);
    const offResult = await flight(off, null);
    say("duneglide.camera.off", offResult);
    const firstBlocked = offResult.blockedSteps[0] ?? null;
    if (firstBlocked !== null) {
      await off.evaluate(() => (window as unknown as Record<string, any>).__AURA_SILT__.render());
      await raf(off, 3);
    }
    await off.close();

    const on = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await on.goto(url(""), { waitUntil: "domcontentloaded" });
    await ready(on);
    const onResult = await flight(on, null);
    say("duneglide.camera.on", onResult);
    await on.close();

    // frames at the first step the unobstructed camera was inside scenery, with and without clearance
    if (firstBlocked !== null) {
      for (const [name, extra] of [["off", "&camclear=0"], ["on", ""]] as const) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        await page.goto(url(extra), { waitUntil: "domcontentloaded" });
        await ready(page);
        await flight(page, firstBlocked);
        await raf(page, 3);
        emit("duneglide", `camera-${name}-step${firstBlocked}`, await page.screenshot({ type: "jpeg", quality: 88 }));
        await page.close();
      }
    }
    // a rider hugging a crown can leave the minimum-distance eye inside it for a frame or two
    expect(offResult.blockedSteps.length).toBeGreaterThan(0);
    expect(onResult.blockedSteps.length).toBeLessThanOrEqual(Math.floor(offResult.blockedSteps.length * 0.2));
  });
});
