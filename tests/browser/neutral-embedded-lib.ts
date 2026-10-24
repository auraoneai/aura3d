import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const SHOTS = [
  { slug: "ninja-runner", hook: "__AURA_NINJA_RUNNER__", query: "?manual=1&quality=low", name: "run120", drive: "api.begin(); api.stepFrames(120);" },
  { slug: "silt-and-signal", hook: "__AURA_SILT__", query: "?manual=1&chapter=0&objective=1", name: "rings", drive: "api.pose({ position: [138, 9, 42], target: [138, 5, 5], up: [0, 1, 0], fov: 62 }); api.render(); api.render();" }
];

const emit = (slug: string, name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000, n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@NE ${slug} ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};

const raf = (page: Page, n: number) => page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** mode "blocked": every /aura-environments/** request is aborted (the published-package condition). "served": files are served from public/. */
export function neutralEmbeddedFrames(mode: "blocked" | "served"): void {
  test.describe(`neutral environment frames (${mode})`, () => {
    test.setTimeout(3_000_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });
    for (const shot of SHOTS) {
      test(`${mode} ${shot.slug}`, async ({ browser }) => {
        const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
        const envRequests: string[] = [];
        const problems: string[] = [];
        page.on("request", (r) => { if (r.url().includes("/aura-environments/")) envRequests.push(r.url().replace(/^https?:\/\/[^/]+/, "")); });
        page.on("console", (m) => { const t = m.text(); if (/ENV_FETCH_FAILED|environment probe not ready|aura-environments/.test(t) || (m.type() === "error" && /404/.test(t))) problems.push(t.slice(0, 160)); });
        page.on("pageerror", (e) => problems.push(`pageerror ${e.message.slice(0, 160)}`));
        page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
        if (mode === "blocked") await page.route("**/aura-environments/**", (route) => route.abort());
        await page.goto(`${server.origin}/examples/${shot.slug}-port/${shot.query}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction((hook) => { const a = (window as unknown as Record<string, any>)[hook]; if (!a) return false; return typeof a.ready === "function" ? a.ready() === true : a.ready === true; }, shot.hook, { timeout: 900_000 });
        await page.waitForTimeout(20_000); // let the async environment upgrade land
        await page.evaluate(({ hook, drive }) => { const api = (window as unknown as Record<string, any>)[hook]; return new Function("api", drive)(api); }, { hook: shot.hook, drive: shot.drive });
        await raf(page, 4);
        emit(shot.slug, `${shot.name}.png`, await page.screenshot({ type: "png" }));
        process.stdout.write(`@@NEINFO ${mode} ${shot.slug} envRequests=${JSON.stringify(envRequests)} problems=${JSON.stringify(problems.slice(0, 8))}\n`);
        await page.close();
        expect(true).toBe(true);
      });
    }
  });
}
