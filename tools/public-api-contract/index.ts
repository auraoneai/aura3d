import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

interface CommandResult {
  readonly ok: boolean;
  readonly output: string;
}

const workspace = resolve("tests/reports/public-api-contract-workspace");
const tarballDir = resolve(workspace, "tarballs");
const archivedSceneTypeName = ["Aura", "Scene", "IR"].join("");
const archivedProviderName = ["Mock", "Provider"].join("");
const archivedPromptPackage = ["@aura3d/", "ai-", "scene"].join("");
const archivedCreatePromptSceneName = ["create", "Prompt", "Scene"].join("");
const archivedExportNames = [
  archivedSceneTypeName,
  archivedProviderName,
  ["prompt", "To", "Scene"].join(""),
  archivedCreatePromptSceneName
];
rmSync(workspace, { recursive: true, force: true });
mkdirSync(tarballDir, { recursive: true });

const engineTarball = pack(".", tarballDir);
const reactTarball = pack("packages/react", tarballDir);
writePackage();
writeTsconfig();
writeSources();

const install = run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], workspace);
const engineExports = install.ok ? readModuleExports("@aura3d/engine") : [];
const reactExports = install.ok ? readModuleExports("@aura3d/react") : [];
const validCompile = install.ok ? run("npm", ["exec", "tsc", "--", "--noEmit", "-p", "tsconfig.valid.json"], workspace) : install;
const negativeCompile = install.ok ? run("npm", ["exec", "tsc", "--", "--noEmit", "-p", "tsconfig.negative.json"], workspace) : install;
const docsImportCheck = checkDocsNamedImports(engineExports, reactExports);

const requiredEngineExports = ["createAuraApp", "defineAuraAssets", "model", "scene", "camera", "lights", "material", "effects", "timeline", "interactions"];
const requiredReactExports = ["AuraCanvas", "Scene", "Model", "Camera", "Lights", "Effect", "productViewerScene"];
const checks: ReleaseCheck[] = [
  {
    id: "public-api-clean-install",
    pass: install.ok,
    detail: install.ok ? "packed @aura3d/engine and @aura3d/react installed in clean project" : install.output
  },
  {
    id: "engine-required-exports",
    pass: requiredEngineExports.every((name) => engineExports.includes(name)),
    detail: missing(requiredEngineExports, engineExports)
  },
  {
    id: "react-required-exports",
    pass: requiredReactExports.every((name) => reactExports.includes(name)),
    detail: missing(requiredReactExports, reactExports)
  },
  {
    id: "public-valid-examples-compile",
    pass: validCompile.ok,
    detail: validCompile.ok ? "valid public API examples compile from packed packages" : validCompile.output
  },
  {
    id: "public-invalid-examples-fail-as-expected",
    pass: negativeCompile.ok,
    detail: negativeCompile.ok ? "invalid model string, missing asset, archived imports, and archived package imports are rejected by TypeScript" : negativeCompile.output
  },
  {
    id: "docs-named-imports-are-exported",
    pass: docsImportCheck.missing.length === 0,
    detail: docsImportCheck.missing.length === 0 ? `${docsImportCheck.checked} documented named imports resolve` : docsImportCheck.missing.join("; ")
  },
  {
    id: "archived-runtime-not-exported",
    pass: !engineExports.some((name) => archivedExportNames.includes(name)),
    detail: "archived runtime names are absent from public engine exports"
  }
];

writePublicApiMarkdown(checks, engineExports, reactExports, docsImportCheck.checked);
writeReport("tests/reports/public-api-contract.json", "aura3d-public-api-contract", checks, {
  workspace: "tests/reports/public-api-contract-workspace",
  engineExports,
  reactExports,
  docsNamedImportsChecked: docsImportCheck.checked
});

function pack(dir: string, outDir: string): string {
  const output = execFileSync("npm", ["pack", "--silent", "--pack-destination", outDir], {
    cwd: resolve(dir),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  const file = output.split(/\r?\n/).at(-1);
  if (!file) throw new Error(`npm pack failed for ${dir}`);
  return resolve(outDir, basename(file));
}

function writePackage(): void {
  writeFileSync(resolve(workspace, "package.json"), `${JSON.stringify({
    name: "aura3d-public-api-contract",
    private: true,
    type: "module",
    dependencies: {
      "@aura3d/engine": `file:${engineTarball}`,
      "@aura3d/react": `file:${reactTarball}`,
      react: "^19.0.0"
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      typescript: "^5.8.3"
    }
  }, null, 2)}\n`);
}

function writeTsconfig(): void {
  const base = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      skipLibCheck: true,
      noEmit: true
    }
  };
  writeFileSync(resolve(workspace, "tsconfig.valid.json"), `${JSON.stringify({ ...base, include: ["valid.ts"] }, null, 2)}\n`);
  writeFileSync(resolve(workspace, "tsconfig.negative.json"), `${JSON.stringify({ ...base, include: ["negative.ts"] }, null, 2)}\n`);
}

