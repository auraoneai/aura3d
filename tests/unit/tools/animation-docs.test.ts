import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("animation runtime docs", () => {
  it("states supported runtime features and unsupported authoring/retargeting limits", () => {
    const docs = readFileSync("docs/animation/runtime-support.md", "utf8");

    expect(docs).toContain("scalar, vector2, vector3, quaternion, object values, and numeric arrays");
    expect(docs).toContain("play, pause, stop, scrubbing, playback speed, looping, weights, crossfades");
    expect(docs).toContain("deterministic state transitions");
    expect(docs).toContain("renderer-facing joint matrices");
    expect(docs).toContain("scene and ECS animation bridges");
    expect(docs).toContain("Retargeting is future work");
    expect(docs).toContain("Timeline authoring is future work");
    expect(docs).toContain("not a production character-animation toolchain");
    expect(docs).toContain("A rig profile format");
    expect(docs).toContain("Browser evidence using at least two real externally authored skinned glTF characters");
  });
});
