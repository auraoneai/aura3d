import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { walkRetainedReportArtifacts } from "../../../tools/advanced-gallery-visual-review/artifactTraversal";

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("advanced gallery historical artifact traversal", () => {
  it("keeps retained evidence and prunes generated dependency and build trees", () => {
    const root = mkdtempSync(join(tmpdir(), "a3d-gallery-artifacts-"));
    scratchDirectories.push(root);

    writeFixture(root, "historical/product-configurator.png");
    writeFixture(root, "historical/product-configurator.json");
    writeFixture(root, "generated-consumer/node_modules/package/product-configurator.png");
    writeFixture(root, "generated-consumer/dist/product-configurator.json");
    writeFixture(root, "generated-consumer/test-results/product-configurator.png");
    writeFixture(root, "generated-consumer/playwright-report/product-configurator.json");
    writeFixture(root, "generated-consumer/coverage/product-configurator.json");
    writeFixture(root, "generated-consumer/.pnpm/package/product-configurator.png");

    expect(walkRetainedReportArtifacts(root)).toEqual([
      join(root, "historical/product-configurator.json"),
      join(root, "historical/product-configurator.png")
    ]);
  });

  it("does not follow directory symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "a3d-gallery-artifacts-"));
    scratchDirectories.push(root);
    writeFixture(root, "historical/data-galaxy.png");

    // A symlink is neither a regular file nor a directory according to Dirent,
    // so recursive traversal cannot cycle through it.
    symlinkSync(root, join(root, "historical/loop"), "dir");

    expect(walkRetainedReportArtifacts(root)).toEqual([
      join(root, "historical/data-galaxy.png")
    ]);
  });
});

function writeFixture(root: string, relativePath: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, relativePath);
}
