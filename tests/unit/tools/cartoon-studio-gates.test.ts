import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAura3D11ReleaseReadinessReport,
  writeAura3D11ReleaseReadinessReport
} from "../../../tools/aura3d11-release-readiness/index";
import { createCartoonStudioDocsClaimsReport } from "../../../tools/cartoon-studio-docs-claims/index";
import { createCartoonStudioMotionQualityReport } from "../../../tools/cartoon-studio-motion-quality-gate/index";
import { createCartoonStudioPackageProofReport } from "../../../tools/cartoon-studio-package-proof/index";
import { createCartoonStudioTemplateSmokeReport } from "../../../tools/cartoon-studio-template-smoke/index";
import { createCartoonStudioVisualQualityReport } from "../../../tools/cartoon-studio-visual-quality-gate/index";

describe("cartoon studio 1.1 release gates", () => {
  it("validates a complete episode package", () => {
    const root = fixtureRoot();
    writeCompleteEpisodePackage(root);

    const report = createCartoonStudioPackageProofReport(root, { generatedAt: "2026-06-06T00:00:00.000Z" });

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.artifacts.map((artifact) => artifact.id)).toContain("episode-webm");
  });

  it("rejects source-only, notTrue3D, and image-puppet package evidence", () => {
    const root = fixtureRoot();
    writeCompleteEpisodePackage(root, {
      "prompt-animation-evidence.json": {
        ok: true,
        sourceOnly: true,
        route: "/?view=image-puppet",
        artifact: "tests/reports/prompt-animation/cartoon-image-puppet-animation.webm"
      },
      "route-proof.json": {
        ok: true,
        notTrue3D: true
      }
    });

    const report = createCartoonStudioPackageProofReport(root);

    expect(report.ok).toBe(false);
    expect(report.sourceIntegrity.forbiddenEvidence.map((entry) => entry.reason)).toEqual(expect.arrayContaining([
      "sourceOnly",
      "notTrue3D",
      "image-puppet"
    ]));
  });

  it("rejects global-only fake motion and accepts independent region motion", () => {
    const badRoot = fixtureRoot();
    writeCompleteEpisodePackage(badRoot, {
      "visual-acceptance.json": {
        ok: true,
        frameHashChanges: 48,
        globalMotionSegments: 6,
        independentRegionMotionSegments: 0,
        characterRegionMotionSegments: 0,
        mouthMotionSegments: 0,
        globalOnlyMotion: true,
        flatLayerMotion: true,
        sourcePixelsAnimated: true
      }
    });

    const bad = createCartoonStudioMotionQualityReport(badRoot);

    expect(bad.ok).toBe(false);
    expect(bad.blockers.join("\n")).toMatch(/global-only motion|flat-layer|mouth motion|sourcePixelsAnimated/);

    const goodRoot = fixtureRoot();
    writeCompleteEpisodePackage(goodRoot);
    const good = createCartoonStudioMotionQualityReport(goodRoot);

    expect(good.ok).toBe(true);
    expect(good.metrics.independentRegionMotionSegments).toBeGreaterThanOrEqual(2);
    expect(good.metrics.mouthMotionSegments).toBeGreaterThanOrEqual(1);
  });

  it("validates visual frame artifacts and blocks debug/chrome evidence", () => {
    const root = fixtureRoot();
    writeCompleteEpisodePackage(root, {
      "visual-acceptance.json": {
        ok: true,
        visualOk: true,
        routeChromeVisible: true,
        frames: frameList()
      }
    });

    const report = createCartoonStudioVisualQualityReport(root);

    expect(report.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/route chrome|debug overlays|proof overlays/);
  });

  it("blocks cartoon overclaims while allowing negative claim-boundary wording", () => {
    const root = fixtureRoot();
    writeText(root, "README.md", "Aura3D is not Pixar-quality automatic animation and not a magic image-to-video engine.\n");
    writeText(root, "llms.txt", "Never call image-puppet release-ready.\n");
    writeText(root, "docs/project/claim-guidelines.md", "Aura3D 1.1 is Pixar-quality automatic animation for any 2D image.\n");

    const report = createCartoonStudioDocsClaimsReport(root, { paths: ["README.md", "llms.txt", "docs"] });

    expect(report.ok).toBe(false);
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0]).toContain("Pixar-quality");
  });

  it("checks cartoon-studio template scripts and release-facing image-puppet references", () => {
    const badRoot = fixtureRoot();
    writeTemplateFixture(badRoot, {
      scripts: { build: "vite build", test: "playwright test" },
      channelPackage: { scripts: { "record:image-puppet": "playwright test tests/image-puppet-animation.spec.ts" } },
      channelReadme: "Run /?view=image-puppet and use cartoon-image-puppet-animation.webm."
    });

    const bad = createCartoonStudioTemplateSmokeReport(badRoot);

    expect(bad.ok).toBe(false);
    expect(bad.blockers.join("\n")).toMatch(/episode:render|image-puppet/);

    const goodRoot = fixtureRoot();
    writeTemplateFixture(goodRoot, {
      scripts: {
        build: "vite build",
        test: "playwright test",
        "episode:plan": "node scripts/episode-plan.mjs",
        "episode:preview": "vite --host 0.0.0.0",
        "episode:render": "node scripts/episode-render.mjs",
        "episode:package": "node scripts/episode-package.mjs",
        "episode:review": "node scripts/episode-review.mjs",
        "episode:verify": "npm run episode:render && npm run episode:package && npm run episode:review && pnpm cartoon-studio:motion-quality"
      },
      channelPackage: { scripts: { test: "playwright test tests/route-health.spec.ts" } },
      channelReadme: "Cartoon channel is source-level example documentation."
    });

    const good = createCartoonStudioTemplateSmokeReport(goodRoot);

    expect(good.ok).toBe(true);
  });

  it("aggregates package, visual, motion, docs, and template gates into readiness", () => {
    const root = fixtureRoot();
    writeCompleteEpisodePackage(root);
    writeText(root, "README.md", "Aura3D 1.1 is not Pixar-quality automatic animation.\n");
    writeText(root, "llms.txt", "Do not use image-puppet as release proof.\n");
    writeTemplateFixture(root, {
      scripts: {
        build: "vite build",
        test: "playwright test",
        "episode:plan": "node scripts/episode-plan.mjs",
        "episode:preview": "vite --host 0.0.0.0",
        "episode:render": "node scripts/episode-render.mjs",
        "episode:package": "node scripts/episode-package.mjs",
        "episode:review": "node scripts/episode-review.mjs",
        "episode:verify": "npm run episode:render && npm run episode:package && npm run episode:review && pnpm cartoon-studio:visual-quality"
      },
      channelPackage: { scripts: { test: "playwright test tests/route-health.spec.ts" } },
      channelReadme: "Historical source-only example. Not publish-ready."
    });

    const report = createAura3D11ReleaseReadinessReport(root, { generatedAt: "2026-06-06T00:00:00.000Z" });
    writeAura3D11ReleaseReadinessReport(root, report);

    expect(report.ok).toBe(true);
    expect(report.gates.map((gate) => gate.id)).toEqual([
      "cartoon-package",
      "visual-quality",
      "motion-quality",
      "docs-claims",
      "template-smoke"
    ]);
    expect(existsSync(join(root, "tests/reports/aura3d11/readiness.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "tests/reports/aura3d11/readiness.json"), "utf8")).schema).toBe("aura3d11-release-readiness/v1");
  });
});

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "aura3d11-cartoon-gates-"));
}

