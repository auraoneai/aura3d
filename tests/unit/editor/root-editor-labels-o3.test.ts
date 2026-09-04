import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "vitest";

// O3 labels box: the bounded root editor surface must stay bounded and the
// package-only tools must stay package-only. This audit reads source + README
// as text so it stays hermetic (no engine barrel import).
const ROOT = process.cwd();
const AGENT_API = readFileSync(resolve(ROOT, "packages/engine/src/agent-api/index.ts"), "utf8");
const EDITOR_README = readFileSync(resolve(ROOT, "packages/editor-runtime/README.md"), "utf8");

describe("O3 editor label audit", () => {
  test("root editor surface keeps the editor capability label, never root", () => {
    assert.match(AGENT_API, /capabilityLabel:\s*"editor"/);
    assert.doesNotMatch(AGENT_API, /capabilityLabel:\s*"root"/);
  });

  test("root exposes exactly the bounded surface: undo/redo/gizmo/playMode/outliner", () => {
    for (const key of ["undo:", "redo:", "gizmo:", "playMode:", "outliner:"]) {
      assert.ok(AGENT_API.includes(key), `root editor surface missing: ${key}`);
    }
  });

  test("package-only tools are not promoted to the root surface", () => {
    for (const tool of [
      "ShaderGraphModel",
      "MaterialVariantWorkflow",
      "MultiUserReviewWorkflow",
      "NonlinearAnimationEditor",
      "VisualReviewDashboard"
    ]) {
      assert.ok(!AGENT_API.includes(tool), `root overclaim: ${tool} must stay package-labeled`);
    }
  });

  test("README carries the Desktop/Tauri gap statement", () => {
    assert.match(EDITOR_README, /## Platform Scope/);
    assert.match(EDITOR_README, /no Desktop shell/);
    assert.match(EDITOR_README, /no Tauri/);
    assert.match(EDITOR_README, /roadmap, not a current capability/);
  });
});
