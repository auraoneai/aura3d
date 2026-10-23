import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Real GPUs are stricter than the software rasteriser the remote runner uses: SwiftShader reports 32 texture image
 * units, a Mac/Metal GPU reports 16 per stage, and a program that needs more fails to link there (the draw silently
 * disappears: a black or empty scene). This wraps linkProgram on the deployed ports, records every linked program's
 * sampler and uniform-vector use, and fails any port whose programs would not link on a 16-unit device.
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const ALL = ["strange-orbit", "splat-rush", "serpentine-sky-run", "drift-and-deliver", "heatsink", "ninja-runner", "last-train", "roadster-hours", "where-the-wind-wanders", "silt-and-signal", "cloud-runner"];
const SLUGS_FILE = "tests/browser/gl-limits-slugs.txt";
const SLUGS = (process.env.LIVE_SLUGS ?? (existsSync(SLUGS_FILE) ? readFileSync(SLUGS_FILE, "utf8").replace(/\s+/g, ",") : ALL.join(",")))
  .split(",").map((x) => x.trim()).filter(Boolean);
const REAL_GPU_MAX_SAMPLERS = 16;
const REAL_GPU_MAX_FRAGMENT_VECTORS = 224;

test.use({ viewport: { width: 480, height: 270 } });

interface ProgramRecord { samplers: number; fragmentVectorsApprox: number; vertexVectorsApprox: number; uniformBlocks: number; names: string[] }

for (const slug of SLUGS) {
  test(`live port programs fit a 16-unit GPU: ${slug}`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.addInitScript(() => {
      const SAMPLER_TYPES = new Set([0x8b5e, 0x8b5f, 0x8b60, 0x8b62, 0x8dc1, 0x8dc2, 0x8dc3, 0x8dc4, 0x8dc5, 0x8dc6, 0x8dc7, 0x8dc8, 0x8dca, 0x8dcb, 0x8dcc, 0x8dd2, 0x8dd3, 0x8dd4, 0x8dd5, 0x8dd6]);
      const vectors = (type: number): number => (type === 0x8b5a || type === 0x8b65 || type === 0x8b66 ? 2 : type === 0x8b5b ? 3 : type === 0x8b5c ? 4 : 1);
      const w = window as unknown as { __glPrograms: unknown[] };
      w.__glPrograms = [];
      const proto = WebGL2RenderingContext.prototype;
      const link = proto.linkProgram;
      proto.linkProgram = function (this: WebGL2RenderingContext, program: WebGLProgram): void {
        link.call(this, program);
        if (!this.getProgramParameter(program, this.LINK_STATUS)) { w.__glPrograms.push({ failed: true, log: String(this.getProgramInfoLog(program)).slice(0, 300) }); return; }
        let samplers = 0; let vec = 0; const names: string[] = [];
        const count = this.getProgramParameter(program, this.ACTIVE_UNIFORMS) as number;
        for (let i = 0; i < count; i++) {
          const info = this.getActiveUniform(program, i);
          if (!info) continue;
          if (SAMPLER_TYPES.has(info.type)) { samplers += info.size; names.push(info.name); } else vec += vectors(info.type) * info.size;
        }
        const blocks = this.getProgramParameter(program, this.ACTIVE_UNIFORM_BLOCKS) as number;
        w.__glPrograms.push({ samplers, fragmentVectorsApprox: vec, vertexVectorsApprox: vec, uniformBlocks: blocks, names: names.slice(0, 24) });
      };
    });
    await page.goto(`${BASE}/apps/showcase-${slug}-port/`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(15_000);
    const target = await page.evaluate(() => {
      const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === "fixed";
      const el = (Array.from(document.querySelectorAll("button, [role='button']")) as HTMLButtonElement[]).find((b) => visible(b) && /start|begin|play/i.test(`${b.textContent ?? ""} ${b.id}`)) ?? null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: !!el.disabled };
    });
    if (target && !target.disabled) { await page.mouse.move(target.x, target.y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); }
    else { for (const key of ["Enter", "Space"]) { await page.keyboard.press(key); await page.waitForTimeout(300); } }
    await page.waitForTimeout(12_000);
    const programs = await page.evaluate(() => (window as unknown as { __glPrograms: unknown[] }).__glPrograms) as Array<ProgramRecord & { failed?: boolean; log?: string }>;
    const ok = programs.filter((p) => !p.failed);
    const failed = programs.filter((p) => p.failed);
    const worst = ok.reduce((a, p) => (p.samplers > a.samplers ? p : a), { samplers: 0, fragmentVectorsApprox: 0, vertexVectorsApprox: 0, uniformBlocks: 0, names: [] } as ProgramRecord);
    const worstVec = ok.reduce((m, p) => Math.max(m, p.fragmentVectorsApprox), 0);
    console.log(`GLLIMITS_JSON ${JSON.stringify({ slug, programs: programs.length, failedToLink: failed, maxSamplers: worst.samplers, worstSamplerNames: worst.names, maxUniformVectorsApprox: worstVec, overLimit: ok.filter((p) => p.samplers > REAL_GPU_MAX_SAMPLERS).length })}`);
    expect(failed, "no program fails to link").toEqual([]);
    expect(worst.samplers, `no program needs more than ${REAL_GPU_MAX_SAMPLERS} texture units (real GPUs fail to link it)`).toBeLessThanOrEqual(REAL_GPU_MAX_SAMPLERS);
    expect(worstVec, "uniform vector use stays inside a real GPU's fragment uniform budget").toBeLessThanOrEqual(REAL_GPU_MAX_FRAGMENT_VECTORS * 4);
  });
}
