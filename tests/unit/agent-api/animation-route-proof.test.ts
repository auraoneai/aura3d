import { describe, expect, it } from "vitest";
import {
  animation,
  createAnimationRouteProof,
  validateAnimationRouteProof,
  type AnimationRouteProofAsset,
  type AnimationRouteProofGesture,
  type AnimationRouteProofShot,
  type AnimationRouteProofViseme
} from "../../../packages/engine/src";

const generatedAt = "2026-06-06T00:00:00.000Z";

describe("animation route proof", () => {
  it("creates a stable passing proof for a typed rendered route", () => {
    const proof = animation.routeProof({
      episodeId: "moon-garden-001",
      generatedAt,
      route: "/animation/moon-garden-001",
      duration: 60,
      frameRate: 30,
      assets: readyAssets(),
      shots: readyShots(),
      captions: [{
        id: "caption-1",
        lineId: "line-1",
        text: "The moon weeds are glowing!",
        startTime: 1,
        endTime: 3,
        rendered: true
      }],
      visemes: readyVisemes(),
      gestures: readyGestures(),
      render: { frameCount: 1800, nonblank: true, debugOverlaysVisible: false, routeChromeVisible: false },
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

    expect(proof).toMatchObject({
      artifact: "animation-route-proof",
      schemaVersion: "aura3d-animation-route-proof/v1",
      status: "pass"
    });
    expect(proof.checks.every((check) => check.passed)).toBe(true);
    expect(validateAnimationRouteProof(proof)).toHaveLength(0);
  });

  it("fails source-only/notTrue3D routes and missing rendered mouth proof", () => {
    const proof = createAnimationRouteProof({
      episodeId: "moon-garden-001",
      route: "/animation/image-puppet",
      duration: 12,
      frameRate: 30,
      assets: readyAssets(),
      shots: readyShots(),
      captions: [{
        id: "caption-1",
        text: "This is just a still image.",
        startTime: 0,
        endTime: 2,
        rendered: true
      }],
      visemes: [{
        id: "missing-mouth",
        characterId: "miko",
        startTime: 0,
        endTime: 2,
        mode: "missing-mouth-motion",
        rendered: false
      }],
      gestures: readyGestures(),
      render: { frameCount: 360, nonblank: true, sourceOnly: true, notTrue3D: true },
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

    expect(proof.status).toBe("fail");
    expect(proof.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["animation-route-visemes-rendered", "animation-route-not-source-only"])
    );
    expect(validateAnimationRouteProof(proof).map((issue) => issue.code)).toContain("animation-route-proof-status-fail");
  });

  it("fails when expected characters are not visible in shots", () => {
    const shots: AnimationRouteProofShot[] = [{
      ...readyShots()[0],
      expectedCharacterIds: ["miko", "luma"],
      visibleCharacterIds: ["miko"]
    }];
    const proof = createAnimationRouteProof({
      episodeId: "moon-garden-001",
      route: "/animation/moon-garden-001",
      duration: 60,
      frameRate: 30,
      assets: readyAssets(),
      shots,
      captions: [{
        id: "caption-1",
        text: "Where is Luma?",
        startTime: 0,
        endTime: 2,
        rendered: true
      }],
      visemes: readyVisemes(),
      gestures: readyGestures(),
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

    expect(proof.status).toBe("fail");
    expect(proof.issues.map((issue) => issue.code)).toContain("animation-route-shot-characters-visible");
  });
});

function readyAssets(): readonly AnimationRouteProofAsset[] {
  return [
    { id: "miko", role: "character", typedAsset: true, source: "aura-assets", checksum: "sha256-miko", ready: true },
    { id: "luma", role: "character", typedAsset: true, source: "aura-assets", checksum: "sha256-luma", ready: true },
    { id: "moonGarden", role: "set", typedAsset: true, source: "aura-assets", checksum: "sha256-set", ready: true }
  ];
}

function readyShots(): readonly AnimationRouteProofShot[] {
  return [{
    id: "shot-1",
    startTime: 0,
    endTime: 4,
    expectedCharacterIds: ["miko", "luma"],
    visibleCharacterIds: ["miko", "luma"],
    captionIds: ["caption-1"],
    gestureIds: ["wave-1"],
    visemeCueIds: ["viseme-1"],
    nonblank: true,
    frameCount: 120,
    frameHashes: ["a", "b", "c"]
  }];
}

function readyVisemes(): readonly AnimationRouteProofViseme[] {
  return [{
    id: "viseme-1",
    characterId: "miko",
    startTime: 1,
    endTime: 2,
    mode: "primitive-mouth-card",
    rendered: true
  }];
}

function readyGestures(): readonly AnimationRouteProofGesture[] {
  return [{
    id: "wave-1",
    characterId: "luma",
    state: "gesture-wave",
    startTime: 2,
    endTime: 3,
    rendered: true
  }];
}
