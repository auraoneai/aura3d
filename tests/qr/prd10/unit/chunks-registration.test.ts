// 10-CHUNKS: the engine lane must register all 12 a3d_prd10_* shader chunks
// even when the rendering lanes barrel's module side effect is tree-shaken
// ("sideEffects": false). CI run 37497949014 failed "registers all 12
// chunks" with shaderChunk() undefined — this asserts the explicit call path.
import { describe, expect, it } from "vitest";
import { shaderChunk } from "../../../../packages/rendering/src/contracts/program";
import { registerPrd10Chunks, prd10ShaderChunks } from "../../../../packages/rendering/src/lanes/prd10";
import "../../../../packages/engine/src/lanes/prd10";

describe("10-CHUNKS explicit registration", () => {
  it("registers all 12 chunks via the engine lane import", () => {
    registerPrd10Chunks(); // idempotent second call must not throw
    expect(prd10ShaderChunks).toHaveLength(12);
    for (const chunk of prd10ShaderChunks) {
      expect(shaderChunk(chunk.name), chunk.name).toBeDefined();
    }
  });
});
