/**
 * GPU-string guard for the quality-gate pixel specs (PRD-12 T3.9). The analytic
 * pixel specs are only meaningful on real GPU; a software rasterizer makes them
 * pass or fail for the wrong reasons, so the whole run fails here.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const GPU_RE = /SwiftShader|llvmpipe|Software/i;

export default async function qualityGateGlobalSetup(): Promise<void> {
  const probe = "tools/quality-rebuild-capture/gpu-probe.mjs";
  if (!existsSync(probe)) return;
  let renderer = "";
  try {
    const out = execFileSync(process.execPath, [probe], { encoding: "utf8" });
    renderer = JSON.parse(out.trim().split("\n").pop() ?? "{}").renderer ?? "";
  } catch {
    // Probe failure is inconclusive, not a software-GPU verdict.
    return;
  }
  if (GPU_RE.test(renderer)) {
    throw new Error(`quality-gate blocked-runner: GPU renderer "${renderer}" is a software rasterizer`);
  }
}
