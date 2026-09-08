import { loadValidatedReleasePlan } from "../release/exact-release-plan.mjs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, readdirSync, statSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";
import { parseSinglePackResult, type PackFile, type PackResult } from "./pack-result";

interface PackageTarget {
  readonly id: string;
  readonly dir: string;
  readonly expectedName: string;
  readonly requiredFiles: readonly string[];
  readonly requiredBins?: readonly string[];
}

const targets: readonly PackageTarget[] = [
  {
    id: "engine-root",
    dir: ".",
    expectedName: "@aura3d/engine",
    requiredFiles: ["README.md", "package.json", "dist/engine/index.js", "dist/engine/agent-api/index.js", "templates/product-viewer/package.json", "templates/cinematic-scene/package.json", "templates/mini-game/package.json"]
  },
  {
    id: "lean",
    dir: "packages/lean",
    expectedName: "@aura3d/lean",
    requiredFiles: ["README.md", "package.json", "dist/index.js", "dist/index.d.ts", "dist/product.js", "dist/product.d.ts", "dist/game.js", "dist/game.d.ts"]
  },
  {
    id: "react",
    dir: "packages/react",
    expectedName: "@aura3d/react",
    requiredFiles: ["package.json", "dist/index.js", "dist/index.d.ts"]
  },
  {
    id: "cli",
    dir: "packages/aura3d-cli",
    expectedName: "@aura3d/cli",
    requiredFiles: ["package.json", "dist/cli.js", "dist/index.js", "dist/index.d.ts"],
    requiredBins: ["aura3d"]
  },
  {
    id: "create-aura3d",
    dir: "packages/create-aura3d",
    expectedName: "create-aura3d",
    requiredFiles: ["package.json", "dist/cli.js", "dist/index.js", "dist/index.d.ts", "templates/product-viewer/package.json", "templates/cinematic-scene/package.json", "templates/mini-game/package.json"],
    requiredBins: ["create-aura3d"]
  }
];

