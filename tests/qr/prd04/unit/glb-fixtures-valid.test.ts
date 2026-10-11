/**
 * glb-fixtures-valid.test.ts — every PRD-04 model fixture is a well-formed GLB
 * whose bytes match the sha256 in `scenes/prd04/assets.ts`.
 *
 * Main GPU run 38144924567: prd04-texture-transform failed to mount on both
 * engines with "Unexpected non-whitespace character after JSON at position 4745".
 * The fixture's JSON chunk was padded with NUL bytes, but glTF 2.0 §4.4.3.1
 * requires 0x20 padding.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prd04ModelAssets } from "../../../../benchmarks/quality-rebuild/scenes/prd04/assets";

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

describe("PRD-04 GLB fixtures", () => {
  for (const entry of Object.values(prd04ModelAssets)) {
    if (!entry.repoPath.endsWith(".glb")) continue;
    it(`${entry.id}: valid GLB container, space-padded JSON chunk, sha256 matches`, () => {
      const path = resolve(entry.repoPath);
      expect(existsSync(path), `${entry.repoPath} present`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 64).toString("utf8").startsWith("version https://git-lfs"), `${entry.repoPath} is an LFS pointer, not the GLB`).toBe(false);
      expect(bytes.readUInt32LE(0)).toBe(GLB_MAGIC);
      expect(bytes.readUInt32LE(8), "header length == file length").toBe(bytes.length);
      const jsonLength = bytes.readUInt32LE(12);
      expect(bytes.readUInt32LE(16)).toBe(JSON_CHUNK);
      expect(jsonLength % 4, "JSON chunk 4-byte aligned").toBe(0);
      const json = bytes.subarray(20, 20 + jsonLength);
      expect(json.includes(0x00), "JSON chunk must be padded with 0x20, not NUL").toBe(false);
      expect(() => JSON.parse(json.toString("utf8"))).not.toThrow();
      const digest = `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
      expect(digest, `${entry.repoPath} sha256 matches assets.ts`).toBe(entry.sha256);
    });
  }
});
