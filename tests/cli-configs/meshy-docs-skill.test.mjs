import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const docs = readFileSync(resolve(repositoryRoot, "docs/meshy-cli.md"), "utf8");
const skill = readFileSync(resolve(repositoryRoot, ".cursor/skills/meshy-cli/SKILL.md"), "utf8");
const installer = readFileSync(resolve(repositoryRoot, "cli-configs/install-meshy-mcp.sh"), "utf8");
const literalKeyPrefix = ["m", "sy_"].join("");

test("Meshy documentation keeps capability, pins, and source-dependent retention explicit", () => {
  assert.match(docs, /\*\*Capability label:\*\* CLI asset pipeline/);
  assert.match(docs, /@meshy-ai\/cli@0\.2\.0/);
  assert.match(docs, /@meshy-ai\/meshy-mcp-server@0\.5\.1/);
  assert.match(docs, /Current-source-dependent retention claim/);
  assert.match(docs, /https:\/\/docs\.meshy\.ai\/en\/api\/asset-retention/);
  assert.match(docs, /assets import-meshy` is available in `@aura3d\/cli@2\.0\.4/);
  assert.match(docs, /defaults to `quality: candidate`/);
  assert.match(docs, /Rights evidence is recorded, not invented/);
});

test("repository skill points to official help and docs without embedding credentials", () => {
  assert.match(skill, /^---\nname: meshy-cli\n/m);
  assert.match(skill, /meshy --help/);
  assert.match(skill, /meshy <resource> --help/);
  assert.match(skill, /github\.com\/meshy-dev\/meshy-cli/);
  assert.match(skill, /github\.com\/meshy-dev\/meshy-3d-agent/);
  assert.ok(skill.split("\n").length < 80, "repository skill should remain a small upstream pointer");
  assert.doesNotMatch(skill, new RegExp(literalKeyPrefix));
});

test("owned source contains no literal Meshy credential prefix", () => {
  for (const [path, source] of [["docs", docs], ["skill", skill], ["installer", installer]]) {
    assert.doesNotMatch(source, new RegExp(literalKeyPrefix), path);
  }
});
