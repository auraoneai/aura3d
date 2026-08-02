import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();
const materialClaimFiles = [
  "README.md",
  "llms.txt",
  "prompt.md",
  "docs/project/plans/recovery-remediation-prd.md",
  "docs/rendering/material-matrix.md",
  "docs/concepts/rendering.md",
  "docs/project/architecture/create-aura-app-production-bridge.md"
] as const;

const rootScopePattern = /\b(createauraapp|root|root webgl2|public root|public examples|public safe route|webgl2 path|material lab)\b/;
const boundedClaimPattern = /\b(do not|does not|not |without|unless|until|requires?|partial|unsupported|blocked|missing|open|roadmap|prototype|metadata|inventory|demote|evidence|proof|no controlled|not yet|keep blocked|fail)\b/;
const materialFeaturePatterns: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "full PBR/material parity", pattern: /\b(full pbr|pbr parity|production material parity|three\.js-style material parity|high-end pbr)\b/ },
  { label: "root texture parity", pattern: /\b(base-color material and texture|texture rendering|texture-material parity|texture on\/off|textures are visible)\b/ },
  { label: "clearcoat", pattern: /\b(clearcoat|clearcoat highlights?)\b/ },
  { label: "normal maps", pattern: /\bnormal[- ]maps?\b/ },
  { label: "alpha/glass/transmission", pattern: /\b(transparent glass|glass\/transmission|alpha blend|alpha \/ opacity|transmission|refraction|volumetric|volume|ior)\b/ }
];

function readWorkspaceFile(path: string): string {
  return readFileSync(join(rootDir, path), "utf8");
}

describe("root material claim boundaries", () => {
  it("labels material lab expectations with root material proof status", () => {
    const llms = readWorkspaceFile("llms.txt");
    const materialLabLine = llms
      .split("\n")
      .find((line) => line.startsWith("| Material lab |"));

    expect(materialLabLine).toBeTruthy();
    expect(materialLabLine).toContain("root-proven");
    expect(materialLabLine).toMatch(/\b(partial|unsupported|roadmap)\b/);
  });

  it("keeps root material docs and trackers from claiming full PBR parity without evidence language", () => {
    const offenders: string[] = [];

    for (const path of materialClaimFiles) {
      const lines = readWorkspaceFile(path).split("\n");
      lines.forEach((line, index) => {
        const lower = line.toLowerCase();
        const mentionsRoot = rootScopePattern.test(lower);
        const matchedFeature = materialFeaturePatterns.find((entry) => entry.pattern.test(lower));
        const bounded = boundedClaimPattern.test(lower);

        if (mentionsRoot && matchedFeature && !bounded) {
          offenders.push(`${path}:${index + 1} [${matchedFeature.label}]: ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
