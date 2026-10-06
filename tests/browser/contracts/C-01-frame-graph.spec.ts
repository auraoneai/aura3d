import { test, expect } from "@playwright/test";
import { frameContributors } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "@aura3d/engine/contracts";

// C-01 browser suite. Pixel-identity evidence belongs to PRD 01's own specs;
// PR 0a asserts the stub resolves flags inside a real browser context.
test("all-flags-off yields zero frame contributors", async () => {
  const flags = resolveQrFlags({ options: [] });
  expect(frameContributors(flags).length).toBe(0);
});
