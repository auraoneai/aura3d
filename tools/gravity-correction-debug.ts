import { chromium } from "@playwright/test";
import { startExampleDevServer } from "../tests/browser/example-dev-server";
const server = await startExampleDevServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultNavigationTimeout(120_000);
await page.goto(`${server.origin}/apps/showcase-gravity-post/?capture=review`, { waitUntil: "commit", timeout: 120_000 });
const read = async () => await page.evaluate(() => (window as any).__GRAVITY_POST_EVIDENCE__ ?? {});
const advance = async (seconds: number) => await page.evaluate((total) => {
  const step = (window as any).__GRAVITY_POST_SIM_STEP__;
  const chunks = Math.ceil(total / 0.025);
  for (let index = 0; index < chunks; index += 1) step(total / chunks);
}, seconds);
const drag = async (dx: number, dy: number) => {
  const center = await page.evaluate(() => {
    const canvas = document.querySelector("[data-testid='gravity-post-stage'] canvas")!;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + dx, center.y + dy, { steps: 6 });
  await page.mouse.up();
};
const waitMounted = async () => { for (;;) { if ((await read()).rendererMounted) return; await page.waitForTimeout(1_000); } };
const fly = async (dx: number, dy: number) => {
  await drag(dx, dy);
  let state = await read();
  if (state.podState === "ready") { await page.waitForTimeout(100); await drag(dx, dy); }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await read();
    if (state.podState === "docked" || state.failedContracts > 0) return state;
    if (state.flybyActive) await page.keyboard.press("KeyX");
    await advance(0.5);
  }
  return await read();
};
await waitMounted();
console.log("c1", (await fly(-4, -79)).podState);
await page.keyboard.press("KeyN"); await advance(0.05);
console.log("before correction", JSON.stringify(await read()));
await drag(55, 5); await advance(0.05); await page.keyboard.press("KeyW"); await advance(0.05);
console.log("after W", JSON.stringify(await read()));
await page.keyboard.press("KeyS"); await advance(0.05); console.log("after S", JSON.stringify(await read()));
await page.keyboard.press("KeyR"); await advance(0.05); console.log("after R", JSON.stringify(await read()));
console.log("c2", (await fly(-4, 60)).podState);
await page.keyboard.press("KeyN"); await advance(0.05); console.log("before c3 drag", JSON.stringify(await read()));
await drag(-4, -40); console.log("after c3 drag", JSON.stringify(await read()));
await browser.close(); await server.close();
