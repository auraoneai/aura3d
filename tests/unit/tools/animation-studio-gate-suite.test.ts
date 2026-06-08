import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createGateSuiteReport,
  writeGateSuiteReport
} from "../../../tools/animation-studio-gate-suite/index";

/**
 * H1 acceptance (K5): the single CI aggregator must run every user-visible-quality
 * gate on a rendered episode + its summary, and FAIL on the EXACT defects:
 * stiff/lip-only body, lingering captions, fixture (moon) fallback, mock/empty UI,
 * and a hard-coded ("fake") proof. Each test crafts a bad fixture that trips ONE
 * defect and asserts the aggregator goes red with the right gate attributed.
 */

describe("animation studio gate suite (H1 aggregator)", () => {
  it("PASSES on a clean, measured render and lists every user-visible-quality gate", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createGateSuiteReport(root, {
      summaryPath: liveSummaryRel,
      prompt: "miko and luma tend the moon garden",
      allowMoonGarden: true,
      generatedAt: "2026-06-07T00:00:00.000Z"
    });
    writeGateSuiteReport(root, report);

    expect(report.ok).toBe(true);
    expect(report.blockers).toEqual([]);
    // The aggregated gate set covers the PRD's user-visible quality dimensions.
    expect(report.gates.map((g) => g.id)).toEqual(
      expect.arrayContaining([
        "no-fake-proof",
        "rig-validity",
        "body-motion",
        "motion-quality",
        "lip-sync-timing",
        "subtitle-timing",
        "prompt-specificity",
        "visual-quality",
        "performance-budget",
        "no-fake-proof-chain"
      ])
    );
    expect(report.gates.every((g) => g.ok)).toBe(true);
    expect(existsSync(join(root, "tests/reports/animation-studio/gate-suite.json"))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(root, "tests/reports/animation-studio/gate-suite.json"), "utf8")).schema
    ).toBe("animation-studio-gate-suite/v1");
  });

  it("FAILS closed when the render did not run (no summary = no fake pass)", () => {
    const root = fixtureRoot();
    const report = createGateSuiteReport(root, { summaryPath: liveSummaryRel });
    expect(report.ok).toBe(false);
    expect(report.summaryExists).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/missing — run scripts\/render-live/);
  });

  // DEFECT 1 — stiff body / lip-only animation.
  it("FAILS on a STIFF / lip-only body (only the mouth moves)", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        for (const seek of summary.seekProofs) {
          for (const c of seek.characters) {
            c.boneRotationRanges = { jaw: 0.65, mouth: 0.5 };
            c.position = c.id === "miko" ? [-0.95, 0, 0] : [1, 0, 0];
            c.clipSource = "talk";
          }
        }
        for (const beat of summary.stagedPerformance) {
          for (const c of beat.characters) c.position = c.id === "miko" ? [-0.95, 0, 0] : [1, 0, 0];
        }
        for (const b of summary.bodyMotion) {
          b.clipSource = "talk";
          b.maxRootTranslation = 0;
          b.bodyBoneRanges = { jaw: { rangeRad: 0.65 } };
        }
      }
    });

    const report = createGateSuiteReport(root, { summaryPath: liveSummaryRel, prompt: "moon garden", allowMoonGarden: true });

    expect(report.ok).toBe(false);
    const bodyMotion = report.gates.find((g) => g.id === "body-motion");
    expect(bodyMotion?.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/\[body-motion\].*(only move their mouth|stiff body|idle\/talk fallback)/i);
  });

  // DEFECT 2 — lingering captions.
  it("FAILS on LINGERING captions (short line held far past its speech duration)", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        summary.captionProofs[0]!.start = 0;
        summary.captionProofs[0]!.end = 30; // ~8-word line held 30s
      }
    });

    const report = createGateSuiteReport(root, { summaryPath: liveSummaryRel, prompt: "moon garden", allowMoonGarden: true });

    expect(report.ok).toBe(false);
    const subtitle = report.gates.find((g) => g.id === "subtitle-timing");
    expect(subtitle?.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/\[subtitle-timing\].*lingers/i);
  });

  // DEFECT 3 — fixture (moon-garden) fallback for a non-moon prompt.
  it("FAILS on a MOON-GARDEN fixture fallback when the prompt was something else", () => {
    const root = fixtureRoot();
    // The realish fixture IS the moon cast; a robots-in-a-garage prompt must not render it.
    writeRealishRenderSummary(root);

    const report = createGateSuiteReport(root, {
      summaryPath: liveSummaryRel,
      prompt: "two robots arguing in a garage"
    });

    expect(report.ok).toBe(false);
    const prompt = report.gates.find((g) => g.id === "prompt-specificity");
    expect(prompt?.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/\[prompt-specificity\].*Moon-Garden fixture/i);
  });

  // DEFECT 4 — mock / empty UI (no real frames rendered).
  it("FAILS on a MOCK / empty UI (a representative frame PNG is missing)", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, { skipFrame: "action" });

    const report = createGateSuiteReport(root, { summaryPath: liveSummaryRel, prompt: "moon garden", allowMoonGarden: true });

    expect(report.ok).toBe(false);
    const visual = report.gates.find((g) => g.id === "visual-quality");
    expect(visual?.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/\[visual-quality\].*action\.png is missing/);
  });

  // DEFECT 5 — hard-coded ("fake") proof in the render summary.
  it("FAILS on a HARD-CODED proof (summary self-reports passed:true)", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root, {
      mutate: (summary) => {
        (summary as unknown as Record<string, unknown>).passed = true;
        (summary as unknown as Record<string, unknown>).verified = true;
      }
    });

    const report = createGateSuiteReport(root, { summaryPath: liveSummaryRel, prompt: "moon garden", allowMoonGarden: true });

    expect(report.ok).toBe(false);
    const noFake = report.gates.find((g) => g.id === "no-fake-proof");
    expect(noFake?.ok).toBe(false);
    expect(report.blockers.join("\n")).toMatch(/\[no-fake-proof\].*hard-coded "(passed|verified)"/);
  });

  it("the aggregator itself NEVER hard-codes a pass — its own report carries no forbidden flag", () => {
    const root = fixtureRoot();
    writeRealishRenderSummary(root);

    const report = createGateSuiteReport(root, { summaryPath: liveSummaryRel, prompt: "moon garden", allowMoonGarden: true });
    const serialized = JSON.stringify(report);
    // The report has `ok`, but no self-reported `passed/verified/approved` flag.
    expect(report).not.toHaveProperty("passed");
    expect(report).not.toHaveProperty("verified");
    expect(serialized).not.toMatch(/"(passed|verified|approved|qualityPass)":\s*true/);
  });
});

