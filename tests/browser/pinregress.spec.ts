import { readFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";

// Remote runs cannot forward env vars into the container: options come from an optional JSON file shipped in the build context.
const CFG: Record<string, string> = (() => {
  try { return JSON.parse(readFileSync(new URL("./pinregress-config.json", import.meta.url), "utf8")) as Record<string, string>; } catch { return {}; }
})();
const opt = (k: string): string | undefined => process.env[k] ?? CFG[k];

/**
 * Regression probe: Cross Hop and Iron Crown rendered an almost black 3D canvas on production 4.1.0 after the blanket
 * qualityRebuild pin was removed. This matrix loads the DEPLOYED (or locally served) page with the guard disabled
 * (`heal=0`; a variant named `guard*` keeps the guard on and records the final `a3d-qr` and `__AURA3D_HEAL__`) under different `a3d-qr` flag lists and prints one PINREG_JSON line per variant: luma statistics of the
 * whole screenshot, console messages and the ?diag=1 panel text, so the flag (or engine feature) that matters is visible.
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const SLUGS = (opt("PINREG_SLUGS") ?? "cross-hop,iron-crown").split(",");
const BOOT_MS = Number(opt("PINREG_BOOT_MS") ?? 20000);
const VARIANTS: ReadonlyArray<[string, string]> = (opt("PINREG_VARIANTS") ?? "default:,oldpin:game|-compiler|-post|-vfxFog,nopost:game|-post,nocompiler:game|-compiler,novfx:game|-vfxFog")
  .split(",")
  .map((v) => {
    const [name, qr = ""] = v.split(":");
    return [name!, qr.replaceAll("|", ",")];
  });

async function stats(lab: Page, png: Buffer): Promise<{ nonBlack: number; mean: number; max: number; colors: number }> {
  return lab.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nb = 0, s = 0, mx = 0; const n = d.length / 4; const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (l > 8) nb++;
      if (l > mx) mx = l;
      s += l;
      seen.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3));
    }
    return { nonBlack: nb / n, mean: s / n, max: mx, colors: seen.size };
  }, png.toString("base64"));
}

for (const slug of SLUGS) {
  test(`pinregress ${slug}`, async ({ browser }) => {
    test.setTimeout(1_500_000);
    const lab = await (await browser.newContext()).newPage();
    await lab.goto("about:blank");
    for (const [name, qr] of VARIANTS) {
      const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
      const page = await ctx.newPage();
      const logs: string[] = [];
      page.on("console", (m) => {
        const t = m.text();
        if (m.type() === "error" || m.type() === "warning" || /AURA3D|SAFETY|SHADER|CUSTOM|diagnostic|drawCalls|fail/i.test(t)) logs.push(`${m.type()}: ${t.slice(0, 220)}`);
      });
      page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 220)}`));
      const healParam = name.startsWith("guard") ? "" : "heal=0&";
      const url = `${BASE}/apps/showcase-${slug}/?${healParam}diag=1${qr ? `&a3d-qr=${encodeURIComponent(qr)}` : ""}${opt("PINREG_EXTRA") ?? ""}`;
      const rec: Record<string, unknown> = { slug, variant: name, url };
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(BOOT_MS);
        const png = await page.screenshot({ type: "png", timeout: 180_000 });
        rec.stats = await stats(lab, png);
        if (opt("PINREG_IMG") === "1") {
          const jpg = await page.screenshot({ type: "jpeg", quality: 55, timeout: 180_000 });
          console.log(`PINREG_IMG ${slug} ${name} ${jpg.toString("base64")}`);
        }
        rec.readyMs = await page.evaluate(() => {
          const r = (window as unknown as Record<string, unknown>).__AURA3D_ROUTE_READY__;
          return typeof r === "object" && r !== null ? JSON.stringify(r).slice(0, 160) : String(r);
        });
        rec.diag = await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll("div,pre")).find((e) => (e.textContent ?? "").includes("port diagnostics"));
          return (el?.textContent ?? "").replace(/\s+/g, " ").slice(0, 900);
        });
        rec.finalQr = await page.evaluate(() => ({ qr: new URL(location.href).searchParams.get("a3d-qr"), heal: (window as unknown as { __AURA3D_HEAL__?: unknown }).__AURA3D_HEAL__ ?? null }));
        rec.game = await page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          const g = w.__AURA3D_GAME__ as { state?: string } | undefined;
          return { state: g?.state ?? null, keys: Object.keys(w).filter((k) => k.startsWith("__AURA")).slice(0, 12) };
        });
      } catch (e) {
        rec.error = String((e as Error).message).slice(0, 200);
      }
      rec.logs = [...new Set(logs)].slice(0, 14);
      console.log(`PINREG_JSON ${JSON.stringify(rec)}`);
      await ctx.close();
    }
  });
}
