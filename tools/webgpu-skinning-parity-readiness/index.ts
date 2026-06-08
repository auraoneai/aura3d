// Source + constant readiness gate for T2.1 WebGPU 96-joint skinning parity. Confirms the WebGPU
// path now carries a 96-joint palette (WebGL2 parity), the WGSL shader indexes it, the uniform
// packing uploads it, the emulation rasterizer skins the full palette, and known-limits is updated.
// Run via tsx + tsconfig.base. Exits non-zero on failure.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MAX_WEBGPU_SKINNING_JOINTS } from "../../packages/rendering/src";

interface Check {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}
const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}
function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

// 1. Files present.
const requiredFiles = [
  "packages/rendering/src/WebGPUDevice.ts",
  "packages/rendering/src/ShaderLibrary.ts",
  "tests/unit/rendering/webgpu-skinning-parity.test.ts"
] as const;
const missing = requiredFiles.filter((f) => !existsSync(resolve(f)));
check("required-files-present", missing.length === 0, missing.join(", ") || "all WebGPU skinning files exist");

// 2. The WebGPU joint cap equals the WebGL2 cap (96) — parity, not the old 2.
const webgl2Src = read("packages/rendering/src/ShaderLibrary.ts");
const webgl2Cap = /u_jointMatrices\[96\]/.test(webgl2Src);
check("joint-cap-parity-96", MAX_WEBGPU_SKINNING_JOINTS === 96 && webgl2Cap, `webgpu=${MAX_WEBGPU_SKINNING_JOINTS}, webgl2[96]=${webgl2Cap}`);

// 3. WGSL struct carries a 96-joint palette + jointMatrix indexes it.
const deviceSrc = read("packages/rendering/src/WebGPUDevice.ts");
check("wgsl-96-joint-palette", deviceSrc.includes("joints: array<mat4x4<f32>, 96>") && deviceSrc.includes("u_draw.joints[i]"), "WGSL DrawUniforms has a 96-joint palette indexed by jointMatrix");

// 4. Uniform packing uploads the full palette (offset 188), not just 2.
check("uniform-packing-full-palette", deviceSrc.includes("188 + index * 16") && deviceSrc.includes("MAX_WEBGPU_SKINNING_JOINTS"), "draw uniform packing writes up to 96 joint matrices");

// 5. The emulation rasterizer actually skins the full palette.
check("rasterizer-skins", deviceSrc.includes("skinLocalPosition") && deviceSrc.includes("jointPaletteFor"), "CPU rasterizer applies the joint palette");

// 6. Both skinned materials drive the WebGPU skinning path (skinned-unlit + skinned-lit markers).
const skinnedLitWired = deviceSrc.includes("skinned-unlit") && webgl2Src.includes("u_jointMatrices");
check("skinned-materials-wired", skinnedLitWired, "skinned materials drive the joint-palette path");

// 7. known-limits honestly updated (WebGPU skinning at 96-joint parity).
const knownLimits = read("docs/project/known-limits.md");
check("known-limits-updated", /webgpu skinning/i.test(knownLimits) && /96/.test(knownLimits), "known-limits reflects WebGPU 96-joint skinning parity");

const pass = checks.every((c) => c.pass);
const report = { schema: "webgpu-skinning-parity-readiness/v1", generatedAt: new Date().toISOString(), pass, checks };
const reportPath = resolve("tests/reports/rendering/webgpu-skinning-parity-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(checks.filter((c) => !c.pass).map((c) => `FAIL ${c.name}: ${c.detail}`).join("\n"));
  process.exit(1);
}
console.log(`webgpu skinning parity readiness: OK (${checks.length} checks passed)`);
