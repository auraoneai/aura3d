/**
 * C-33 step plugin `strip` (PRD-12 §9.6, T5.4): `{"strip": {"frames": 12,
 * "intervalMs": 100}}` timeline step. Captures an N-frame frame strip at fixed
 * intervals around the current action moment — feeds the side-by-side strip
 * comparisons and the `temporalFlicker` detector.
 */
import path from "node:path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: "strip",
  owner: "prd12",
  async run(page, step, ctx) {
    const d = step.strip ?? {};
    const frames = d.frames ?? 12;
    const intervalMs = d.intervalMs ?? 100;
    const files = [];
    for (let i = 0; i < frames; i++) {
      const file = path.join(ctx.outDir, `strip-${String(i).padStart(2, "0")}.png`);
      await page.screenshot({ path: file, type: "png", timeout: 20_000, animations: "allow" });
      files.push(file);
      if (i < frames - 1) await sleep(intervalMs);
    }
    ctx.log(`strip: ${frames} frames @ ${intervalMs}ms`);
    return { files, data: { frames, intervalMs } };
  }
};
