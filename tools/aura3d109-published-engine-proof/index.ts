import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

interface PublishedEngineProofReport {
  readonly schema: "aura3d109-published-engine-proof";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly packageName: "@aura3d/engine";
  readonly version: string;
  readonly tarball: string | null;
  readonly requiredFiles: readonly string[];
  readonly presentFiles: readonly string[];
  readonly blockers: readonly string[];
}

const defaultOutPath = "tests/reports/aura3d109/published-engine-proof.json";
const requiredFiles = [
  "package/dist/engine/production-runtime/TypedGLBActor.js",
  "package/dist/engine/production-runtime/TypedGLBActor.d.ts",
  "package/dist/engine/production-runtime/index.js",
  "package/dist/engine/agent-api/GameAppRuntime.js",
  "package/dist/engine/agent-api/GameAppRuntime.d.ts",
  "package/package.json"
] as const;

function readVersion(root: string): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { readonly version?: string };
  if (!pkg.version) throw new Error("Root package.json has no version.");
  return pkg.version;
}

function run(root: string, outPath = defaultOutPath): PublishedEngineProofReport {
  const version = readVersion(root);
  const workdir = mkdtempSync(join(tmpdir(), "aura3d-published-engine-"));
  const blockers: string[] = [];
  let tarball: string | null = null;
  try {
    const output = execFileSync("npm", ["pack", `@aura3d/engine@${version}`, "--pack-destination", workdir], {
      cwd: workdir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    const fileName = output.split(/\r?\n/).filter(Boolean).at(-1);
    if (!fileName) {
      blockers.push(`npm pack @aura3d/engine@${version} did not return a tarball filename.`);
    } else {
      tarball = join(workdir, fileName);
      execFileSync("tar", ["-xzf", tarball], { cwd: workdir, stdio: "ignore" });
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }

  const presentFiles = requiredFiles.filter((file) => existsSync(join(workdir, file)));
  for (const file of requiredFiles) {
    if (!presentFiles.includes(file)) blockers.push(`Published @aura3d/engine@${version} is missing ${file}.`);
  }
  if (existsSync(join(workdir, "package/package.json"))) {
    const pkg = JSON.parse(readFileSync(join(workdir, "package/package.json"), "utf8")) as {
      readonly name?: string;
      readonly version?: string;
    };
    if (pkg.name !== "@aura3d/engine") blockers.push(`Packed package name is ${String(pkg.name)} instead of @aura3d/engine.`);
    if (pkg.version !== version) blockers.push(`Packed package version is ${String(pkg.version)} instead of ${version}.`);
  }

  const report: PublishedEngineProofReport = {
    schema: "aura3d109-published-engine-proof",
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    packageName: "@aura3d/engine",
    version,
    tarball,
    requiredFiles,
    presentFiles,
    blockers
  };
  const absoluteOut = join(root, outPath);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;
const report = run(process.cwd(), outPath);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
