import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("animation runtime-node source gates", () => {
  it("keeps runtime-node clip playback bound through public node handles", () => {
    const agentApi = readSource("packages/engine/src/agent-api/index.ts");
    const shotTimeline = readSource("packages/engine/src/agent-api/ShotTimeline.ts");

    expectIncludesAll(agentApi, [
      "readonly animation?: AuraAnimationSpec",
      "play(clip: string, options?: Omit<AuraAnimationSpec, \"clip\">): this",
      "setAnimation(animation: AuraAnimationSpec | undefined): this",
      "node.animation = { ...options, clip };",
      "node.animation = animation;",
      "animation: node.animation,",
      "runtimeNodes.reset(renderSnapshot);"
    ]);
    expectIncludesAll(shotTimeline, [
      "export interface ShotPlaybackRuntimeNodeHandle",
      "play?(clip: string",
      "readonly animationClip?: string",
      "if (playAnimationClips && update.animationClip) node.play?.(update.animationClip, { loop: true });"
    ]);
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

function expectIncludesAll(source: string, tokens: readonly string[]): void {
  for (const token of tokens) expect(source).toContain(token);
}