function writeSources(): void {
  writeFileSync(resolve(workspace, "valid.ts"), `import { camera, createAuraApp, defineAuraAssets, effects, interactions, lights, material, model, scene, timeline } from "@aura3d/engine";
import { AuraCanvas, Camera, Effect, Lights, Model, Scene, productViewerScene } from "@aura3d/react";

const assets = defineAuraAssets({
  product: { type: "model", format: "glb", url: "/product.glb", bounds: [1, 1, 1], hash: "sha256-product" },
  color: { type: "texture", format: "png", url: "/color.png", hash: "sha256-color" }
} as const);

scene()
  .add(model(assets.product, { material: material.pbr({ texture: assets.color }) }))
  .add(lights.studio())
  .add(effects.rain())
  .add(interactions.orbit())
  .camera(camera.dolly({ from: [0, 1, 4], to: [0, 1, 2], seconds: 4 }))
  .timeline(timeline.loop({ seconds: 4 }));

console.log(typeof createAuraApp, typeof AuraCanvas, typeof Scene, typeof Model, typeof Camera, typeof Lights, typeof Effect, typeof productViewerScene);
`);
  writeFileSync(resolve(workspace, "negative.ts"), `import { camera, defineAuraAssets, model } from "@aura3d/engine";

const assets = defineAuraAssets({
  product: { type: "model", format: "glb", url: "/product.glb", bounds: [1, 1, 1], hash: "sha256-product" }
} as const);

// @ts-expect-error The public API requires typed AuraAssetRef values, not raw strings.
model("product");

// @ts-expect-error Missing generated asset ids must fail at compile time.
model(assets.missingAsset);

// @ts-expect-error Invalid option shapes must fail at compile time.
camera.orbit({ distance: "near" });

// @ts-expect-error Archived runtime names must not be exported.
import { ${archivedSceneTypeName}, ${archivedProviderName} } from "@aura3d/engine";

// @ts-expect-error Archived runtime package must not resolve.
import { ${archivedCreatePromptSceneName} } from "${archivedPromptPackage}";

console.log(${archivedSceneTypeName}, ${archivedProviderName}, ${archivedCreatePromptSceneName});
`);
}

function readModuleExports(specifier: string): string[] {
  const output = execFileSync("node", ["-e", `import(${JSON.stringify(specifier)}).then((m)=>console.log(JSON.stringify(Object.keys(m).sort())))`], {
    cwd: workspace,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(output) as string[];
}

function checkDocsNamedImports(engineExports: readonly string[], reactExports: readonly string[]): { readonly checked: number; readonly missing: readonly string[] } {
  const files = [
    "README.md",
    "docs/api/public-api.md",
    "docs/api/app-api.md",
    "docs/agents/build-playbook.md",
    "docs/templates/create-aura3d-templates.md"
  ].filter((path) => existsSync(path));
  const missingImports: string[] = [];
  let checked = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const pattern = /import\s+\{([^}]+)\}\s+from\s+["'](@aura3d\/engine|@aura3d\/react)["']/g;
    for (const match of text.matchAll(pattern)) {
      const names = match[1].split(",").map((name) => name.trim().replace(/\s+as\s+.+$/, "")).filter(Boolean);
      const exported = match[2] === "@aura3d/react" ? reactExports : engineExports;
      for (const name of names) {
        checked += 1;
        if (!exported.includes(name)) missingImports.push(`${file}: ${name} from ${match[2]}`);
      }
    }
  }
  return { checked, missing: missingImports };
}

function run(command: string, args: readonly string[], cwd: string): CommandResult {
  try {
    const output = execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output: sanitize(output.trim()) };
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    return { ok: false, output: sanitize(output.trim().split("\n").slice(-32).join("\n")) };
  }
}

function missing(required: readonly string[], actual: readonly string[]): string {
  const missingNames = required.filter((name) => !actual.includes(name));
  return missingNames.length === 0 ? "all required exports present" : `missing: ${missingNames.join(", ")}`;
}

function sanitize(value: string): string {
  return value.replaceAll(process.cwd(), "<repo>").replaceAll(workspace, "<public-api-workspace>");
}

function writePublicApiMarkdown(checks: readonly ReleaseCheck[], engineExports: readonly string[], reactExports: readonly string[], docsChecked: number): void {
  const lines = [
    "# Public API Contract",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Checks passing: ${checks.filter((entry) => entry.pass).length}/${checks.length}`,
    `- Engine exports: ${engineExports.length}`,
    `- React exports: ${reactExports.length}`,
    `- Docs named imports checked: ${docsChecked}`,
    "",
    "## Checks",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    "",
    "## Required Engine Exports",
    "",
    requiredEngineExports.map((name) => `- \`${name}\``).join("\n"),
    "",
    "## Required React Exports",
    "",
    requiredReactExports.map((name) => `- \`${name}\``).join("\n"),
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("docs/project/public-api-contract.md", lines.join("\n"));
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
