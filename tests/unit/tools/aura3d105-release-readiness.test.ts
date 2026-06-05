import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAura3D105ReleaseReadinessReport,
  writeAura3D105ReleaseReadinessReport
} from "../../../tools/aura3d105-release-readiness/index";

const runtimeReports = [
  "tests/reports/aura3d104/typecheck.json",
  "tests/reports/aura3d104/build.json",
  "tests/reports/game-runtime/release.json"
] as const;

const animationReports = [
  "tests/reports/animation-runtime/unit.json",
  "tests/reports/animation-runtime/browser.json",
  "tests/reports/animation-runtime/evidence.json",
  "tests/reports/animation-runtime/package-smoke.json"
] as const;

const editorReports = [
  "tests/reports/editor-tools/unit.json",
  "tests/reports/editor-tools/browser.json",
  "tests/reports/editor-tools/evidence.json",
  "tests/reports/editor-tools/package-smoke.json"
] as const;

const visualReports = [
  "tests/reports/visual-scripting/unit.json",
  "tests/reports/visual-scripting/browser.json",
  "tests/reports/visual-scripting/evidence.json",
  "tests/reports/visual-scripting/package-smoke.json"
] as const;

const templateReports = [
  "tests/reports/templates/fighting-game-smoke.json",
  "tests/reports/templates/cartoon-channel-smoke.json",
  "tests/reports/templates/prompt-cartoon-channel-smoke.json"
] as const;

const requiredScreenshots = [
  "tests/reports/animation-runtime/named-clip-playback.png",
  "tests/reports/animation-runtime/clip-restart.png",
  "tests/reports/animation-runtime/clip-blend.png",
  "tests/reports/animation-runtime/animation-event-hitbox.png",
  "tests/reports/animation-runtime/viseme-blendshape-sync.png",
  "tests/reports/editor-tools/editor-selection-inspector.png",
  "tests/reports/editor-tools/editor-timeline-scrub.png",
  "tests/reports/editor-tools/editor-visual-graph.png",
  "tests/reports/visual-scripting/runtime-node-motion.png",
  "tests/reports/visual-scripting/animation-event-graph.png",
  "tests/reports/templates/fighting-game-first-frame.png",
  "tests/reports/templates/cartoon-channel-first-frame.png",
  "tests/reports/templates/prompt-cartoon-channel-first-frame.png"
] as const;

describe("Aura3D 1.0.5 release readiness verifier", () => {
  it("blocks missing 1.0.5 reports and screenshots", () => {
    const repoRoot = fixtureRoot();

    const report = createAura3D105ReleaseReadinessReport({ repoRoot, generatedAt: "2026-06-04T00:00:00.000Z" });

    expect(report.ok).toBe(false);
    expect(report.status).toBe("release-blocked");
    expect(report.missingReports).toEqual(expect.arrayContaining([
      "tests/reports/animation-runtime/unit.json",
      "tests/reports/editor-tools/browser.json",
      "tests/reports/visual-scripting/evidence.json",
      "tests/reports/assets/provenance.json",
      "tests/reports/templates/fighting-game-smoke.json"
    ]));
    expect(report.missingScreenshots).toEqual(expect.arrayContaining([
      "tests/reports/animation-runtime/named-clip-playback.png",
      "tests/reports/editor-tools/editor-selection-inspector.png",
      "tests/reports/visual-scripting/runtime-node-motion.png",
      "tests/reports/templates/fighting-game-first-frame.png"
    ]));
  });

  it("does not treat pending or releaseReady false reports as passing evidence", () => {
    const repoRoot = fixtureRoot();
    writeJson(repoRoot, "tests/reports/animation-runtime/unit.json", { ok: true, status: "pending-execution" });
    writeJson(repoRoot, "tests/reports/animation-runtime/browser.json", { ok: true, releaseReady: false });

    const report = createAura3D105ReleaseReadinessReport({
      repoRoot,
      areas: ["animation-runtime"],
      generatedAt: "2026-06-04T00:00:00.000Z"
    });

    expect(report.ok).toBe(false);
    expect(report.failingReports).toEqual(expect.arrayContaining([
      "tests/reports/animation-runtime/unit.json",
      "tests/reports/animation-runtime/browser.json"
    ]));
    expect(report.areas[0]?.requiredReports.find((entry) => entry.path.endsWith("unit.json"))).toMatchObject({
      ok: false,
      status: "pending"
    });
    expect(report.areas[0]?.requiredReports.find((entry) => entry.path.endsWith("browser.json"))).toMatchObject({
      ok: false,
      status: "release-not-ready"
    });
  });

  it("requires concrete asset provenance rather than placeholder source claims", () => {
    const repoRoot = fixtureRoot();
    writeJson(repoRoot, "tests/reports/assets/provenance.json", {
      ok: true,
      assets: [
        {
          name: "placeholderFighter",
          source: "https://example.com/todo.glb",
          license: "unknown",
          sha256: "sha256:abc"
        }
      ]
    });

    const report = createAura3D105ReleaseReadinessReport({
      repoRoot,
      areas: ["assets"],
      generatedAt: "2026-06-04T00:00:00.000Z"
    });

    expect(report.ok).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("missing valid license evidence"),
      expect.stringContaining("placeholder evidence")
    ]));
  });

  it("passes and writes a report when all required evidence is present and passing", () => {
    const repoRoot = fixtureRoot();
    for (const path of [...runtimeReports, ...animationReports, ...editorReports, ...visualReports, ...templateReports]) {
      writeJson(repoRoot, path, { ok: true, status: "pass" });
    }
    writeJson(repoRoot, "tests/reports/assets/provenance.json", {
      ok: true,
      assets: [
        {
          typedName: "fighter",
          source: "assets/fighter.glb",
          license: "CC0-1.0",
          sha256: "sha256:abc123"
        },
        {
          typedName: "arena",
          sourcePath: "assets/arena.glb",
          spdx: "CC-BY-4.0",
          checksum: "sha256:def456"
        }
      ]
    });
    for (const path of requiredScreenshots) writePng(repoRoot, path);

    const report = createAura3D105ReleaseReadinessReport({
      repoRoot,
      reportPath: "tests/reports/aura3d105/release.json",
      generatedAt: "2026-06-04T00:00:00.000Z"
    });
    writeAura3D105ReleaseReadinessReport(report, repoRoot);

    const writtenPath = join(repoRoot, "tests/reports/aura3d105/release.json");
    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(existsSync(writtenPath)).toBe(true);
    expect(JSON.parse(readFileSync(writtenPath, "utf8")).schema).toBe("aura3d105-release-readiness");
  });
});

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "aura3d105-readiness-"));
}

function writeJson(repoRoot: string, path: string, value: unknown): void {
  const absolutePath = join(repoRoot, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writePng(repoRoot: string, path: string): void {
  const absolutePath = join(repoRoot, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00
  ]));
}
