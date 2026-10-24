import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

export interface Step { name: string; drive: string }
export interface PortCfg { slug: string; hook: string; query: string; steps: Step[]; pose?: Record<string, unknown>; repeatLoads?: number }

const emit = (port: string, name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000, n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@FC ${port} ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};

const raf = (page: Page, n: number) => page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

export function framecmp(cfgs: PortCfg[]): void {
  test.describe("framecmp", () => {
    test.setTimeout(3_000_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });

    for (const cfg of cfgs) {
      test(`frames ${cfg.slug} ${cfg.steps[0].name}`, async ({ browser }) => {
        const loads = cfg.repeatLoads ?? 1;
        const errors: string[] = [];
        for (let load = 0; load < loads; load++) {
          const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
          page.on("pageerror", (e) => errors.push(e.message));
          page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
          await page.goto(`${server.origin}/examples/${cfg.slug}-port/${cfg.query}`, { waitUntil: "domcontentloaded" });
          await page.waitForFunction((hook) => {
            const a = (window as unknown as Record<string, any>)[hook];
            if (!a) return false;
            return typeof a.ready === "function" ? a.ready() === true : a.ready === true;
          }, cfg.hook, { timeout: 900_000 });
          for (const step of cfg.steps) {
            await page.evaluate(({ hook, drive }) => {
              const api = (window as unknown as Record<string, any>)[hook];
              // eslint-disable-next-line no-new-func
              return new Function("api", drive)(api);
            }, { hook: cfg.hook, drive: step.drive });
            await raf(page, 3);
            const tag = `${step.name}${loads > 1 ? `.l${load}` : ""}`;
            emit(cfg.slug, `${tag}.a`, await page.screenshot({ type: "jpeg", quality: 92 }));
            await raf(page, 6);
            emit(cfg.slug, `${tag}.b`, await page.screenshot({ type: "jpeg", quality: 92 }));
            const st = await page.evaluate((hook) => {
              const a = (window as unknown as Record<string, any>)[hook];
              try { const s = typeof a.snapshot === "function" ? a.snapshot() : a.state; return JSON.stringify(s)?.slice(0, 1200) ?? null; } catch (e) { return `ERR ${String(e)}`; }
            }, cfg.hook);
            process.stdout.write(`@@FCSTATE ${cfg.slug} ${tag} ${st}\n`);
          }
          await page.close();
        }
        process.stdout.write(`@@FCERRORS ${cfg.slug} ${JSON.stringify(errors.slice(0, 6))}\n`);
        expect(errors.length).toBeLessThan(50);
      });
    }
  });
}
