/**
 * `aura3d assets lookdev <id...>` — PRD-05 §6.7.
 *
 * Dispatches the `asset-lookdev.yml` workflow (apps/asset-lookdev on
 * macos-14/ANGLE-Metal): contact sheet, debug views, gameplay captures and
 * `metrics.json` per asset, uploaded as the run's artifacts. Local capture
 * stays in Playwright via `pnpm --filter @aura3d/asset-lookdev capture`;
 * this verb is the recorded-on-manifest path.
 *
 * No gh auth on the box is required to *use* the verb: when `gh` is
 * unavailable the command prints the workflow URL so the run can be
 * dispatched by hand, and returns 2.
 */
import { execFileSync } from "node:child_process";
import { readAssetManifest, writeAssetManifest } from "../../asset-manifest.js";

const WORKFLOW = "asset-lookdev.yml";

export interface LookdevDispatchOptions {
  readonly projectDir: string;
  readonly assetIds: readonly string[];
  readonly group?: string;
  readonly stage?: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export function dispatchLookdevRun(options: LookdevDispatchOptions): { readonly ok: boolean; readonly runUrl?: string; readonly message: string } {
  const { stdout, stderr } = options;
  const manifest = readAssetManifest(options.projectDir);
  const missing = options.assetIds.filter((id) => !manifest.assets.some((asset) => asset.id === id));
  if (missing.length > 0) {
    const message = `assets lookdev: unknown ids ${missing.join(", ")} (not in aura.assets.json).`;
    stderr(message);
    return { ok: false, message };
  }
  try {
    execFileSync("gh", ["--version"], { stdio: "pipe" });
  } catch {
    const message = `assets lookdev: \`gh\` is not installed — dispatch ${WORKFLOW} manually with inputs assets=${options.assetIds.join(",")}.`;
    stderr(message);
    return { ok: false, message };
  }
  try {
    const inputs = ["-f", `assets=${options.assetIds.join(",")}`];
    if (options.group) inputs.push("-f", `group=${options.group}`);
    if (options.stage) inputs.push("-f", `stage=${options.stage}`);
    execFileSync("gh", ["workflow", "run", WORKFLOW, ...inputs], { stdio: "pipe" });
    const runs = execFileSync("gh", ["run", "list", "--workflow", WORKFLOW, "--limit", "1", "--json", "url"], { encoding: "utf8" });
    const runUrl = (JSON.parse(runs) as { url?: string }[])[0]?.url;
    stdout(`assets lookdev: dispatched ${WORKFLOW} for ${options.assetIds.join(", ")}${runUrl ? ` — ${runUrl}` : ""}`);
    // Record the dispatch on each entry so `assets review`/`assets admit`
    // can bind the look-dev record when the run's artifacts are committed.
    const next = {
      ...manifest,
      assets: manifest.assets.map((asset) =>
        options.assetIds.includes(asset.id)
          ? {
              ...asset,
              lookDev: {
                ...(asset.lookDev ?? { reviews: [] }),
                runUrl: runUrl ?? asset.lookDev?.runUrl ?? "",
                stageVersion: options.stage ?? asset.lookDev?.stageVersion ?? "1",
              },
            }
          : asset,
      ),
    };
    writeAssetManifest(options.projectDir, next);
    return { ok: true, runUrl, message: runUrl ?? "dispatched" };
  } catch (error) {
    const message = `assets lookdev: gh dispatch failed — ${error instanceof Error ? error.message : String(error)}`;
    stderr(message);
    return { ok: false, message };
  }
}