function writeCompleteEpisodePackage(root: string, overrides: Record<string, unknown> = {}): void {
  const packageDir = "dist/episodes/moon-garden-001";
  writeBytes(root, `${packageDir}/episode.webm`, 40_000);
  writeBytes(root, `${packageDir}/thumbnail.png`, 2_000);
  writeBytes(root, `${packageDir}/frames/first.png`, 2_000);
  writeBytes(root, `${packageDir}/frames/dialogue.png`, 2_000);
  writeBytes(root, `${packageDir}/frames/action.png`, 2_000);
  writeBytes(root, `${packageDir}/frames/final.png`, 2_000);
  writeText(root, `${packageDir}/captions.vtt`, "WEBVTT\n\n00:00.000 --> 00:02.000\nThe garden glows.\n");
  writeText(root, `${packageDir}/captions.srt`, "1\n00:00:00,000 --> 00:00:02,000\nThe garden glows.\n");
  writeText(root, `${packageDir}/review-package.md`, "# Moon Garden Review\n\nRepresentative frames and motion report are ready.\n");
  const jsonDefaults: Record<string, unknown> = {
    "metadata.json": { ok: true, episodeId: "moon-garden-001", duration: 50, frameRate: 30 },
    "prompt-animation-evidence.json": { ok: true, publishReady: true, sourceOnly: false },
    "route-proof.json": { ok: true, shots: 5, notTrue3D: false },
    "asset-provenance.json": { ok: true, assets: [{ id: "miko", license: "CC0-1.0", checksum: "sha256:abc" }] },
    "render-manifest.json": { ok: true, frameHashChanges: 24, frameCount: 1500, cameraMotionDeclared: true },
    "visual-acceptance.json": {
      ok: true,
      visualOk: true,
      publishReady: true,
      visibleCharacterCount: 2,
      representativeFrameCount: 4,
      frameHashChanges: 24,
      globalMotionSegments: 2,
      independentRegionMotionSegments: 4,
      characterRegionMotionSegments: 3,
      mouthMotionSegments: 2,
      cameraMotionDeclared: true,
      frames: frameList()
    }
  };
  for (const [file, value] of Object.entries({ ...jsonDefaults, ...overrides })) {
    writeJson(root, `${packageDir}/${file}`, value);
  }
}

