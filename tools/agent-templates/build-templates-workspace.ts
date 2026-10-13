// tools/agent-templates/build-templates-workspace.ts — build create-aura3d
// templates against the workspace sources instead of packed release tarballs.
//
// Why: `capture-templates.mjs` installs every @aura3d dependency from
// `publish-all.mjs --pack-only` tarballs. While the @aura3d/controls <->
// @aura3d/input package cycle (#442) blocks packing, no template can be
// captured at all. This builder scaffolds each template exactly as
// `createA3DProject` does (template tree + the look HDRIs under public/hdri),
// then runs a production `vite build` with the repo's canonical
// `vite.aliases.generated.ts` map (every @aura3d specifier -> src/). The dist
// dirs feed `capture-templates.mjs --source`, which serves and captures them.
//
// Same engine code, different packaging: frames from this path are labelled
// `packaging: "workspace-src"` in the build report and are never mixed with
// tarball-built captures.
//
// Usage:
//   pnpm exec tsx --tsconfig tsconfig.base.json tools/agent-templates/build-templates-workspace.ts \
//     [--templates a,b] [--out tools/agent-templates/out/workspace-build]
// Prints the comma-separated dist list on the last stdout line.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { aliasEntries } from "../../vite.aliases.generated";
import { auraDecodersPlugin } from "../../packages/assets/src/vite/auraDecoders";
import { copyTemplateHdris, TEMPLATE_HDRI_DIR, templateAuthorsLook } from "../../packages/create-aura3d/src/template-hdri";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templateRoot = path.join(repoRoot, "packages", "create-aura3d", "templates");
// The look HDRIs (looks.ts HDRI_ASSET, incl. the A3D_QR_LOOKS night-2k):
// Poly Haven CC0 originals shipped by create-aura3d (hdri/ATTRIBUTION.md).
const hdriSource = path.join(repoRoot, "packages", "create-aura3d", TEMPLATE_HDRI_DIR);

const LEGACY_TEMPLATE_ALIASES: Readonly<Record<string, string>> = {
  "three-compat-architecture-interior": "architecture-interior",
  "three-compat-asset-inspector": "asset-inspector",
  "three-compat-character-viewer": "character-viewer",
  "three-compat-custom-threejs-migration": "custom-scene",
  "three-compat-large-scene": "large-scene",
  "three-compat-material-authoring": "material-authoring",
  "three-compat-postprocess-scene": "postprocess-scene",
  "three-compat-premium-product-viewer": "premium-product-viewer"
};
const normalizeTemplateId = (id: string): string => LEGACY_TEMPLATE_ALIASES[id] ?? id;

const argv = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
// realpath: vite rejects an html entry whose path resolves through a symlink
// (macOS /tmp -> /private/tmp) as a "relative" emitted file name.
mkdirSync(path.resolve(repoRoot, opt("--out", "tools/agent-templates/out/workspace-build")), { recursive: true });
const outDir = realpathSync(path.resolve(repoRoot, opt("--out", "tools/agent-templates/out/workspace-build")));
const requested = opt("--templates", process.env.QRC_TEMPLATES ?? "")
  .split(",")
  .map((s) => normalizeTemplateId(s.trim()))
  .filter(Boolean);

const allTemplates = readdirSync(templateRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(templateRoot, entry.name, "index.html")))
  .map((entry) => entry.name)
  .sort();
for (const id of requested) {
  if (!allTemplates.includes(id)) throw new Error(`unknown template "${id}". Known: ${allTemplates.join(", ")}`);
}
const selected = requested.length ? allTemplates.filter((id) => requested.includes(id)) : allTemplates;

// Exact-specifier entries from tsconfig.base.json `paths` come first (it maps
// subpaths the generated vite map lacks, e.g. `@aura3d/engine/game`), then the
// generated prefix map for everything else. Browser-entry packages (`@aura3d/assets`,
// `@aura3d/animation`) must resolve to `browser-index.ts` rather than their Node
// `index.ts` entry.
const BROWSER_SAFE_TARGETS: Readonly<Record<string, string>> = {
  "@aura3d/animation": "packages/animation/src/browser-index.ts",
  "@aura3d/assets": "packages/assets/src/browser-index.ts",
  "@aura3d/engine": "packages/engine/src/public/index.ts"
};
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tsPaths = (JSON.parse(readFileSync(path.join(repoRoot, "tsconfig.base.json"), "utf8")) as {
  compilerOptions?: { paths?: Record<string, readonly string[]> };
}).compilerOptions?.paths ?? {};
const exactAliases = Object.entries(tsPaths)
  .filter(([key, targets]) => key.startsWith("@aura3d/") && !key.includes("*") && targets.length > 0)
  .map(([key, targets]) => ({
    find: new RegExp(`^${escapeRegExp(key)}$`),
    replacement: path.join(repoRoot, BROWSER_SAFE_TARGETS[key] ?? targets[0])
  }));
const alias = [
  ...exactAliases,
  ...aliasEntries.map(([find, replacement]) => ({ find, replacement: path.join(repoRoot, replacement) }))
];

interface BuildRow {
  readonly id: string;
  readonly ok: boolean;
  readonly distDir: string | null;
  readonly hdri: readonly string[];
  readonly error?: string;
}

function scaffold(id: string): { dir: string; hdri: string[] } {
  const source = path.join(templateRoot, id);
  const dir = path.join(outDir, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(source, dir, {
    recursive: true,
    filter: (src) => !path.relative(source, src).split(/[\\/]/).some((part) => ["node_modules", "dist", "test-results"].includes(part))
  });
  // A template that authors a look gets the HDRIs its presets reference
  // (/hdri/<file>.hdr); without them every look IBL 404s. Same helper and
  // same single source (packages/create-aura3d/hdri) as createA3DProject.
  const hdri = templateAuthorsLook(dir) ? copyTemplateHdris(hdriSource, dir) : [];
  return { dir, hdri };
}

const rows: BuildRow[] = [];
for (const id of selected) {
  const { dir, hdri } = scaffold(id);
  const distDir = path.join(dir, "dist");
  try {
    await build({
      root: dir,
      configFile: false,
      plugins: [auraDecodersPlugin()],
      logLevel: "warn",
      resolve: { alias },
      build: {
        target: "esnext",
        outDir: distDir,
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
          output: {
            manualChunks(chunkId: string) {
              if (chunkId.includes("/packages/")) return "aura3d-vendor";
            }
          }
        }
      }
    });
    rows.push({ id, ok: existsSync(path.join(distDir, "index.html")), distDir, hdri });
  } catch (error) {
    rows.push({ id, ok: false, distDir: null, hdri, error: error instanceof Error ? error.message.slice(0, 2000) : String(error) });
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "build-report.json"),
  `${JSON.stringify({ schema: "aura3d.template-workspace-build/1", packaging: "workspace-src", templates: rows }, null, 2)}\n`
);
for (const row of rows) console.log(`[build-templates-workspace] ${row.ok ? "ok  " : "FAIL"} ${row.id}${row.error ? ` — ${row.error.split("\n")[0]}` : ""}`);
const failed = rows.filter((row) => !row.ok);
console.log(rows.filter((row) => row.ok).map((row) => row.distDir).join(","));
if (failed.length) process.exitCode = 1;
