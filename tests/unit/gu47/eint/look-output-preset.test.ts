// GU47 lane eint, E-A handoff: `createRootPostPipeline` applies the look's
// declared post preset (`lookOutputPreset`) when the app authors no
// `output.preset`. Authored `output.preset` wins; scenes without a look are
// unchanged.
import { describe, expect, it } from "vitest";
import { createRootPostPipeline } from "../../../../packages/engine/src/agent-api/postBridge";
import { looks } from "../../../../packages/engine/src/agent-api/looks/looks";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { AuraSceneNode, AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/nodes/types";
import type { AuraOutputOptions } from "../../../../packages/engine/src/contracts/output";

function lookNode(id: Parameters<typeof looks.preset>[0], overrides?: Parameters<typeof looks.preset>[1]): AuraSceneNode {
  const built = looks.preset(id, overrides) as unknown as { toJSON?: () => AuraSceneNode };
  return (typeof built.toJSON === "function" ? built.toJSON() : built) as AuraSceneNode;
}

function pipeline(nodes: readonly AuraSceneNode[], output?: AuraOutputOptions) {
  return createRootPostPipeline({ nodes } as unknown as AuraSceneSnapshot, undefined, output, QUALITY_TIERS.high).options;
}

describe("GU47 eint: look output preset reaches the post pipeline", () => {
  it("golden-hour without output.preset renders cinematic-film (agx, vignette, grain)", () => {
    const options = pipeline([lookNode("golden-hour")]);
    expect(options.toneMapping).toBe("agx");
    expect(options.vignette).toBeTruthy();
    expect(options.filmGrain).toBeTruthy();
  });

  it("an authored output.preset wins over the look's preset", () => {
    const authored = pipeline([lookNode("golden-hour")], { preset: "daylight-outdoor" });
    const plain = pipeline([], { preset: "daylight-outdoor" });
    expect(authored.toneMapping).toBe(plain.toneMapping);
    expect(authored.filmGrain).toBeUndefined();
  });

  it("the look override `post` id is the preset applied", () => {
    const options = pipeline([lookNode("golden-hour", { post: "neon-night" })]);
    const reference = pipeline([], { preset: "neon-night" });
    expect(options.toneMapping).toBe(reference.toneMapping);
    expect(Boolean(options.filmGrain)).toBe(Boolean(reference.filmGrain));
  });

  it("authored output fields still win over the look preset's", () => {
    const options = pipeline([lookNode("golden-hour")], { toneMapping: "aces" } as AuraOutputOptions);
    expect(options.toneMapping).toBe("aces");
    expect(options.vignette).toBeTruthy();
  });

  it("scenes without a look are unchanged", () => {
    const options = pipeline([]);
    expect(options.filmGrain).toBeUndefined();
    expect(options.vignette).toBeUndefined();
  });
});
