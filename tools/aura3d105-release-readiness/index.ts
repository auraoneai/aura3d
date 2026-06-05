import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Aura3D105Area =
  | "runtime-regression"
  | "animation-runtime"
  | "editor-tools"
  | "visual-scripting"
  | "assets"
  | "templates";

type JsonRecord = Record<string, unknown>;

export type Aura3D105ReportInspection = {
  readonly path: string;
  readonly exists: boolean;
  readonly ok: boolean;
  readonly status: "pass" | "missing" | "invalid-json" | "not-passing" | "pending" | "release-not-ready";
  readonly parseError?: string;
  readonly issues: readonly string[];
  readonly json?: JsonRecord;
};

export type Aura3D105ScreenshotInspection = {
  readonly path: string;
  readonly exists: boolean;
  readonly ok: boolean;
  readonly byteSize: number;
  readonly validPngSignature: boolean;
  readonly issues: readonly string[];
};

export type Aura3D105AreaResult = {
  readonly id: Aura3D105Area;
  readonly title: string;
  readonly ok: boolean;
  readonly requiredReports: readonly Aura3D105ReportInspection[];
  readonly requiredScreenshots: readonly Aura3D105ScreenshotInspection[];
  readonly issues: readonly string[];
};

export type Aura3D105ReleaseReadinessReport = {
  readonly schema: "aura3d105-release-readiness";
  readonly ok: boolean;
  readonly status: "release-ready" | "release-blocked";
  readonly generatedAt: string;
  readonly selectedAreas: readonly Aura3D105Area[];
  readonly reportPath: string;
  readonly claimBoundary: string;
  readonly areas: readonly Aura3D105AreaResult[];
  readonly missingReports: readonly string[];
  readonly failingReports: readonly string[];
  readonly missingScreenshots: readonly string[];
  readonly failingScreenshots: readonly string[];
  readonly blockers: readonly string[];
  readonly optionalEvidence: {
    readonly auraClashShowcase: readonly Aura3D105ScreenshotInspection[];
  };
};

type AreaSpec = {
  readonly id: Aura3D105Area;
  readonly title: string;
  readonly requiredReports: readonly string[];
  readonly requiredScreenshots: readonly string[];
  readonly validator?: (reports: readonly Aura3D105ReportInspection[]) => readonly string[];
};

const defaultReportPath = "tests/reports/aura3d105/release.json";

const areaSpecs: readonly AreaSpec[] = [
  {
    id: "runtime-regression",
    title: "1.0.4 runtime regression baseline",
    requiredReports: [
      "tests/reports/aura3d104/typecheck.json",
      "tests/reports/aura3d104/build.json",
      "tests/reports/game-runtime/release.json"
    ],
    requiredScreenshots: []
  },
  {
    id: "animation-runtime",
    title: "Skeletal animation, blending, events, and visemes",
    requiredReports: [
      "tests/reports/animation-runtime/unit.json",
      "tests/reports/animation-runtime/browser.json",
      "tests/reports/animation-runtime/evidence.json",
      "tests/reports/animation-runtime/package-smoke.json"
    ],
    requiredScreenshots: [
      "tests/reports/animation-runtime/named-clip-playback.png",
      "tests/reports/animation-runtime/clip-restart.png",
      "tests/reports/animation-runtime/clip-blend.png",
      "tests/reports/animation-runtime/animation-event-hitbox.png",
      "tests/reports/animation-runtime/viseme-blendshape-sync.png"
    ]
  },
  {
    id: "editor-tools",
    title: "Editor shell, timeline, inspector, and visual graph tools",
    requiredReports: [
      "tests/reports/editor-tools/unit.json",
      "tests/reports/editor-tools/browser.json",
      "tests/reports/editor-tools/evidence.json",
      "tests/reports/editor-tools/package-smoke.json"
    ],
    requiredScreenshots: [
      "tests/reports/editor-tools/editor-selection-inspector.png",
      "tests/reports/editor-tools/editor-timeline-scrub.png",
      "tests/reports/editor-tools/editor-visual-graph.png"
    ]
  },
  {
    id: "visual-scripting",
    title: "Visual scripting runtime bridge",
    requiredReports: [
      "tests/reports/visual-scripting/unit.json",
      "tests/reports/visual-scripting/browser.json",
      "tests/reports/visual-scripting/evidence.json",
      "tests/reports/visual-scripting/package-smoke.json"
    ],
    requiredScreenshots: [
      "tests/reports/visual-scripting/runtime-node-motion.png",
      "tests/reports/visual-scripting/animation-event-graph.png"
    ]
  },
  {
    id: "assets",
    title: "Asset source, license, typed pull, and no-placeholder evidence",
    requiredReports: ["tests/reports/assets/provenance.json"],
    requiredScreenshots: [],
    validator: validateAssetProvenance
  },
  {
    id: "templates",
    title: "1.0.5 starter template smoke evidence",
    requiredReports: [
      "tests/reports/templates/fighting-game-smoke.json",
      "tests/reports/templates/cartoon-channel-smoke.json",
      "tests/reports/templates/prompt-cartoon-channel-smoke.json"
    ],
    requiredScreenshots: [
      "tests/reports/templates/fighting-game-first-frame.png",
      "tests/reports/templates/cartoon-channel-first-frame.png",
      "tests/reports/templates/prompt-cartoon-channel-first-frame.png"
    ]
  }
] as const;

