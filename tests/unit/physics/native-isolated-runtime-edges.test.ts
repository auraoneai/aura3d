import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

function runtimeImports(file: string): string[] {
  const absolute = resolve("packages/engine/src/agent-api", file);
  const source = ts.createSourceFile(absolute, readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly && ts.isStringLiteral(statement.moduleSpecifier)) {
      return [statement.moduleSpecifier.text];
    }
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      return [statement.moduleSpecifier.text];
    }
    return [];
  });
}

describe("provider-neutral runtime leaves", () => {
  it("does not statically import the legacy physics runtime from frame, preview, animation, or group helpers", () => {
    for (const file of ["app/frameLoop.ts", "devtools/diagnosticPreview.ts", "AnimationRenderQueue.ts", "PromptAnimationContract.ts", "ShotTimeline.ts", "nodes/groups.ts"]) {
      const forbidden = runtimeImports(file).filter((specifier) =>
        /(?:^|\/)(?:GameRuntime|legacy-physics-access)(?:\.js)?$/u.test(specifier) ||
        /^@aura3d\/physics(?:\/world)?$/u.test(specifier) || /^@aura3d\/physics-rapier(?:\/|$)/u.test(specifier));
      expect(forbidden, file).toEqual([]);
    }
    // This contract needs only erased types: even a camera namespace import
    // would pull scene and physics-dependent runtime code into its consumers.
    expect(runtimeImports("PromptAnimationContract.ts")).toEqual([]);
  });

  it("creates animation timelines and capture queues without loading the physics world", async () => {
    const worldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      worldLoaded();
      throw new Error("unexpected physics world import");
    });
    try {
      const contract = await import("../../../packages/engine/src/agent-api/PromptAnimationContract.js");
      const { createAnimationRenderQueue } = await import("../../../packages/engine/src/agent-api/AnimationRenderQueue.js");
      const { createShotTimeline } = await import("../../../packages/engine/src/agent-api/ShotTimeline.js");
      expect(contract.normalizePromptAnimationTime(-1)).toBe(0);
      expect(contract.normalizePromptAnimationTime(0.333333333)).toBe(0.333333);
      expect(contract.normalizePromptAnimationTime(Number.POSITIVE_INFINITY)).toBe(0);
      expect(contract.promptAnimationTimeAtFrame(1, 30)).toBe(0.033333);
      expect(contract.promptAnimationFrameAtTime(1.25, 30)).toBe(38);
      expect(contract.promptAnimationDriftFrames(0.05, 30)).toBe(2);
      const episodePlan = contract.createPromptAnimationEpisodePlan({
        episodeId: "episode", title: "Test", language: "en",
        runtime: { duration: 2, frameRate: 30, resolution: { width: 320, height: 180 } },
        characters: [], locations: []
      });
      const timeline = createShotTimeline({ episodeId: "episode", frameRate: 30, duration: 2, shots: [{
        id: "shot-1", shotId: "shot-1", sceneId: "scene", startTime: 0, endTime: 2,
        camera: { move: "static" }, characters: [], captureTimes: [1.25, 0.333333333, 0.33333331, -1]
      }] });
      const queue = createAnimationRenderQueue({ episodePlan, shotTimeline: timeline, route: "/episode" });
      expect(queue.captureTimes).toEqual([0, 0.333333, 1.25]);
      expect(queue.frameList).toEqual([0, 10, 38]);
      expect(queue.items.map((item) => item.shotId)).toEqual(["shot-1", "shot-1", "shot-1"]);
      expect(episodePlan.accessibilityProof).toMatchObject({ captions: { required: true, enabled: true }, reducedMotion: { defaultEnabled: true } });
      expect(worldLoaded).not.toHaveBeenCalled();

      // The same mock must intercept the actual legacy edge; otherwise the
      // absence of calls above could be caused by an incorrectly resolved mock.
      await expect(import("../../../packages/engine/src/agent-api/GameRuntime.js")).rejects.toThrow();
      expect(worldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);
});
