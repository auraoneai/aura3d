import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const tarballDir = resolve("tests/reports/release-tarballs");
const reportPath = resolve("tests/reports/packed-migration-consumer.json");
const migrationDocs = [
  "docs/migration/ecs-scripting-compatibility.md",
  "docs/migration/navigation-recast-2.0.md",
  "docs/migration/physics-rapier-2.0.md"
] as const;

interface CommandReceipt { command: string; ok: boolean; output: string }

function run(command: string, args: string[], cwd: string): CommandReceipt {
  try {
    const output = execFileSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    return { command: [command, ...args].join(" "), ok: true, output: output.trim() };
  } catch (error) {
    const value = error as { stdout?: string; stderr?: string; message?: string };
    return { command: [command, ...args].join(" "), ok: false, output: [value.stdout, value.stderr, value.message].filter(Boolean).join("\n").trim() };
  }
}

function packageManifests(): Array<{ name: string; version: string }> {
  const paths = ["package.json", ...readdirSync("packages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join("packages", entry.name, "package.json")))
    .map((entry) => join("packages", entry.name, "package.json"))];
  return paths.map((path) => JSON.parse(readFileSync(path, "utf8")) as { name: string; version: string; private?: boolean })
    .filter((manifest) => manifest.private !== true);
}

function tarballFor(name: string, version: string): string {
  const stem = name.replace(/^@/, "").replace("/", "-");
  return join(tarballDir, `${stem}-${version}.tgz`);
}

function typedBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```(?:ts|tsx|typescript)\s*\n([\s\S]*?)```/g)].map((match) => match[1]!.trim());
}

const packages = packageManifests();
const missingTarballs = packages.map((pkg) => tarballFor(pkg.name, pkg.version)).filter((path) => !existsSync(path));
if (missingTarballs.length > 0) throw new Error(`Missing exact release tarballs: ${missingTarballs.map((path) => basename(path)).join(", ")}`);

const workspace = mkdtempSync(join(tmpdir(), "aura3d-packed-migration-"));
try {
  const src = join(workspace, "src");
  mkdirSync(src, { recursive: true });
  const dependencies = Object.fromEntries(packages.map((pkg) => [pkg.name, `file:${tarballFor(pkg.name, pkg.version)}`]));
  writeFileSync(join(workspace, "package.json"), `${JSON.stringify({
    name: "aura3d-2-packed-migration-consumer",
    private: true,
    type: "module",
    dependencies,
    devDependencies: { typescript: "5.8.3" }
  }, null, 2)}\n`);
  writeFileSync(join(workspace, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true,
      // Rapier 0.20's public declarations use Symbol.dispose. Keep lib checking
      // enabled and include the standard disposable declarations explicitly so
      // this is a real dependency-contract compile, not a skipLibCheck pass.
      skipLibCheck: false, noEmit: true, lib: ["ES2022", "ESNext.Disposable", "DOM"], types: []
    },
    include: ["src/**/*.ts"]
  }, null, 2)}\n`);
  writeFileSync(join(src, "aura-assets.ts"), `export const assets = {
  levelNavigation: {
    kind: "aura-asset-ref",
    id: "levelNavigation",
    type: "navigation",
    format: "navmesh",
    url: "/aura-assets/level.navmesh",
    hash: "sha256-0000000000000000000000000000000000000000000000000000000000000000"
  }
} as const;\n`);

  const extractedExamples: Array<{ document: string; file: string; bytes: number }> = [];
  for (const document of migrationDocs) {
    const blocks = typedBlocks(readFileSync(document, "utf8"));
    blocks.forEach((block, index) => {
      const file = `${basename(document, ".md")}-${index + 1}.ts`;
      writeFileSync(join(src, file), `${block}\nexport {};\n`);
      extractedExamples.push({ document, file, bytes: Buffer.byteLength(block) });
    });
  }

  writeFileSync(join(src, "retained-adapters.ts"), `
import * as leanAlias from "@aura3d/engine/lean";
import * as productAlias from "@aura3d/engine/lean-product";
import * as gameAlias from "@aura3d/engine/lean-game";
import { World as AliasWorld } from "@aura3d/engine/ecs";
import { BehaviorHost as AliasBehaviorHost } from "@aura3d/engine/scripting";
import * as lean from "@aura3d/lean";
import * as product from "@aura3d/lean/product";
import * as game from "@aura3d/lean/game";
import { World } from "@aura3d/ecs";
import { BehaviorHost } from "@aura3d/scripting";
import { OrbitControls } from "@aura3d/three-compat/controls";
import { GLTFLoaderCompat } from "@aura3d/three-compat/loaders";
void [leanAlias, productAlias, gameAlias, AliasWorld, AliasBehaviorHost, lean, product, game, World, BehaviorHost, OrbitControls, GLTFLoaderCompat];
`);
  writeFileSync(join(src, "codemod.ts"), `
