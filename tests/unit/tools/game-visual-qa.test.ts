import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface VisualQaModule {
  validateGameVisualQa(input: {
    readonly route: { readonly id: string; readonly gameTemplateStatus: { readonly category: string } };
    readonly routeHealth: Record<string, unknown>;
    readonly root?: string;
    readonly pngMetrics?: Record<string, unknown>;
  }): { readonly pass: boolean; readonly blockers: readonly string[]; readonly checks: readonly { readonly id: string; readonly verdict: string }[] };
  writeGameVisualQaReport(input: {
    readonly route: { readonly id: string; readonly gameTemplateStatus: { readonly category: string } };
    readonly routeHealth: Record<string, unknown>;
    readonly root?: string;
  }, outputPath?: string): { readonly pass: boolean; readonly routeId: string; readonly checks: readonly { readonly id: string; readonly verdict: string }[] };
}
const modulePromise = import(pathToFileURL(join(process.cwd(), "tools/showcase-library/game-visual-qa.mjs")).href) as Promise<VisualQaModule>;
const routeId = "showcase-public-racing-presentation-proof";
const route = { id: routeId, gameTemplateStatus: { category: "racing" } } as const;
const routeHealth = JSON.parse(readFileSync(`apps/${routeId}/route-health.json`, "utf8")) as Record<string, unknown>;

describe("game visual QA", () => {
  it("passes all six checks for current retained public racing evidence", async () => {
    const result = (await modulePromise).validateGameVisualQa({ route, routeHealth });
    expect(result.pass).toBe(true);
    expect(result.checks.map((check) => [check.id, check.verdict])).toEqual([
      ["subject-bound-to-surface", "pass"], ["contact", "pass"], ["camera-readability", "pass"],
      ["scale-contract", "pass"], ["debug-guide-absence", "pass"], ["hud-occlusion-budget", "pass"]
    ]);
  });


  it("retains an independently inspectable six-check report", async () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-visual-qa-report-"));
    try {
      copy(`apps/${routeId}`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}.json`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}.png`, root);
      copy(`tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/${routeId}-asset-pair-composition.json`, root);
      const report = (await modulePromise).writeGameVisualQaReport({ route, routeHealth, root });
      const reportPath = join(root, `tests/reports/showcase-game-visual-qa/${routeId}.json`);
      expect(report.pass).toBe(true);
      expect(existsSync(reportPath)).toBe(true);
      expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({
        routeId,
        verdict: "pass",
        pass: true,
        checks: expect.arrayContaining([expect.objectContaining({ id: "hud-occlusion-budget", verdict: "pass" })])
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
    function copy(relativePath: string, root: string): void {
      const target = join(root, relativePath); cpSync(relativePath, target, { recursive: true });
    }
  });

  it("rejects synthetic clipped, unreadable screenshot metrics", async () => {
    const result = (await modulePromise).validateGameVisualQa({
      route,
      routeHealth,
      pngMetrics: {
        width: 1440, height: 900, crop: { x: 0, y: 0, width: 1440, height: 900 },
        foregroundBounds: { x: 0, y: 0, width: 1440, height: 900 }, clipped: true,
        nonBlankPixels: 1, colorBuckets: 1, nonBackgroundRatio: 0, readabilityScore: 1
      }
    });
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "hud-occlusion-budget:hud-subject-clipped",
      "hud-occlusion-budget:hud-readability:1",
      "hud-occlusion-budget:hud-foreground-area:1"
    ]));
  });

  it("rejects route-primary evidence after route source becomes stale", async () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-visual-qa-"));
    try {
      copy(`apps/${routeId}`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}.json`, root);
      copy(`tests/reports/showcase-route-primary-probes/${routeId}.png`, root);
      copy(`tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/${routeId}-asset-pair-composition.json`, root);
      const mainPath = join(root, `apps/${routeId}/src/main.ts`);
      writeFileSync(mainPath, `${readFileSync(mainPath, "utf8")}\n// stale mutation\n`);
      const result = (await modulePromise).validateGameVisualQa({ route, routeHealth, root });
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain("route-primary-source-stale");
    } finally { rmSync(root, { recursive: true, force: true }); }
    function copy(relativePath: string, root: string): void {
      const target = join(root, relativePath); cpSync(relativePath, target, { recursive: true });
    }
  });
});
