import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const docPath = "docs/project/v6-roadmap-product-decision-record.md";
const reportPath = "tests/reports/v6-product-decision-record.json";
const doc = existsSync(resolve(docPath)) ? readFileSync(resolve(docPath), "utf8") : "";

const requiredHeadings = [
  "## Decision",
  "## What G3D V6 Does Better Than Raw Three.js Today",
  "## What G3D V6 Matches Three.js On Today",
  "## What Three.js Still Does Better",
  "## Production-Ready V6 Workflows",
  "## Experimental V6 Workflows",
  "## Blocked Claims After V6",
  "## Public-Worthy Screenshots",
  "## Screenshots Not Public-Worthy",
  "## Next Product Roadmap After V6",
  "## Evidence"
] as const;

const publicScreenshots = [
  "tests/reports/v6-webgl2/damaged-helmet-webgl2.png",
  "tests/reports/v6-hd-flagship/composed-product-hd.png",
  "tests/reports/v6-hd-product-hero/damaged-helmet-hero.png",
  "tests/reports/v6-hd-materials/pbr-materials-hd.png",
  "tests/reports/v6-pbr-hdr/damaged-helmet-studio-hdr.png",
  "tests/reports/v6-pbr-hdr/damaged-helmet-sunset-hdr.png",
  "tests/reports/v6-gltf-render/damaged-helmet.png",
  "tests/reports/v6-gltf-render/clearcoat.png",
  "tests/reports/v6-gltf-render/cesium-man.png",
  "tests/reports/v6-effects/damaged-helmet-effects.png",
  "tests/reports/v6-app-suite/v6-product-configurator.png",
  "tests/reports/v6-app-suite/v6-asset-inspector.png",
  "tests/reports/v6-app-suite/v6-material-studio.png",
  "tests/reports/v6-app-suite/v6-character-viewer.png",
  "tests/reports/v6-app-suite/v6-cinematic-postprocess.png",
  "tests/reports/v6-external-consumer/external-consumer-render.png"
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
  "tests/reports/v6-release-readiness.json",
  "tests/reports/v6-hd-flagship-readiness.json",
  "tests/reports/v6-hd-product-hero-readiness.json",
  "tests/reports/v6-hd-materials-readiness.json",
  "tests/reports/v6-production-renderer-readiness.json",
  "tests/reports/v6-gallery-readiness.json",
  "tests/reports/v6-threejs-parity-readiness.json",
  "tests/reports/v6-external-consumer.json",
  "tests/reports/v6-performance-readiness.json",
  "tests/reports/v6-claim-registry.json"
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
      "Production-Ready V6 Workflows",
      "Experimental V6 Workflows",
      "Blocked Claims After V6",
      "Public-Worthy Screenshots",
      "Screenshots Not Public-Worthy",
      "Next Product Roadmap After V6"
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
      "tests/reports/product-viewer-v1/product-viewer.png",
      "tests/reports/material-studio-v1/material-studio.png",
      "tests/reports/asset-viewer-v1/asset-viewer.png",
      "tests/reports/rendering-showcase-v1/rendering-showcase.png",
      "tests/reports/v5-gallery/product/premium-product-viewer.png"
    ].every((path) => doc.includes(path)),
    detail: "V1 and V5 failure screenshots are explicitly not public-worthy"
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
    pass: sectionLineCount(doc, "## Next Product Roadmap After V6") >= 10,
    detail: "roadmap has at least 10 concrete next steps"
  }
];

const report = {
  schema: "g3d-v6-product-decision-record/v1",
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
