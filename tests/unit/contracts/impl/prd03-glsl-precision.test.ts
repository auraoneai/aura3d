import { describe, expect, it } from "vitest";
import * as displayGrade from "../../../../packages/rendering/src/post/shaders/displayGrade.glsl";
import * as finalize from "../../../../packages/rendering/src/post/shaders/finalize.glsl";
import * as fxaa from "../../../../packages/rendering/src/post/shaders/fxaa.glsl";
import { postV2ModulesReady } from "../../../../packages/rendering/src/renderer/PostprocessExecution";

/**
 * Regression for the first completed main post-quality browser run
 * (38098853109, job 114350375063): `post-lut` failed with
 * "'sampler3D' : No precision specified". GLSL ES 3.00 gives float and
 * sampler2D default precisions but none for sampler3D (or the array/integer
 * sampler families), so every lane-03 GLSL ES 3.00 shader that declares one
 * must state its precision.
 */

const NO_DEFAULT_PRECISION = ["sampler3D", "sampler2DArray", "samplerCube" /* has default; listed for clarity */, "isampler2D", "usampler2D"] as const;

function glslExports(mod: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(mod).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].startsWith("#version 300 es"));
}

describe("lane-03 GLSL ES 3.00 sampler precision", () => {
  const shaders = [...glslExports(displayGrade), ...glslExports(finalize), ...glslExports(fxaa)];

  it("finds the lane's GLSL ES 3.00 shaders", () => {
    expect(shaders.length).toBeGreaterThan(3);
  });

  it("every sampler type without a default precision is declared with one", () => {
    for (const [name, source] of shaders) {
      for (const type of NO_DEFAULT_PRECISION) {
        if (type === "samplerCube") continue;
        if (new RegExp(`\\buniform\\s+(?:\\w+\\s+)?${type}\\b`).test(source)) {
          expect(source, `${name} declares ${type}`).toMatch(new RegExp(`precision\\s+\\w+\\s+${type}\\s*;`));
        }
      }
    }
  });
});

describe("deferred v2 stage load", () => {
  it("postV2ModulesReady resolves and is idempotent", async () => {
    await expect(postV2ModulesReady()).resolves.toBeUndefined();
    await expect(postV2ModulesReady()).resolves.toBeUndefined();
  });
});
