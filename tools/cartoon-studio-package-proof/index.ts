import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

export interface CartoonStudioPackageArtifact {
  readonly id: string;
  readonly path: string;
  readonly exists: boolean;
  readonly bytes: number;
  readonly ok: boolean;
  readonly detail: string;
}

export interface CartoonStudioPackageProofReport {
  readonly schema: "cartoon-studio-package-proof/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly packageDir: string;
  readonly artifacts: readonly CartoonStudioPackageArtifact[];
  readonly sourceIntegrity: CartoonStudioSourceIntegrityReport;
  readonly blockers: readonly string[];
}

export interface CartoonStudioSourceIntegrityReport {
  readonly ok: boolean;
  readonly scannedJsonFiles: readonly string[];
  readonly forbiddenEvidence: readonly CartoonStudioForbiddenEvidence[];
}

export interface CartoonStudioForbiddenEvidence {
  readonly path: string;
  readonly reason: "sourceOnly" | "notTrue3D" | "image-puppet";
  readonly detail: string;
}

export interface CartoonStudioPackageProofOptions {
  readonly packageDir?: string;
  readonly out?: string;
  readonly generatedAt?: string;
  readonly minVideoBytes?: number;
  readonly minImageBytes?: number;
}

const defaultPackageDir = "dist/episodes/moon-garden-001";
const defaultOut = "tests/reports/aura3d11/cartoon-package.json";

interface RequiredCartoonStudioArtifact {
  readonly id: string;
  readonly path: string;
  readonly minBytes: number;
  readonly extensions: readonly string[];
  readonly detail: string;
}

const requiredArtifacts: readonly RequiredCartoonStudioArtifact[] = [
  { id: "episode-webm", path: "episode.webm", minBytes: 32_768, extensions: [".webm"], detail: "Playable WebM episode output" },
  { id: "thumbnail", path: "thumbnail.png", minBytes: 1_024, extensions: [".png"], detail: "Thumbnail captured from route state" },
  { id: "captions-vtt", path: "captions.vtt", minBytes: 32, extensions: [".vtt"], detail: "VTT captions" },
  { id: "captions-srt", path: "captions.srt", minBytes: 32, extensions: [".srt"], detail: "SRT captions" },
  { id: "metadata", path: "metadata.json", minBytes: 32, extensions: [".json"], detail: "Episode metadata" },
  { id: "prompt-animation-evidence", path: "prompt-animation-evidence.json", minBytes: 32, extensions: [".json"], detail: "Prompt animation readiness evidence" },
  { id: "route-proof", path: "route-proof.json", minBytes: 32, extensions: [".json"], detail: "Browser route proof" },
  { id: "asset-provenance", path: "asset-provenance.json", minBytes: 32, extensions: [".json"], detail: "Typed asset provenance" },
  { id: "render-manifest", path: "render-manifest.json", minBytes: 32, extensions: [".json"], detail: "Render output manifest" },
  { id: "visual-acceptance", path: "visual-acceptance.json", minBytes: 32, extensions: [".json"], detail: "Visual and motion acceptance evidence" },
  { id: "review-package", path: "review-package.md", minBytes: 64, extensions: [".md"], detail: "Human review package" }
] as const;

export function createCartoonStudioPackageProofReport(root = process.cwd(), options: CartoonStudioPackageProofOptions = {}): CartoonStudioPackageProofReport {
  const packageDir = options.packageDir ?? defaultPackageDir;
  const absolutePackageDir = join(root, packageDir);
  const minVideoBytes = options.minVideoBytes ?? requiredArtifacts[0].minBytes;
  const minImageBytes = options.minImageBytes ?? 1_024;
  const artifacts = requiredArtifacts.map((artifact): CartoonStudioPackageArtifact => {
    const absolutePath = join(absolutePackageDir, artifact.path);
    const exists = existsSync(absolutePath);
    const bytes = exists ? statSync(absolutePath).size : 0;
    const minBytes = artifact.id === "episode-webm"
      ? minVideoBytes
      : artifact.id === "thumbnail"
        ? minImageBytes
        : artifact.minBytes;
    const extensionOk = artifact.extensions.includes(extname(artifact.path));
    const ok = exists && bytes >= minBytes && extensionOk;
    return {
      id: artifact.id,
      path: join(packageDir, artifact.path),
      exists,
      bytes,
      ok,
      detail: ok
        ? `${artifact.detail} exists with ${bytes} byte(s).`
        : `${artifact.detail} missing or below ${minBytes} byte(s).`
    };
  });

  const jsonPaths = requiredArtifacts
    .filter((artifact) => artifact.path.endsWith(".json"))
    .map((artifact) => join(packageDir, artifact.path));
  const sourceIntegrity = inspectSourceIntegrity(root, jsonPaths);
  const blockers = [
    ...artifacts.filter((artifact) => !artifact.ok).map((artifact) => `${artifact.id}: ${artifact.detail}`),
    ...sourceIntegrity.forbiddenEvidence.map((evidence) => `${evidence.path}: ${evidence.detail}`)
  ];

  return {
    schema: "cartoon-studio-package-proof/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    packageDir,
    artifacts,
    sourceIntegrity,
    blockers
  };
}

export function inspectSourceIntegrity(root: string, jsonPaths: readonly string[]): CartoonStudioSourceIntegrityReport {
  const scannedJsonFiles: string[] = [];
  const forbiddenEvidence: CartoonStudioForbiddenEvidence[] = [];
  for (const path of jsonPaths) {
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath)) continue;
    scannedJsonFiles.push(path);
    const raw = readFileSync(absolutePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      forbiddenEvidence.push({
        path,
        reason: "sourceOnly",
        detail: "Evidence JSON is not parseable, so it cannot prove publish readiness."
      });
      continue;
    }
    collectForbiddenEvidence(parsed, path, forbiddenEvidence);
  }
  return {
    ok: forbiddenEvidence.length === 0,
    scannedJsonFiles,
    forbiddenEvidence
  };
}

export function collectForbiddenEvidence(value: unknown, path: string, output: CartoonStudioForbiddenEvidence[], keyPath = "$"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenEvidence(entry, path, output, `${keyPath}[${index}]`));
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.sourceOnly === true) {
    output.push({
      path,
      reason: "sourceOnly",
      detail: `${keyPath}.sourceOnly is true; source-only evidence cannot satisfy 1.1 publish readiness.`
    });
  }
  if (record.notTrue3D === true) {
    output.push({
      path,
      reason: "notTrue3D",
      detail: `${keyPath}.notTrue3D is true; non-3D/fake-motion proof cannot satisfy 1.1 publish readiness.`
    });
  }
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string" && /image-puppet|cartoon-image-puppet-animation|view=image-puppet/i.test(entry)) {
      output.push({
        path,
        reason: "image-puppet",
        detail: `${keyPath}.${key} references rejected image-puppet evidence: ${entry}`
      });
    }
    collectForbiddenEvidence(entry, path, output, `${keyPath}.${key}`);
  }
}

export function writeCartoonStudioPackageProofReport(root: string, report: CartoonStudioPackageProofReport, out = defaultOut): void {
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
if (currentScript.endsWith("tools/cartoon-studio-package-proof/index.ts") || currentScript.endsWith("tools/cartoon-studio-package-proof/index.js")) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createCartoonStudioPackageProofReport(root, {
    packageDir: typeof args["package-dir"] === "string" ? args["package-dir"] : undefined,
    out: typeof args.out === "string" ? args.out : undefined
  });
  writeCartoonStudioPackageProofReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  }
}
