import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CREATE_AURA3D_TEMPLATES } from "../../packages/create-aura3d/src/index";
import { writeReport, type ReleaseCheck } from "../check-common";

const templateRoot = resolve("packages/create-aura3d/templates");
const checks: ReleaseCheck[] = [];
const details: Record<string, unknown>[] = [];

for (const template of CREATE_AURA3D_TEMPLATES) {
  const root = resolve(templateRoot, template);
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const sourceFiles = collectExecutableSources(root);
  const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const auraDependencies = Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith("@aura3d/"));
  const auraImports = new Set(
    [...source.matchAll(/(?:from\s+|import\s*\()\s*["'](@aura3d\/[^"']+)["']/g)]
      .map((match) => owningPackage(match[1]!))
  );
  const undeclared = [...auraImports].filter((name) => !auraDependencies.includes(name));
  const unused = auraDependencies.filter((name) => !auraImports.has(name));
  const forbidden = forbiddenSourceFindings(sourceFiles);

  checks.push(
    {
      id: `${template}-declared-aura-imports`,
      pass: undeclared.length === 0,
      detail: undeclared.length === 0 ? `${auraImports.size} Aura3D package imports declared` : `undeclared: ${undeclared.join(", ")}`
    },
    {
      id: `${template}-workload-only-aura-dependencies`,
      pass: unused.length === 0,
      detail: unused.length === 0 ? `${auraDependencies.length} direct Aura3D dependencies used` : `unused: ${unused.join(", ")}`
    },
    {
      id: `${template}-safe-public-source`,
      pass: forbidden.length === 0,
      detail: forbidden.length === 0 ? `${sourceFiles.length} executable source files avoid raw model URLs, guessed model ids, Three.js loaders, and hand-wired renderers` : forbidden.join("; ")
    },
    {
      id: `${template}-typed-asset-contract`,
      pass: existsSync(resolve(root, "aura.assets.json")) && existsSync(resolve(root, "src/aura-assets.ts")),
      detail: "aura.assets.json and generated src/aura-assets.ts present"
    }
  );
  details.push({ template, auraDependencies, auraImports: [...auraImports].sort(), sourceFiles: sourceFiles.length, forbidden });
}

const productSource = readFileSync(resolve(templateRoot, "product-viewer/src/main.ts"), "utf8");
const gameSource = readFileSync(resolve(templateRoot, "mini-game/src/main.ts"), "utf8");
const characterManifest = JSON.parse(readFileSync(resolve(templateRoot, "character-controller/package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const characterReadme = readFileSync(resolve(templateRoot, "character-controller/README.md"), "utf8");
checks.push(
  {
    id: "product-template-lean-product-entry",
    pass: productSource.includes('from "@aura3d/lean/product"'),
    detail: "product viewer imports @aura3d/lean/product"
  },
  {
    id: "arcade-template-lean-game-entry",
    pass: gameSource.includes('from "@aura3d/lean/game"'),
    detail: "mini-game imports @aura3d/lean/game"
  },
  {
    id: "physical-character-opt-in-installs-selected-packages",
    pass:
      characterManifest.scripts?.["enable:physics"] === "npm install @aura3d/physics@2.0.0 @aura3d/physics-rapier@2.0.0" &&
      characterReadme.includes("npm run enable:physics"),
    detail: "character-controller keeps kinematic default lean and exposes one explicit selected-Rapier opt-in install command"
  }
);

writeReport("tests/reports/template-source-audit.json", "aura3d-template-source-audit", checks, { templates: details });

function collectExecutableSources(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (["node_modules", "dist", "test-results", "public", "experimental"].includes(entry)) continue;
      const path = resolve(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry) && entry !== "aura-assets.ts") files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function owningPackage(specifier: string): string {
  const [scope, name] = specifier.split("/");
  return `${scope}/${name}`;
}

function forbiddenSourceFindings(files: readonly string[]): string[] {
  const patterns: readonly [string, RegExp][] = [
    ["raw GLB/glTF URL", /https?:\/\/[^\s"'`]+\.(?:glb|gltf)(?:[?#][^\s"'`]*)?/i],
    ["unsafe model URL", /\bunsafeModelUrl\s*\(/],
    ["guessed/string model id", /\bmodel\s*\(\s*["'`]/],
    ["Three.js package import", /(?:from\s+|import\s*\()\s*["']three(?:\/|["'])/],
    ["Three.js addon/loader", /\b(?:GLTFLoader|DRACOLoader|KTX2Loader|OrbitControls)\b/],
    ["hand-wired renderer", /\bnew\s+(?:THREE\.)?(?:WebGLRenderer|WebGPURenderer)\s*\(/]
  ];
  const findings: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const [label, pattern] of patterns) {
      if (pattern.test(source)) findings.push(`${file.replace(`${templateRoot}/`, "")}: ${label}`);
    }
  }
  return findings;
}
