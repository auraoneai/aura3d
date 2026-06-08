import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  createAnimationStudioDocsClaimsReport,
  writeAnimationStudioDocsClaimsReport
} from "../animation-studio-docs-claims/index.js";
import {
  createAnimationStudioMotionQualityReport,
  writeAnimationStudioMotionQualityReport
} from "../animation-studio-motion-quality-gate/index.js";
import {
  createAnimationStudioPackageProofReport,
  writeAnimationStudioPackageProofReport
} from "../animation-studio-package-proof/index.js";
import {
  createAnimationStudioTemplateSmokeReport,
  writeAnimationStudioTemplateSmokeReport
} from "../animation-studio-template-smoke/index.js";
import {
  createAnimationStudioVisualQualityReport,
  writeAnimationStudioVisualQualityReport
} from "../animation-studio-visual-quality-gate/index.js";

export interface Aura3D11GateResult {
  readonly id: string;
  readonly ok: boolean;
  readonly reportPath: string;
  readonly summary: string;
  readonly blockers: readonly string[];
}

export interface Aura3D11ReleaseReadinessReport {
  readonly schema: "aura3d11-release-readiness/v1";
  readonly ok: boolean;
  readonly status: "release-ready" | "release-blocked";
  readonly generatedAt: string;
  readonly packageDir: string;
  readonly gates: readonly Aura3D11GateResult[];
  readonly blockers: readonly string[];
}

export interface Aura3D11ReleaseReadinessOptions {
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly executeTemplateSmoke?: boolean;
}

const defaultOut = "tests/reports/aura3d11/readiness.json";

export function createAura3D11ReleaseReadinessReport(root = process.cwd(), options: Aura3D11ReleaseReadinessOptions = {}): Aura3D11ReleaseReadinessReport {
  const packageDir = options.packageDir ?? "dist/episodes/moon-garden-001";
  const packageReportPath = "tests/reports/aura3d11/animation-package.json";
  const visualReportPath = "tests/reports/aura3d11/animation-visual-quality.json";
  const motionReportPath = "tests/reports/aura3d11/animation-motion-quality.json";
  const docsReportPath = "tests/reports/aura3d11/animation-docs-claims.json";
  const templateReportPath = "tests/reports/aura3d11/animation-template-smoke.json";

  const packageReport = createAnimationStudioPackageProofReport(root, { packageDir, generatedAt: options.generatedAt });
  const visualReport = createAnimationStudioVisualQualityReport(root, { packageDir, generatedAt: options.generatedAt });
  const motionReport = createAnimationStudioMotionQualityReport(root, { packageDir, generatedAt: options.generatedAt });
  const docsReport = createAnimationStudioDocsClaimsReport(root, { generatedAt: options.generatedAt });
  const templateReport = createAnimationStudioTemplateSmokeReport(root, {
    generatedAt: options.generatedAt,
    executeExternal: options.executeTemplateSmoke
  });

  writeAnimationStudioPackageProofReport(root, packageReport, packageReportPath);
  writeAnimationStudioVisualQualityReport(root, visualReport, visualReportPath);
  writeAnimationStudioMotionQualityReport(root, motionReport, motionReportPath);
  writeAnimationStudioDocsClaimsReport(root, docsReport, docsReportPath);
  writeAnimationStudioTemplateSmokeReport(root, templateReport, templateReportPath);

  const gates: Aura3D11GateResult[] = [
    {
      id: "animation-package",
      ok: packageReport.ok,
      reportPath: packageReportPath,
      summary: packageReport.ok ? "Episode package contains required publish artifacts." : "Episode package proof is incomplete.",
      blockers: packageReport.blockers
    },
    {
      id: "visual-quality",
      ok: visualReport.ok,
      reportPath: visualReportPath,
      summary: visualReport.ok ? "Representative frames pass visual quality checks." : "Visual quality proof is incomplete.",
      blockers: visualReport.blockers
    },
    {
      id: "motion-quality",
      ok: motionReport.ok,
      reportPath: motionReportPath,
      summary: motionReport.ok ? "Motion proof includes independent character/body/mouth motion." : "Motion quality proof is incomplete or fake-motion evidence is present.",
      blockers: motionReport.blockers
    },
    {
      id: "docs-claims",
      ok: docsReport.ok,
      reportPath: docsReportPath,
      summary: docsReport.ok ? "Docs and marketing avoid 1.1 animation overclaims." : "Docs or marketing contain animation overclaims.",
      blockers: docsReport.blockers
    },
    {
      id: "template-smoke",
      ok: templateReport.ok,
      reportPath: templateReportPath,
      summary: templateReport.ok ? "Animation Studio template scripts/source gates pass." : "Animation Studio template smoke/source gates are incomplete.",
      blockers: templateReport.blockers
    }
  ];
  const blockers = gates.flatMap((gate) => gate.blockers.map((blocker) => `${gate.id}: ${blocker}`));
  return {
    schema: "aura3d11-release-readiness/v1",
    ok: blockers.length === 0,
    status: blockers.length === 0 ? "release-ready" : "release-blocked",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    packageDir,
    gates,
    blockers
  };
}

export function writeAura3D11ReleaseReadinessReport(root: string, report: Aura3D11ReleaseReadinessReport, out = defaultOut): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv: readonly string[]) {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const currentScript = process.argv[1] ? relative(process.cwd(), process.argv[1]) : "";
if (currentScript.endsWith("tools/aura3d11-release-readiness/index.ts") || currentScript.endsWith("tools/aura3d11-release-readiness/index.js")) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createAura3D11ReleaseReadinessReport(root, {
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined,
    executeTemplateSmoke: args["execute-template-smoke"] === true
  });
  writeAura3D11ReleaseReadinessReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  }
}
