import { describe, expect, it } from "vitest";
import {
  buildMigrationReportData,
  classifyVersionedPath,
  extractActiveReferences
} from "../../../tools/naming-taxonomy/index";

describe("naming taxonomy migration report", () => {
  it("classifies load-bearing versioned paths with contextual targets", () => {
    expect(classifyVersionedPath("apps/v9-advanced-examples-gallery/src/main.ts")).toMatchObject({
      classification: "active-route",
      target: "apps/advanced-examples-gallery/src/main.ts"
    });
    expect(classifyVersionedPath("fixtures/v9/assets/data-galaxy-core-blender/manifest.json")).toMatchObject({
      classification: "fixture-url",
      target: "fixtures/advanced-gallery/assets/data-galaxy-core-blender/manifest.json"
    });
    expect(classifyVersionedPath("tests/reports/v9/advanced-examples-gallery/product-configurator.json")).toMatchObject({
      classification: "report-path",
      target: "tests/reports/advanced-examples-gallery/product-configurator.json"
    });
    expect(classifyVersionedPath("packages/engine/src/v9/index.ts")).toMatchObject({
      classification: "public-api",
      target: "packages/engine/src/advanced-runtime/index.ts"
    });
    expect(classifyVersionedPath("tools/v9-advanced-gallery-report-audit/index.ts")).toMatchObject({
      classification: "internal-tool",
      target: "tools/advanced-gallery-report-audit/index.ts"
    });
    expect(classifyVersionedPath("docs/project/v5-roadmap-status.md")).toMatchObject({
      classification: "historical-archive",
      archivalReason: expect.stringContaining("Historical phase evidence")
    });
  });

  it("classifies active aliases, route links, fixture URLs, and report readers", () => {
    const references = extractActiveReferences([
      {
        path: "package.json",
        text: JSON.stringify({
          files: ["templates/v6-product-viewer"],
          exports: {
            "./v9": "./dist/engine/v9/index.js",
            "./rendering/v6": "./dist/rendering/v6/index.js"
          },
          scripts: {
            "v9:advanced-gallery:review": "pnpm exec tsx --tsconfig tsconfig.base.json tools/v9-advanced-gallery-visual-review/index.ts"
          }
        })
      },
      {
        path: "tsconfig.base.json",
        text: JSON.stringify({
          compilerOptions: {
            paths: {
              "@galileo3d/engine/v9": ["packages/engine/src/v9/index.ts"]
            }
          }
        })
      },
      {
        path: "tools/v9-advanced-gallery-report-audit/index.ts",
        text: [
          "const reportDir = \"tests/reports/v9/advanced-examples-gallery\";",
          "const fixture = \"fixtures/v9/assets/data-galaxy-core-blender/manifest.json\";",
          "const route = \"/apps/v9-advanced-examples-gallery/\";"
        ].join("\n")
      }
    ]);

    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "package-file-entry", classification: "public-api", target: "templates/product-viewer" }),
      expect.objectContaining({ kind: "package-export", classification: "public-api", target: "@galileo3d/engine/advanced-runtime" }),
      expect.objectContaining({ kind: "package-export", classification: "public-api", target: "@galileo3d/engine/rendering/production-runtime" }),
      expect.objectContaining({ kind: "script", classification: "internal-tool", target: expect.stringContaining("advanced-gallery:review") }),
      expect.objectContaining({ kind: "tsconfig-alias", classification: "public-api", target: "@galileo3d/engine/advanced-runtime" }),
      expect.objectContaining({ kind: "report-reader", classification: "report-path", target: "tests/reports/advanced-examples-gallery" }),
      expect.objectContaining({ kind: "fixture-url", classification: "fixture-url", target: "fixtures/advanced-gallery/assets/data-galaxy-core-blender/manifest.json" }),
      expect.objectContaining({ kind: "route-link", classification: "active-route", target: "/apps/advanced-examples-gallery/" })
    ]));
  });

  it("keeps the generated report data fully classified", () => {
    const data = buildMigrationReportData(process.cwd(), "2026-05-25");
    expect(data.versionedPaths.length).toBeGreaterThan(0);
    expect(data.versionedDirectories.length).toBeGreaterThan(0);
    expect(data.activeReferences.length).toBeGreaterThan(0);
    expect(data.versionedPaths.every((entry) => entry.target || entry.archivalReason)).toBe(true);
    expect(data.versionedDirectories.every((entry) => entry.target || entry.archivalReason)).toBe(true);
    expect(data.activeReferences.every((entry) => entry.target || entry.archivalReason)).toBe(true);
    expect(data.classificationCounts["active-route"]).toBeGreaterThan(0);
    expect(data.classificationCounts["fixture-url"]).toBeGreaterThan(0);
    expect(data.classificationCounts["report-path"]).toBeGreaterThan(0);
    expect(data.classificationCounts["public-api"]).toBeGreaterThan(0);
  });
});