const optionalAuraClashScreenshots = [
  "apps/aura-clash-showcase/launch-evidence/first-frame.png",
  "apps/aura-clash-showcase/launch-evidence/combat-frame.png"
] as const;

export function createAura3D105ReleaseReadinessReport(options: {
  readonly repoRoot?: string;
  readonly reportPath?: string;
  readonly areas?: readonly Aura3D105Area[];
  readonly generatedAt?: string;
} = {}): Aura3D105ReleaseReadinessReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const reportPath = options.reportPath ?? defaultReportPath;
  const selectedAreas = normalizeAreas(options.areas);
  const selectedSpecs = areaSpecs.filter((spec) => selectedAreas.includes(spec.id));
  const areaResults = selectedSpecs.map((spec) => inspectArea(repoRoot, spec));
  const optionalEvidence = {
    auraClashShowcase: optionalAuraClashScreenshots.map((path) => inspectScreenshot(repoRoot, path))
  };

  const missingReports = areaResults.flatMap((area) =>
    area.requiredReports
      .filter((report) => !report.exists)
      .map((report) => report.path)
  );
  const failingReports = areaResults.flatMap((area) =>
    area.requiredReports
      .filter((report) => report.exists && !report.ok)
      .map((report) => report.path)
  );
  const missingScreenshots = areaResults.flatMap((area) =>
    area.requiredScreenshots
      .filter((screenshot) => !screenshot.exists)
      .map((screenshot) => screenshot.path)
  );
  const failingScreenshots = areaResults.flatMap((area) =>
    area.requiredScreenshots
      .filter((screenshot) => screenshot.exists && !screenshot.ok)
      .map((screenshot) => screenshot.path)
  );
  const blockers = areaResults.flatMap((area) => area.issues.map((issue) => `${area.id}: ${issue}`));
  const ok = areaResults.every((area) => area.ok);

  return {
    schema: "aura3d105-release-readiness",
    ok,
    status: ok ? "release-ready" : "release-blocked",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    selectedAreas,
    reportPath,
    claimBoundary:
      "This verifier only passes when concrete 1.0.5 reports and screenshots already exist and are passing. Missing reports, pending/source-only manifests, releaseReady:false reports, invalid JSON, placeholder asset provenance, and empty screenshots are blocking evidence.",
    areas: areaResults,
    missingReports,
    failingReports,
    missingScreenshots,
    failingScreenshots,
    blockers,
    optionalEvidence
  };
}

