import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Packed installs ship the codemod data inside @aura3d/cli/data — the repo
// copies must not drift from the canonical sources they mirror.

const repo = resolve(__dirname, "../../..");
const bundled = (name: string) =>
  JSON.parse(readFileSync(resolve(repo, `packages/aura3d-cli/data/${name}`), "utf8"));
const canonical = (name: string) =>
  JSON.parse(readFileSync(resolve(repo, name), "utf8"));

describe("aura3d-cli bundled codemod data", () => {
  it("root-export-dispositions.json matches docs/architecture canonical copy", () => {
    expect(bundled("root-export-dispositions.json")).toEqual(
      canonical("docs/architecture/root-export-dispositions.json")
    );
  });

  it("aura.exports.json matches the repo-root canonical copy", () => {
    expect(bundled("aura.exports.json")).toEqual(canonical("aura.exports.json"));
  });
});