// ---- fixtures (same realish render-summary shape scripts/render-live.ts writes) ----

const liveSummaryRel =
  "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "aura3d-gate-suite-"));
}

interface RealishSummary {
  kind: string;
  route: string;
  framesDir: string;
  video: string;
  videoBytes: number;
  frameRate: number;
  episodeDuration: number;
  frameCount: number;
  toon: { bands: number; outline: boolean; colorGrade: boolean };
  promptText?: string;
  stagedPerformance: { shotId: string; time: number; characters: { id: string; position: number[]; clip: string }[] }[];
  captionProofs: { time: number; shotId: string; text: string; contrastRatio?: number; start?: number; end?: number }[];
  seekProofs: {
    time: number;
    drawCalls: number;
    caption?: { text: string; speakerId?: string };
    shot?: { shotId: string; presetId: string };
    characters: {
      id: string;
      position: number[];
      mouthOpenness: number;
      clipSource?: string;
      boneRotationRanges?: Record<string, number>;
    }[];
  }[];
  bodyMotion: {
    characterId: string;
    clipSource: string;
    maxRootTranslation: number;
    bodyBoneRanges: Record<string, { rangeRad: number }>;
  }[];
  mouthProof: { changedPixels: number; meanRgbDiff: number };
}

function buildRealishSummary(framesDir: string): RealishSummary {
  const beats = [
    { shotId: "shot-open", time: 0, miko: [-0.95, 0, 0], luma: [1, 0, 0], speaker: "miko", text: "Luma, the moon lilies are losing their sparkle.", start: 0, end: 3.4 },
    { shotId: "shot-mid", time: 20, miko: [-0.65, 0, 0], luma: [0.68, 0, 0], speaker: "luma", text: "I noticed the same dimming near the old well.", start: 3.6, end: 7.2 },
    { shotId: "shot-finish", time: 40, miko: [-0.3, 0, 0], luma: [0.4, 0, 0], speaker: "miko", text: "Then we follow the dimming back to its source.", start: 7.4, end: 11.0 }
  ];
  const mikoBones = { rightShoulder: 0.42, spine: 0.21, head: 0.16, jaw: 0.65, mouth: 0.5 };
  const lumaBones = { leftArm: 0.38, chest: 0.24, neck: 0.18, jaw: 0.6 };
  const seekProofs: RealishSummary["seekProofs"] = [];
  for (let s = 0; s < 60; s += 1) {
    const beat = beats[Math.min(beats.length - 1, Math.floor(s / 20))]!;
    const speaking = [0, 0.522, 0.098, 0.8, 0.2][s % 5]!;
    const mikoMouth = beat.speaker === "miko" ? speaking : 0;
    const lumaMouth = beat.speaker === "luma" ? speaking : 0;
    seekProofs.push({
      time: s,
      drawCalls: 63,
      caption: { text: beat.text, speakerId: beat.speaker },
      shot: { shotId: beat.shotId, presetId: "two-shot" },
      characters: [
        { id: "miko", position: beat.miko, mouthOpenness: mikoMouth, clipSource: beat.speaker === "miko" ? "extracted" : "procedural", boneRotationRanges: mikoBones },
        { id: "luma", position: beat.luma, mouthOpenness: lumaMouth, clipSource: beat.speaker === "luma" ? "extracted" : "procedural", boneRotationRanges: lumaBones }
      ]
    });
  }
  return {
    kind: "animation-studio-live-3d-render",
    route: "live-route.html",
    framesDir,
    video: `${framesDir.replace(/\/frames$/, "")}/episode-3d.webm`,
    videoBytes: 1_663_498,
    frameRate: 12,
    episodeDuration: 60,
    frameCount: 720,
    promptText: "miko and luma tend the moon garden",
    toon: { bands: 6, outline: true, colorGrade: true },
    stagedPerformance: beats.map((b) => ({
      shotId: b.shotId,
      time: b.time,
      characters: [
        { id: "miko", position: b.miko, clip: "Loops" },
        { id: "luma", position: b.luma, clip: "Armature|Armature.001Action" }
      ]
    })),
    captionProofs: beats.map((b) => ({ time: b.time, shotId: b.shotId, text: b.text, contrastRatio: 12.4, start: b.start, end: b.end })),
    seekProofs,
    bodyMotion: [
      { characterId: "miko", clipSource: "extracted", maxRootTranslation: 0.42, bodyBoneRanges: { rightShoulder: { rangeRad: 0.42 }, spine: { rangeRad: 0.21 }, head: { rangeRad: 0.16 }, hips: { rangeRad: 0.05 } } },
      { characterId: "luma", clipSource: "procedural", maxRootTranslation: 0.31, bodyBoneRanges: { leftUpperArm: { rangeRad: 0.38 }, chest: { rangeRad: 0.24 }, neck: { rangeRad: 0.18 } } }
    ],
    mouthProof: { changedPixels: 0, meanRgbDiff: 0 }
  };
}

function writeRealishRenderSummary(
  root: string,
  options: {
    readonly skipFrame?: "first" | "dialogue" | "action" | "final";
    readonly mutate?: (summary: RealishSummary) => void;
  } = {}
): void {
  const framesRel = "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/frames";
  const summary = buildRealishSummary(framesRel);
  if (options.mutate) options.mutate(summary);
  writeJson(root, liveSummaryRel, summary);
  for (const id of ["first", "dialogue", "action", "final"] as const) {
    if (options.skipFrame === id) continue;
    writeBytes(root, `${framesRel}/${id}.png`, 2_000);
  }
}

function writeJson(root: string, path: string, value: unknown): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeBytes(root: string, path: string, bytes: number): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, Buffer.alloc(bytes, 1));
}
