import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface AnimationEngineDeadCodeReport {
  readonly schema: "animation-engine-dead-code/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly scannedFileCount: number;
  readonly blockers: readonly string[];
}

export interface AnimationEngineDeadCodeOptions {
  readonly out?: string;
  readonly generatedAt?: string;
  readonly roots?: readonly string[];
}

const defaultOut = "tests/reports/animation-engine/dead-code.json";
// Production source roots only — never scan tests/reports (historical JSON) or dist (build output).
const defaultRoots = ["apps", "packages"];

// Modules that must never be imported from a production path again.
const forbiddenImports: ReadonlyArray<readonly [RegExp, string]> = [
  [/from\s+["'][^"']*fighters\/FighterController["']/, "import of removed fighters/FighterController"],
  [/from\s+["'][^"']*fighters\/FighterAI["']/, "import of removed fighters/FighterAI"],
  [/from\s+["'][^"']*animation\/(?:src\/)?Retargeting(?:\.js)?["']/, "import of removed legacy Retargeting stub"]
];

export function createAnimationEngineDeadCodeReport(root = process.cwd(), options: AnimationEngineDeadCodeOptions = {}): AnimationEngineDeadCodeReport {
  const roots = options.roots ?? defaultRoots;
  const files = roots.flatMap((dir) => listSourceFiles(root, dir));
  const blockers: string[] = [];

  // 1) The removed files must not exist on disk.
  const mustNotExist = [
    "apps/aura-clash-showcase/src/fighters/FighterController.ts",
    "apps/aura-clash-showcase/src/fighters/FighterAI.ts",
    "packages/animation/src/Retargeting.ts"
  ];
  for (const path of mustNotExist) {
    if (existsSync(join(root, path))) blockers.push(`${path} still exists (must be removed)`);
  }

  // 2) The legacy export must not be re-introduced.
  for (const indexFile of ["packages/animation/src/index.ts", "packages/animation/src/browser-index.ts"]) {
    const abs = join(root, indexFile);
    if (existsSync(abs) && /\.\/Retargeting\.js/.test(readFileSync(abs, "utf8"))) {
      blockers.push(`${indexFile} re-exports the removed legacy Retargeting module`);
    }
  }

  // 3) No production source may import the removed modules.
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      for (const [pattern, label] of forbiddenImports) {
        if (pattern.test(line)) blockers.push(`${file}:${index + 1} ${label}: ${line.trim()}`);
      }
    }
  }

  return {
    schema: "animation-engine-dead-code/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    scannedFileCount: files.length,
    blockers
  };
}

export function writeAnimationEngineDeadCodeReport(root: string, report: AnimationEngineDeadCodeReport, out = defaultOut): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function listSourceFiles(root: string, dir: string): string[] {
  const files: string[] = [];
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return files;
  const entries = readdirSync(absolute, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const child = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(root, child));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) files.push(child);
  }
  return files;
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
if (currentScript.endsWith("tools/animation-engine-dead-code-gate/index.ts") || currentScript.endsWith("tools/animation-engine-dead-code-gate/index.js")) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createAnimationEngineDeadCodeReport(root);
  writeAnimationEngineDeadCodeReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`animation-engine dead-code gate: OK (${report.scannedFileCount} source files scanned)`);
  }
}
