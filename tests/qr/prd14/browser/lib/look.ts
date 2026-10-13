// tests/qr/prd14/browser/lib/look.ts — T2.2-post: the look the renderer
// actually applied (C-31 `diagnostics().appliedLook`) must equal the look the
// route declares: the `setOutput({ preset, toneMapping? })` call in its v2
// boot, resolved through the PRD-03 post-preset table, at the exposure its
// `art/direction.ts` authors (2^lighting.exposureEV).
import { expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prd03PostPresets } from "../../../../../packages/engine/src/agent-api/postPresets";
import { APPS } from "./serve";

export interface DeclaredLook {
  readonly preset: string;
  readonly toneMapping: string;
  readonly exposure: number;
}

/** Report names vs preset names: the renderer reports ACES as "aces-filmic". */
function normalizeToneMapping(name: string): string {
  return name === "aces" ? "aces-filmic" : name;
}

export async function declaredLook(appDir: string): Promise<DeclaredLook> {
  const v2BootPath = join(APPS, appDir, "src", "v2", "boot.ts");
  const mainPath = join(APPS, appDir, "src", "main.ts");
  const bootPath = existsSync(v2BootPath) ? v2BootPath : mainPath;
  const boot = readFileSync(bootPath, "utf8");
  const call = /setOutput\?\.\(\{\s*preset:\s*"([a-z-]+)"(?:,\s*toneMapping:\s*"([a-z-]+)")?/.exec(boot);
  expect(call, `${appDir}: ${existsSync(v2BootPath) ? "v2/boot.ts" : "main.ts"} has no setOutput({ preset }) call`).not.toBeNull();
  const preset = call![1]!;
  const table = prd03PostPresets as unknown as Record<string, { output: { toneMapping: string } } | undefined>;
  expect(table[preset], `${appDir}: unknown post preset "${preset}"`).toBeDefined();
  const mod = (await import(join(APPS, appDir, "art", "direction.ts"))) as { default?: { lighting?: { exposureEV?: number } } };
  const ev = mod.default?.lighting?.exposureEV ?? 0;
  return {
    preset,
    toneMapping: normalizeToneMapping(call![2] ?? table[preset]!.output.toneMapping),
    exposure: 2 ** ev
  };
}

/** Asserts the runtime C-31 report matches the route's declared look. */
export async function expectRuntimeMatchesDeclared(appDir: string, runtime: unknown): Promise<void> {
  const want = await declaredLook(appDir);
  const got = runtime as { toneMapping?: string; exposure?: number } | null;
  expect(got, `${appDir}: renderer reports no appliedLook (C-31)`).not.toBeNull();
  expect(got!.toneMapping, `${appDir}: runtime toneMapping vs preset "${want.preset}"`).toBe(want.toneMapping);
  expect(got!.exposure, `${appDir}: runtime exposure vs 2^exposureEV`).toBeCloseTo(want.exposure, 4);
}
