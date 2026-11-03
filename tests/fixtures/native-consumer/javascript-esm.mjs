import assert from "node:assert/strict";
import * as root from "@aura3d/engine";
import { appExtensionsAll, createAuraApp, scene } from "@aura3d/engine";
import { Renderer } from "@aura3d/engine/renderer";
import { createGame } from "@aura3d/engine/game";
import { createAuraRouteHealth } from "@aura3d/engine/devtools";
import { auraDecodersPlugin } from "@aura3d/assets/vite";
import { createWorkerRenderer, installWorkerRenderer } from "@aura3d/engine/worker";
import { NativeLightmapBake } from "@aura3d/engine/lighting";

assert.equal(typeof createAuraApp, "function");
assert.equal(typeof scene, "function");
assert.equal(typeof Renderer, "function");
assert.equal(typeof createGame, "function");
assert.equal(typeof createAuraRouteHealth, "function");
assert.equal(typeof auraDecodersPlugin, "function");
assert.equal(typeof createWorkerRenderer, "function");
assert.equal(typeof installWorkerRenderer, "function");
assert.equal(typeof NativeLightmapBake, "function");
assert.equal("NativeLightmapBake" in root, false);

function bake(lights) {
  const task = new NativeLightmapBake({
    atlas: { width: 2, height: 2, uvChannel: 1, gutter: 0, texelDensity: 2,
      charts: [{ x: 0, y: 0, width: 2, height: 2, triangles: [0] }] },
    mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] },
    lights, indirect: () => [0, 1, 0]
  });
  for (let i = 0; i < 100 && task.status !== "complete"; i += 1) task.step(16);
  assert.equal(task.status, "complete");
  return task.createRenderData();
}

// Exercise the real root provider's attachment validation without a renderer.
// A recognized certificate reaches the explicit unavailable-renderer error;
// it does not mean that an attachment or rendered frame exists.
const extension = appExtensionsAll().find((entry) => entry.id === "prd02.lighting");
assert.ok(extension, "root lighting provider was not registered");
const runtime = extension.create({ nodes: {} }, { flags: undefined, options: {} });
const indirect = bake([]);
const direct = bake([{ type: "ambient", color: [1, 0, 0], intensity: 1 }]);
const forgedTexture = new indirect.texture.constructor({
  width: 2, height: 2, format: "rgba32f", colorSpace: "linear",
  data: indirect.texture.getMipLevel(0).data.slice(), generateMipmaps: false
});
try {
  assert.throws(() => runtime.attachLightmap("card", indirect, { composition: "add-indirect" }),
    { code: "ADVANCED_LIGHTING_RENDER_PATH_UNAVAILABLE" });
  assert.throws(() => runtime.attachLightmap("card", { ...indirect, texture: forgedTexture }, { composition: "add-indirect" }),
    /LIGHTMAP_PROVENANCE_INVALID/);
  assert.throws(() => runtime.attachLightmap("card", { ...indirect, uvChannel: 0 }, { composition: "add-indirect" }),
    /LIGHTMAP_PROVENANCE_INVALID/);
  assert.throws(() => runtime.attachLightmap("card", { ...direct, provenance: indirect.provenance }, { composition: "add-indirect" }),
    /LIGHTMAP_CONTAINS_AUTHORED_LIGHTS/);
} finally {
  extension.dispose?.(runtime);
  forgedTexture.dispose();
  direct.texture.dispose();
  indirect.texture.dispose();
}