export function writeAura3D105ReleaseReadinessReport(
  report: Aura3D105ReleaseReadinessReport,
  repoRoot = process.cwd(),
  reportPath = report.reportPath
): void {
  const absolutePath = resolve(repoRoot, reportPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function inspectArea(repoRoot: string, spec: AreaSpec): Aura3D105AreaResult {
  const requiredReports = spec.requiredReports.map((path) => inspectJsonReport(repoRoot, path));
  const requiredScreenshots = spec.requiredScreenshots.map((path) => inspectScreenshot(repoRoot, path));
  const validatorIssues = spec.validator?.(requiredReports) ?? [];
  const reportIssues = requiredReports.flatMap((report) => report.issues.map((issue) => `${report.path}: ${issue}`));
  const screenshotIssues = requiredScreenshots.flatMap((screenshot) =>
    screenshot.issues.map((issue) => `${screenshot.path}: ${issue}`)
  );
  const issues = [...reportIssues, ...screenshotIssues, ...validatorIssues];

  return {
    id: spec.id,
    title: spec.title,
    ok: issues.length === 0,
    requiredReports,
    requiredScreenshots,
    issues
  };
}

function inspectJsonReport(repoRoot: string, path: string): Aura3D105ReportInspection {
  const absolutePath = resolve(repoRoot, path);

  if (!existsSync(absolutePath)) {
    return {
      path,
      exists: false,
      ok: false,
      status: "missing",
      issues: ["Required report is missing."]
    };
  }

  let json: JsonRecord;
  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return {
        path,
        exists: true,
        ok: false,
        status: "invalid-json",
        issues: ["Report JSON root must be an object."]
      };
    }
    json = parsed;
  } catch (error) {
    return {
      path,
      exists: true,
      ok: false,
      status: "invalid-json",
      parseError: error instanceof Error ? error.message : String(error),
      issues: ["Report is not valid JSON."]
    };
  }

  const statusValue = typeof json.status === "string" ? json.status : "";
  const releaseReady = typeof json.releaseReady === "boolean" ? json.releaseReady : undefined;
  const pending = /pending|execution-required|source-only|blocked|incomplete/i.test(statusValue);
  const hasPassingFlag = json.ok === true || json.pass === true;
  const issues: string[] = [];

  if (!hasPassingFlag) {
    issues.push("Report must include ok:true or pass:true.");
  }
  if (pending) {
    issues.push(`Report status is not final passing evidence: ${statusValue}.`);
  }
  if (releaseReady === false) {
    issues.push("Report has releaseReady:false.");
  }

  const status = issues.length === 0
    ? "pass"
    : pending
      ? "pending"
      : releaseReady === false
        ? "release-not-ready"
        : "not-passing";

  return {
    path,
    exists: true,
    ok: issues.length === 0,
    status,
    issues,
    json: redactNoisyReportFields(json) as JsonRecord
  };
}

function inspectScreenshot(repoRoot: string, path: string): Aura3D105ScreenshotInspection {
  const absolutePath = resolve(repoRoot, path);

  if (!existsSync(absolutePath)) {
    return {
      path,
      exists: false,
      ok: false,
      byteSize: 0,
      validPngSignature: false,
      issues: ["Required screenshot is missing."]
    };
  }

  const stat = statSync(absolutePath);
  const bytes = readFileSync(absolutePath);
  const validPngSignature =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const issues: string[] = [];

  if (stat.size < 16) {
    issues.push("Screenshot file is too small to be credible PNG evidence.");
  }
  if (!validPngSignature) {
    issues.push("Screenshot does not have a PNG signature.");
  }

  return {
    path,
    exists: true,
    ok: issues.length === 0,
    byteSize: stat.size,
    validPngSignature,
    issues
  };
}