import * as lean from "@aura3d/engine/lean";
import * as product from "@aura3d/engine/lean-product";
import * as game from "@aura3d/engine/lean-game";
import { World } from "@aura3d/engine/ecs";
import { BehaviorHost } from "@aura3d/engine/scripting";
void [lean, product, game, World, BehaviorHost];
`);
  writeFileSync(join(workspace, "runtime.mjs"), `
const specifiers = [
  "@aura3d/engine/lean", "@aura3d/engine/lean-product", "@aura3d/engine/lean-game",
  "@aura3d/engine/ecs", "@aura3d/engine/scripting", "@aura3d/lean",
  "@aura3d/lean/product", "@aura3d/lean/game", "@aura3d/ecs", "@aura3d/scripting",
  "@aura3d/three-compat", "@aura3d/three-compat/controls", "@aura3d/three-compat/loaders"
];
for (const specifier of specifiers) {
  const loaded = await import(specifier);
  if (Object.keys(loaded).length === 0) throw new Error(specifier + " exposed no runtime exports");
}
const compat = await import("@aura3d/three-compat");
const migrated = compat.migrateThreeToA3D('import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";');
const warning = migrated.warnings.find((entry) => entry.code === "postprocessing-unsupported");
if (!warning || !warning.message.includes("EffectComposer.js") || !warning.message.includes("effects.bloom()")) {
  throw new Error("removed postprocessing adapter did not emit actionable migration guidance");
}
console.log(JSON.stringify({ imported: specifiers.length, warning: warning.code }));
`);

  const install = run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], workspace);
  const codemod = install.ok
    ? run("pnpm", ["exec", "tsx", "--tsconfig", resolve("tsconfig.base.json"), resolve("tools/migrate-2.0/index.ts"), join(src, "codemod.ts")], process.cwd())
    : install;
  const codemodSource = readFileSync(join(src, "codemod.ts"), "utf8");
  const codemodExact = !codemodSource.includes("@aura3d/engine/lean")
    && !codemodSource.includes("@aura3d/engine/ecs")
    && !codemodSource.includes("@aura3d/engine/scripting")
    && codemodSource.includes("@aura3d/lean/product")
    && codemodSource.includes("@aura3d/lean/game")
    && codemodSource.includes("@aura3d/ecs")
    && codemodSource.includes("@aura3d/scripting");
  const compile = install.ok && codemod.ok ? run("npm", ["exec", "tsc", "--", "--noEmit"], workspace) : codemod;
  const runtime = compile.ok ? run("node", ["runtime.mjs"], workspace) : compile;
  const checks = [
    { id: "all-29-exact-2.0-tarballs-present", pass: missingTarballs.length === 0 },
    { id: "clean-npm-install", pass: install.ok },
    { id: "codemod-executes-on-external-consumer", pass: codemod.ok && codemodExact },
    { id: "every-typescript-migration-example-compiles", pass: compile.ok && extractedExamples.length === 3 },
    { id: "retained-compatibility-adapters-resolve-and-load", pass: runtime.ok },
    { id: "removed-fabricated-postprocess-emits-actionable-warning", pass: runtime.ok && runtime.output.includes("postprocessing-unsupported") }
  ];
  const report = {
    schema: "aura3d.packed-migration-consumer/1.0",
    generatedAt: new Date().toISOString(),
    pass: checks.every((check) => check.pass),
    version: "2.0.0",
    packageCount: packages.length,
    exactTarballs: packages.map((pkg) => ({ name: pkg.name, version: pkg.version, tarball: basename(tarballFor(pkg.name, pkg.version)) })),
    extractedExamples,
    checks,
    commands: { install, codemod, compile, runtime }
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`packed migration consumer: ${report.pass ? "PASS" : "FAIL"}; ${checks.filter((check) => check.pass).length}/${checks.length} checks; ${extractedExamples.length} documentation examples`);
  if (!report.pass) {
    for (const check of checks.filter((entry) => !entry.pass)) console.error(`FAIL ${check.id}`);
    for (const receipt of [install, codemod, compile, runtime].filter((entry) => !entry.ok)) console.error(receipt.output);
    process.exitCode = 1;
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
