import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publisher = readFileSync("tools/release/publish-all.mjs", "utf8");

describe("npm release publisher integrity contract", () => {
  it("requires every public package to share the release version", () => {
    expect(publisher).toContain("manifest.version !== version");
    expect(publisher).not.toMatch(/manifest\.name !== [^&]+&& manifest\.version !== version/);
  });

  it("hashes each exact tarball and compares the exact registry version", () => {
    expect(publisher).toContain('createHash("sha512")');
    expect(publisher).toContain("npm view ${manifest.name}@${expectedVersion} dist.integrity");
    expect(publisher).toContain("registryIntegrity === packed.integrity");
  });

  it("separates unpublished release preflight from published-version reproduction", () => {
    expect(publisher).toContain('process.argv.includes("--pack-only")');
    expect(publisher).toContain("DRY_RUN || PACK_ONLY");
    expect(publisher).toContain("!DRY_RUN && !PACK_ONLY");
  });

  it("fails unless all 26 versions and integrity hashes match", () => {
    expect(publisher).toContain("versionMatches && integrityMatches");
    expect(publisher).toContain("verified !== EXPECTED_PUBLIC_COUNT");
    expect(publisher).toContain("aura3d-npm-registry-verification/1.0");
    expect(publisher).toContain('commit: sh("git rev-parse HEAD")');
  });
});