function frameList() {
  return [
    { id: "first", path: "dist/episodes/moon-garden-001/frames/first.png" },
    { id: "dialogue", path: "dist/episodes/moon-garden-001/frames/dialogue.png" },
    { id: "action", path: "dist/episodes/moon-garden-001/frames/action.png" },
    { id: "final", path: "dist/episodes/moon-garden-001/frames/final.png" }
  ];
}

function writeTemplateFixture(
  root: string,
  options: {
    readonly scripts: Record<string, string>;
    readonly channelPackage: { readonly scripts: Record<string, string> };
    readonly channelReadme: string;
  }
): void {
  writeJson(root, "packages/create-aura3d/templates/cartoon-studio/package.json", {
    name: "aura3d-cartoon-studio",
    scripts: options.scripts
  });
  writeText(
    root,
    "packages/create-aura3d/templates/cartoon-studio/src/main.ts",
    `import { createAuraApp, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";
createAuraApp("#app", { scene: scene().add(model(assets.miko)).add(model(assets.luma)).add(model(assets.moonGarden)) });
`
  );
  writeText(root, "packages/create-aura3d/templates/cartoon-studio/src/render-plan.ts", "export const renderPlan = { publishReady: true, sourceOnly: false };\n");
  writeText(root, "packages/create-aura3d/templates/cartoon-studio/README.md", "Use typed miko, luma, and moonGarden assets.\n");
  writeJson(root, "packages/create-aura3d/templates/cartoon-studio/aura.assets.json", {
    schema: "aura3d.assets/1.0",
    assetBasePath: "/aura-assets/",
    outputDir: "public/aura-assets",
    typegen: "src/aura-assets.ts",
    assets: []
  });
  writeJson(root, "packages/create-aura3d/templates/cartoon-channel/package.json", options.channelPackage);
  writeText(root, "packages/create-aura3d/templates/cartoon-channel/README.md", options.channelReadme);
}

function writeJson(root: string, path: string, value: unknown): void {
  writeText(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root: string, path: string, value: string): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, value, "utf8");
}

function writeBytes(root: string, path: string, bytes: number): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, Buffer.alloc(bytes, 1));
}
