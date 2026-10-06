import { describe, expect, it } from "vitest";
import { registerAppExtension, appExtensionsAll } from "@aura3d/engine/contracts";

describe("C-38 app extensions", () => {
  it("registered extension is enumerable", () => {
    const dispose = registerAppExtension({
      id: "prd15.test-ext",
      name: "test-ext",
      member: "lighting",
      create: () => ({} as never),
    } as never);
    expect(appExtensionsAll().map((e) => e.id)).toContain("prd15.test-ext");
    dispose();
  });
});
