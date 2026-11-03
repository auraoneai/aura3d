import assert from "node:assert/strict";
import { navigation } from "@aura3d/engine";

assert.ok(import.meta.resolve("@aura3d/navigation-recast"));
assert.equal(await navigation.isAvailable(), true);
const mesh = await navigation.bake({
  positions: [-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5],
  indices: [0, 2, 1, 0, 3, 2]
});
try {
  const result = navigation.path(mesh, [-4, 0, -4], [4, 0, 4]);
  assert.equal(result.success, true);
  assert.ok(result.points.length >= 2);
} finally {
  mesh.dispose();
}
assert.equal(mesh.disposed, true);