const disallowedPathPatterns = [/^archive\//, /V[234]PRD\.md$/, /TestV4PlanPRD\.md$/, /\.(png|jpe?g|csv)$/i];
const disallowedTextPatterns = [/AuraSceneIR/, /MockProvider/, /prompt-to-scene/, /@aura3d\/ai-scene/, /\bV[234]\b/, /Path A/, /Path B/];
const exactPlan = loadValidatedReleasePlan();
const extracted = new Map<string,string>();
const temporary: string[] = [];
const results: Record<string, unknown>[] = [];
const checks: ReleaseCheck[] = [];

try {
for (const target of targets) {
  const pack = runPack(target.dir);
  const inspectedDir = extracted.get(target.dir) ?? target.dir;
  const packageJson = JSON.parse(readFileSync(resolve(inspectedDir, "package.json"), "utf8")) as {
    name?: string;
    bin?: Record<string, string>;
    dependencies?: Record<string, string>;
    exports?: Record<string, unknown>;
    files?: readonly string[];
  };
  const paths = pack.files.map((file) => file.path);
  const missing = target.requiredFiles.filter((file) => !paths.includes(file));
  const disallowedPaths = paths.filter((path) => disallowedPathPatterns.some((pattern) => pattern.test(path)));
  const textHits = findTextHits(inspectedDir, pack.files);
  const rootNoThreeHits = target.id === "engine-root" ? findRootNoThreeHits(inspectedDir, pack.files) : [];
  const missingBins = (target.requiredBins ?? []).filter((bin) => !packageJson.bin?.[bin]);

  checks.push(
    {
      id: `${target.id}-package-name`,
      pass: packageJson.name === target.expectedName,
      detail: `${target.dir} name=${packageJson.name ?? "missing"}, expected=${target.expectedName}`
    },
    {
      id: `${target.id}-required-files`,
      pass: missing.length === 0,
      detail: missing.length === 0 ? "all required files included" : `missing from pack: ${missing.join(", ")}`
    },
    {
      id: `${target.id}-required-bins`,
      pass: missingBins.length === 0,
      detail: missingBins.length === 0 ? `bins ok: ${Object.keys(packageJson.bin ?? {}).join(", ") || "none required"}` : `missing bins: ${missingBins.join(", ")}`
    },
    {
      id: `${target.id}-no-disallowed-paths`,
      pass: disallowedPaths.length === 0,
      detail: disallowedPaths.length === 0 ? "no archive, PRD history, image, or CSV paths in tarball" : disallowedPaths.slice(0, 20).join(", ")
    },
    {
      id: `${target.id}-no-archived-runtime-text`,
      pass: textHits.length === 0,
      detail: textHits.length === 0 ? "no archived runtime or release-cycle text in tarball text files" : textHits.slice(0, 20).join("; ")
    },
    {
      id: `${target.id}-root-no-three-runtime`,
      pass: target.id !== "engine-root" || (
        packageJson.dependencies?.three === undefined &&
        packageJson.exports?.["./three-compat"] === undefined &&
        !packageJson.files?.includes("dist/three-compat") &&
        !paths.some((path) => path.startsWith("dist/three-compat/")) &&
        rootNoThreeHits.length === 0
      ),
      detail: target.id !== "engine-root"
        ? "not the root engine package"
        : [
            packageJson.dependencies?.three ? `dependencies.three=${packageJson.dependencies.three}` : undefined,
            packageJson.exports?.["./three-compat"] ? "exports ./three-compat" : undefined,
            packageJson.files?.includes("dist/three-compat") ? "files includes dist/three-compat" : undefined,
            paths.some((path) => path.startsWith("dist/three-compat/")) ? "tarball includes dist/three-compat" : undefined,
            ...rootNoThreeHits.slice(0, 12)
          ].filter(Boolean).join("; ") || "root package tarball has no Three.js runtime dependency, export, files entry, or runtime imports"
    }
  );

  results.push({
    id: target.id,
    dir: target.dir,
    name: packageJson.name,
    filename: pack.filename,
    packageSize: pack.size,
    unpackedSize: pack.unpackedSize,
    entryCount: pack.files.length,
    missingRequiredFiles: missing,
    disallowedPaths,
    textHits,
    bins: packageJson.bin ?? {}
  });
}

writeReport("tests/reports/package-tarball-audit.json", "aura3d-package-tarball-audit", checks, { packages: results, releasePlan: exactPlan?.reference });
} finally { for(const dir of temporary)rmSync(dir,{recursive:true,force:true}); }

function runPack(dir: string): PackResult {
  if(exactPlan) {
    const {name}=JSON.parse(readFileSync(resolve(dir,"package.json"),"utf8")) as {name:string};
    const candidate=exactPlan.packages.find(p=>p.name===name);
    if(!candidate)throw new Error(`Missing exact package ${name}`);
    const archive=resolve(candidate.tarball);
    const entries=execFileSync("tar",["-tzf",archive],{encoding:"utf8",maxBuffer:64*1024*1024}).split("\n").filter(Boolean);
    if(entries.some(p=>!p.startsWith("package/")||p.split("/").includes("..")))throw new Error("Unsafe archive path");
    const listing=execFileSync("tar",["-tvzf",archive],{encoding:"utf8",maxBuffer:64*1024*1024});
    if(listing.split("\n").some(line=>line && !['-','d'].includes(line[0]!)))throw new Error("Archive contains non-file/directory entries");
    const temp=mkdtempSync(resolve(tmpdir(),"aura-exact-audit-"));temporary.push(temp);
    execFileSync("tar",["-xzf",archive,"-C",temp]);
    const base=resolve(temp,"package");extracted.set(dir,base);
    const walk=(path:string,prefix=""):PackFile[]=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(path,e.name),`${prefix}${e.name}/`):[{path:`${prefix}${e.name}`,size:statSync(resolve(path,e.name)).size}]);
    const files=walk(base);
    return {id:`${name}@${candidate.version}`,name,version:candidate.version,size:statSync(archive).size,unpackedSize:files.reduce((n,f)=>n+f.size,0),filename:candidate.tarball,files};
  }
  const packageJson = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as { name: string };
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "."], { cwd: resolve(dir), encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
  return parseSinglePackResult(output, packageJson.name);
}

function findTextHits(dir: string, files: readonly PackFile[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    if (!/\.(md|json|js|ts|tsx|d\.ts|html|css|map)$/i.test(file.path)) continue;
    const fullPath = resolve(dir, file.path);
    if (!existsSync(fullPath)) continue;
    const text = readFileSync(fullPath, "utf8");
    for (const pattern of disallowedTextPatterns) {
      if (pattern.test(text)) hits.push(`${dir}:${file.path}:${pattern.source}`);
    }
  }
  return hits;
}

function findRootNoThreeHits(dir: string, files: readonly PackFile[]): string[] {
  const hits: string[] = [];
  const patterns = [
    /\b(?:import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|import\s*\(|require\s*\()\s*["'](?:three|three\/[^"']*|@aura3d\/three-compat(?:\/[^"']*)?)["']/,
    /\bbackend:\s*["'](?:three|three-webgl|three-lean-[^"']*)["']|\bthree-lean-[\w-]+/,
    /typeof\s+import\s*\(\s*["']three(?:\/[^"']*)?["']\s*\)/
  ];
  for (const file of files) {
    if (!/^dist\/(?:animation|assets|audio|controls|core|ecs|editor|editor-runtime|engine|environments|input|materials|math|physics|product-studio|react|rendering|scene|scripting|workflows)\//.test(file.path)) continue;
    if (!/\.(js|mjs|cjs|d\.ts)$/i.test(file.path)) continue;
    const fullPath = resolve(dir, file.path);
    if (!existsSync(fullPath)) continue;
    const text = readFileSync(fullPath, "utf8");
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      for (const pattern of patterns) {
        if (pattern.test(line)) hits.push(`${dir}:${file.path}:${index + 1}:${line.trim()}`);
      }
    }
  }
  return hits;
}
