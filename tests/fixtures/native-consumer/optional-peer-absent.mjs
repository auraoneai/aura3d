import assert from "node:assert/strict";
import { navigation } from "@aura3d/engine";

assert.throws(() => import.meta.resolve("@aura3d/navigation-recast"), { code: "ERR_MODULE_NOT_FOUND" });
assert.equal(await navigation.isAvailable(), false);
await assert.rejects(
  () => navigation.bake({ positions: [-5, 0, -5, 5, 0, -5, 5, 0, 5], indices: [0, 2, 1] }),
  /navigation-recast|navigation peer unavailable/i
);
