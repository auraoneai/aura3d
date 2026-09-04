import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "vitest";
import {
  listVisualNodeDefinitions,
  serializeVisualNodeCatalog
} from "../../../packages/scripting/src/index.js";

// O2 docs box: the committed machine-readable catalog must match source.
// If this fails, regenerate — never hand-edit the JSON.
describe("O2 visual node catalog sync", () => {
  test("serialized catalog covers every definition with per-node evidence", () => {
    const catalog = serializeVisualNodeCatalog();
    const definitions = listVisualNodeDefinitions();
    assert.equal(catalog.nodeKindCount, definitions.length);
    assert.ok(catalog.nodeKindCount >= 25, `expected 25+ node kinds, saw ${catalog.nodeKindCount}`);
    const kinds = new Set(definitions.map((definition) => definition.kind));
    for (const group of catalog.categories) {
      for (const entry of group.kinds) {
        assert.ok(kinds.has(entry.kind), `catalog kind missing from source: ${entry.kind}`);
        assert.ok(entry.title.length > 0, entry.kind);
        assert.ok(entry.description.length > 0, entry.kind);
        assert.ok(entry.evidence.length > 0, `missing backend evidence: ${entry.kind}`);
      }
    }
  });

  test("committed docs JSON matches the serializer output", () => {
    const committed = JSON.parse(
      readFileSync(resolve(process.cwd(), "docs/api/visual-scripting-catalog.json"), "utf8")
    ) as ReturnType<typeof serializeVisualNodeCatalog> & { schema: string; generatedAt: string };
    assert.equal(committed.schema, "aura3d.visual-scripting-catalog/1.0");
    assert.ok(typeof committed.generatedAt === "string" && committed.generatedAt.length > 0);
    const live = serializeVisualNodeCatalog();
    assert.equal(committed.generatedBy, live.generatedBy);
    assert.equal(committed.nodeKindCount, live.nodeKindCount);
    assert.deepEqual(committed.categories, live.categories);
  });
});
