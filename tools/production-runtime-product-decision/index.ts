import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const docPath = "docs/project/competitive-positioning.md";
const reportPath = "tests/reports/production-runtime-product-decision-record.json";
const doc = existsSync(resolve(docPath)) ? readFileSync(resolve(docPath), "utf8") : "";

const requiredHeadings = [
  "## Decision",
  "## What A3D Production runtime Does Better Than Raw Three.js Today",
  "## What A3D Production runtime Matches Three.js On Today",
  "## What Three.js Still Does Better",
  "## Production-Ready Production runtime Workflows",
  "## Experimental Production runtime Workflows",
  "## Blocked Claims After Production runtime",
  "## Public-Worthy Screenshots",
  "## Screenshots Not Public-Worthy",
  "## Next Product Roadmap After Production runtime",
  "## Evidence"
] as const;

const publicScreenshots = [
  "tests/reports/production-runtime-webgl2/damaged-helmet-webgl2.png",
  "tests/reports/production-runtime-hd-flagship/composed-product-hd.png",
  "tests/reports/production-runtime-hd-product-hero/damaged-helmet-hero.png",
  "tests/reports/production-runtime-hd-materials/pbr-materials-hd.png",
  "tests/reports/production-runtime-pbr-hdr/damaged-helmet-studio-hdr.png",
  "tests/reports/production-runtime-pbr-hdr/damaged-helmet-sunset-hdr.png",
  "tests/reports/production-runtime-gltf-render/damaged-helmet.png",
  "tests/reports/production-runtime-gltf-render/clearcoat.png",
  "tests/reports/production-runtime-gltf-render/cesium-man.png",
  "tests/reports/production-runtime-effects/damaged-helmet-effects.png",
  "tests/reports/production-runtime-app-suite/production-product-configurator.png",
  "tests/reports/production-runtime-app-suite/production-asset-inspector.png",
  "tests/reports/production-runtime-app-suite/production-material-studio.png",
  "tests/reports/production-runtime-app-suite/character-viewer.png",
  "tests/reports/production-runtime-app-suite/cinematic-postprocess.png",
  "tests/reports/production-runtime-external-consumer/external-consumer-render.png"
] as const;

const blockedClaims = [
  "Full Three.js API replacement",
  "Full Three.js ecosystem replacement",
  "Full WebGPU parity",
  "Unity replacement",
  "Unreal replacement",
  "Offline renderer parity",
  "Every glTF extension",
  "Broad performance superiority"
] as const;

const evidenceReports = [
  "tests/reports/production-runtime-release-readiness.json",
  "tests/reports/production-runtime-hd-flagship-readiness.json",
  "tests/reports/production-runtime-hd-product-hero-readiness.json",
  "tests/reports/production-runtime-hd-materials-readiness.json",
  "tests/reports/production-runtime-production-renderer-readiness.json",
  "tests/reports/production-runtime-gallery-readiness.json",
  "tests/reports/production-runtime-threejs-parity-readiness.json",
  "tests/reports/production-runtime-external-consumer.json",
  "tests/reports/production-runtime-performance-readiness.json",
  "tests/reports/production-runtime-claim-registry.json"
] as const;

const checks: Check[] = [
  {
    id: "document-exists",
    pass: existsSync(resolve(docPath)),
    detail: docPath
  },
  {
    id: "required-headings",
    pass: requiredHeadings.every((heading) => doc.includes(heading)),
    detail: missing(requiredHeadings, doc).join(", ")
  },
  {
    id: "answers-product-questions",
    pass: [
      "does better than raw Three.js",
      "matches Three.js",
      "Three.js still does better",
      "Production-Ready Production runtime Workflows",
      "Experimental Production runtime Workflows",
      "Blocked Claims After Production runtime",
      "Public-Worthy Screenshots",
      "Screenshots Not Public-Worthy",
      "Next Product Roadmap After Production runtime"
    ].every((phrase) => doc.toLowerCase().includes(phrase.toLowerCase())),
    detail: "required product decision questions are answered"
  },
  {
    id: "blocked-claims-preserved",
    pass: blockedClaims.every((claim) => doc.includes(claim) && doc.includes("remains blocked")),
    detail: missing(blockedClaims, doc).join(", ")
  },
  {
    id: "public-screenshots-exist",
    pass: publicScreenshots.every((path) => existsSync(resolve(path)) && statSync(resolve(path)).size > 1_000),
    detail: publicScreenshots.join(", ")
  },
  {
    id: "public-screenshots-listed",
    pass: publicScreenshots.every((path) => doc.includes(path)),
    detail: missing(publicScreenshots, doc).join(", ")
  },
  {
    id: "legacy-failures-rejected",
    pass: [
      "tests/reports/legacy-product-viewer/product-viewer.png",
      "tests/reports/legacy-material-studio/material-studio.png",
      "tests/reports/legacy-asset-viewer/asset-viewer.png",
      "tests/reports/legacy-rendering-showcase/rendering-showcase.png",
      "tests/reports/three-compat-gallery/product/premium-product-viewer.png"
    ].every((path) => doc.includes(path)),
    detail: "legacy and Three.js compatibility failure screenshots are explicitly not public-worthy"
  },
  {
    id: "evidence-reports-pass",
    pass: evidenceReports.every((path) => reportPasses(path)),
    detail: evidenceReports.join(", ")
  },
  {
    id: "no-overclaim",
    pass: !/full\s+three\.js\s+replacement\s+today/i.test(doc)
      && !/full\s+webgpu\s+parity\s+today/i.test(doc)
      && !/broad\s+performance\s+superiority\s+today/i.test(doc)
      && doc.includes("not a full Three.js replacement yet"),
    detail: "decision record keeps broad replacement and superiority claims blocked"
  },
  {
    id: "roadmap-depth",
    pass: sectionLineCount(doc, "## Next Product Roadmap After Production runtime") >= 10,
    detail: "roadmap has at least 10 concrete next steps"
  }
];

const report = {
  schema: "a3d-production-runtime-product-decision-record",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  docPath,
  publicWorthyScreenshotCount: publicScreenshots.length,
  blockedClaimCount: blockedClaims.length,
  evidenceReports: evidenceReports.map((path) => ({ path, exists: existsSync(resolve(path)), pass: reportPasses(path) })),
  checks
};

mkdirSync(dirname(resolve(reportPath)), { recursive: true });
writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function missing(items: readonly string[], content: string): readonly string[] {
  return items.filter((item) => !content.includes(item));
}

function reportPasses(path: string): boolean {
  const fullPath = resolve(path);
  if (!existsSync(fullPath)) return false;
  try {
    const value = JSON.parse(readFileSync(fullPath, "utf8")) as { pass?: unknown };
    return value.pass === true;
  } catch {
    return false;
  }
}

function sectionLineCount(markdown: string, heading: string): number {
  const start = markdown.indexOf(heading);
  if (start < 0) return 0;
  const rest = markdown.slice(start + heading.length);
  const next = rest.search(/\n##\s+/);
  const section = next >= 0 ? rest.slice(0, next) : rest;
  return section.split(/\r?\n/).filter((line) => /^\d+\.\s+/.test(line.trim())).length;
}
