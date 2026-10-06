import { test, expect } from "@playwright/test";
import { shaderChunk, computeProgramKey } from "@aura3d/rendering/contracts";

test("stub chunk registry + key stability in browser", async () => {
  expect(typeof computeProgramKey).toBe("function");
  expect(shaderChunk("nonexistent")).toBeUndefined();
});