function validateAssetProvenance(reports: readonly Aura3D105ReportInspection[]): readonly string[] {
  const report = reports.find((entry) => entry.path === "tests/reports/assets/provenance.json");
  if (!report?.json || !report.ok) return [];

  const assets = arrayFromKnownKeys(report.json, ["assets", "assetProvenance", "provenance", "entries"]);
  if (assets.length === 0) {
    return ["tests/reports/assets/provenance.json: Asset provenance report must include a non-empty assets, assetProvenance, provenance, or entries array."];
  }

  const issues: string[] = [];
  assets.forEach((asset, index) => {
    if (!isRecord(asset)) {
      issues.push(`tests/reports/assets/provenance.json: Asset entry ${index} must be an object.`);
      return;
    }

    const typedName = firstString(asset, ["typedName", "generatedName", "name", "id"]);
    const source = firstString(asset, ["source", "sourceUrl", "sourcePath", "url", "path"]);
    const license = firstString(asset, ["license", "licenseName", "spdx"]);
    const checksum = firstString(asset, ["sha256", "checksum", "hash"]);
    const text = [typedName, source, license].join(" ").toLowerCase();

    if (!typedName) issues.push(`tests/reports/assets/provenance.json: Asset entry ${index} is missing a typed/generated name.`);
    if (!source) issues.push(`tests/reports/assets/provenance.json: Asset entry ${index} is missing source evidence.`);
    if (!license || /^unknown|none|unlicensed$/i.test(license)) {
      issues.push(`tests/reports/assets/provenance.json: Asset entry ${index} is missing valid license evidence.`);
    }
    if (!checksum) issues.push(`tests/reports/assets/provenance.json: Asset entry ${index} is missing checksum evidence.`);
    if (/placeholder|todo|example\.com|dummy/.test(text)) {
      issues.push(`tests/reports/assets/provenance.json: Asset entry ${index} appears to be placeholder evidence.`);
    }
  });

  return issues;
}

function arrayFromKnownKeys(record: JsonRecord, keys: readonly string[]): readonly unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function firstString(record: JsonRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

function normalizeAreas(areas: readonly Aura3D105Area[] | undefined): readonly Aura3D105Area[] {
  if (!areas || areas.length === 0) return areaSpecs.map((spec) => spec.id);
  return [...new Set(areas)];
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function redactNoisyReportFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactNoisyReportFields(item));
  }

  if (!isRecord(value)) {
    if (typeof value === "string" && value.length > 1200) {
      return `${value.slice(0, 1200)}...[truncated ${value.length - 1200} chars]`;
    }
    return value;
  }

  const output: JsonRecord = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (["stdout", "stderr", "stdoutTail", "stderrTail"].includes(key)) {
      if (typeof nestedValue === "string" && nestedValue.length > 0) {
        output[`${key}Length`] = nestedValue.length;
      }
      continue;
    }
    output[key] = redactNoisyReportFields(nestedValue);
  }
  return output;
}

function parseCli(argv: readonly string[]): {
  readonly repoRoot: string;
  readonly reportPath: string;
  readonly areas?: readonly Aura3D105Area[];
  readonly reportOnly: boolean;
} {
  let repoRoot = process.cwd();
  let reportPath = defaultReportPath;
  const areas: Aura3D105Area[] = [];
  let reportOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      repoRoot = argv[index + 1] ?? repoRoot;
      index += 1;
      continue;
    }
    if (arg === "--out" || arg === "--output") {
      reportPath = argv[index + 1] ?? reportPath;
      index += 1;
      continue;
    }
    if (arg === "--area") {
      const value = argv[index + 1] ?? "";
      if (value !== "all") areas.push(...parseAreas(value));
      index += 1;
      continue;
    }
    if (arg === "--report-only") {
      reportOnly = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    repoRoot,
    reportPath,
    areas: areas.length > 0 ? areas : undefined,
    reportOnly
  };
}

function parseAreas(value: string): readonly Aura3D105Area[] {
  const known = new Set(areaSpecs.map((spec) => spec.id));
  return value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    if (!known.has(part as Aura3D105Area)) {
      throw new Error(`Unknown Aura3D 1.0.5 area: ${part}`);
    }
    return part as Aura3D105Area;
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const args = parseCli(process.argv.slice(2));
    const report = createAura3D105ReleaseReadinessReport({
      repoRoot: args.repoRoot,
      reportPath: args.reportPath,
      areas: args.areas
    });
    writeAura3D105ReleaseReadinessReport(report, args.repoRoot, args.reportPath);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok && !args.reportOnly) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
