import { describe, expect, it } from "vitest";
import {
  animation,
  createAnimationEpisodePackageManifest,
  createAnimationMotionQualityReport,
  createAnimationRouteProof,
  validateAnimationEpisodePackage,
  type AnimationEpisodePackageFile
} from "../../../packages/engine/src";

const generatedAt = "2026-06-06T00:00:00.000Z";

describe("animation episode package", () => {
  it("validates a complete review package", () => {
    const manifest = animation.episodePackage({
      episodeId: "moon-garden-001",
      packageId: "moon-garden-001-review",
      generatedAt,
      rootPath: "dist/episodes/moon-garden-001",
      publishTarget: "review",
      files: completeFiles(),
      routeProof: passingRouteProof(),
      motionQuality: passingMotionQuality(),
      visualAcceptanceStatus: "pass",
      assetProvenanceStatus: "pass"
    });
    const report = validateAnimationEpisodePackage(manifest);

    expect(manifest).toMatchObject({
      artifact: "animation-episode-package",
      schemaVersion: "aura3d-animation-episode-package/v1"
    });
    expect(report.status).toBe("pass");
    expect(report.missingRoles).toHaveLength(0);
    expect(report.emptyRoles).toHaveLength(0);
  });

  it("fails incomplete packages and source-only output", () => {
    const manifest = createAnimationEpisodePackageManifest({
      episodeId: "moon-garden-001",
      packageId: "bad-package",
      rootPath: "dist/episodes/moon-garden-001",
      publishTarget: "publish",
      files: completeFiles().filter((file) => file.role !== "captions-srt" && file.role !== "motion-quality-json"),
      routeProof: passingRouteProof(),
      motionQuality: passingMotionQuality(),
      visualAcceptanceStatus: "missing",
      assetProvenanceStatus: "pass",
      sourceOnly: true,
      notTrue3D: true
    });
    const report = validateAnimationEpisodePackage(manifest);

    expect(report.status).toBe("fail");
    expect(report.missingRoles).toEqual(expect.arrayContaining(["captions-srt", "motion-quality-json"]));
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "animation-episode-package-captions-srt-missing",
        "animation-episode-package-motion-quality-json-missing",
        "animation-episode-package-source-only",
        "animation-episode-package-visual-acceptance-missing"
      ])
    );
  });

  it("requires a real video artifact and nonempty required files", () => {
    const files = completeFiles()
      .filter((file) => file.role !== "video-webm")
      .map((file) => file.role === "thumbnail" ? { ...file, byteLength: 0 } : file);
    const report = validateAnimationEpisodePackage(createAnimationEpisodePackageManifest({
      episodeId: "moon-garden-001",
      packageId: "empty-package",
      rootPath: "dist/episodes/moon-garden-001",
      publishTarget: "review",
      files,
      routeProof: passingRouteProof(),
      motionQuality: passingMotionQuality(),
      visualAcceptanceStatus: "pass",
      assetProvenanceStatus: "pass"
    }));

    expect(report.status).toBe("fail");
    expect(report.missingRoles).toContain("video-webm");
    expect(report.emptyRoles).toContain("thumbnail");
  });
});

function completeFiles(): readonly AnimationEpisodePackageFile[] {
  return [
    file("video-webm", "episode.webm", 1_200_000, "video/webm"),
    file("thumbnail", "thumbnail.png", 80_000, "image/png"),
    file("captions-vtt", "captions.vtt", 900, "text/vtt"),
    file("captions-srt", "captions.srt", 900, "application/x-subrip"),
    file("metadata-json", "metadata.json", 1200, "application/json"),
    file("prompt-animation-evidence-json", "prompt-animation-evidence.json", 3000, "application/json"),
    file("route-proof-json", "route-proof.json", 2400, "application/json"),
    file("asset-provenance-json", "asset-provenance.json", 2100, "application/json"),
    file("render-manifest-json", "render-manifest.json", 1800, "application/json"),
    file("visual-acceptance-json", "visual-acceptance.json", 1600, "application/json"),
    file("motion-quality-json", "motion-quality.json", 1400, "application/json"),
    file("review-package-md", "review-package.md", 2200, "text/markdown")
  ];
}

function file(
  role: AnimationEpisodePackageFile["role"],
  path: string,
  byteLength: number,
  mimeType: string
): AnimationEpisodePackageFile {
  return { role, path: `dist/episodes/moon-garden-001/${path}`, present: true, byteLength, mimeType, sha256: `sha256-${role}` };
}

function passingRouteProof() {
  return createAnimationRouteProof({
    episodeId: "moon-garden-001",
    route: "/animation/moon-garden-001",
    duration: 60,
    frameRate: 30,
    assets: [
      { id: "miko", role: "character", typedAsset: true, source: "aura-assets", ready: true },
      { id: "luma", role: "character", typedAsset: true, source: "aura-assets", ready: true },
      { id: "moonGarden", role: "set", typedAsset: true, source: "aura-assets", ready: true }
    ],
    shots: [{
      id: "shot-1",
      startTime: 0,
      endTime: 4,
      expectedCharacterIds: ["miko", "luma"],
      visibleCharacterIds: ["miko", "luma"],
      captionIds: ["caption-1"],
      gestureIds: ["gesture-1"],
      visemeCueIds: ["viseme-1"],
      nonblank: true,
      frameCount: 120,
      frameHashes: ["a", "b"]
    }],
    captions: [{ id: "caption-1", text: "Hello.", startTime: 0, endTime: 1, rendered: true }],
    visemes: [{ id: "viseme-1", characterId: "miko", startTime: 0, endTime: 1, mode: "manual", rendered: true }],
    gestures: [{ id: "gesture-1", characterId: "luma", state: "wave", startTime: 1, endTime: 2, rendered: true }],
    render: { frameCount: 1800, nonblank: true },
    playback: {
      canPlay: true,
      canPause: true,
      canScrub: true,
      canJumpShots: true,
      captionsToggle: true,
      muteToggle: true,
      reducedMotion: false,
      reducedFlash: false
    }
  });
}

function passingMotionQuality() {
  return createAnimationMotionQualityReport({
    episodeId: "moon-garden-001",
    frameRate: 30,
    frames: [
      {
        frame: 0,
        time: 0,
        frameHash: "a",
        globalDelta: 0.01,
        regions: [
          { id: "miko-mouth", kind: "mouth", characterId: "miko", visible: true, delta: 0.05, mouthDelta: 0.05 },
          { id: "miko-arm", kind: "arm", characterId: "miko", visible: true, delta: 0.04 }
        ]
      },
      {
        frame: 1,
        time: 1 / 30,
        frameHash: "b",
        globalDelta: 0.01,
        regions: [
          { id: "miko-mouth", kind: "mouth", characterId: "miko", visible: true, delta: 0.04, mouthDelta: 0.04 },
          { id: "miko-arm", kind: "arm", characterId: "miko", visible: true, delta: 0.05 }
        ]
      },
      {
        frame: 2,
        time: 2 / 30,
        frameHash: "c",
        globalDelta: 0.01,
        regions: [
          { id: "miko-mouth", kind: "mouth", characterId: "miko", visible: true, delta: 0.05, mouthDelta: 0.05 },
          { id: "miko-arm", kind: "arm", characterId: "miko", visible: true, delta: 0.06 }
        ]
      }
    ],
    segments: [{ id: "dialogue-1", kind: "dialogue", startFrame: 0, endFrame: 2, characterIds: ["miko"] }]
  });
}
