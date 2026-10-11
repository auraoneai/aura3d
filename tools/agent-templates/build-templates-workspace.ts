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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templateRoot = path.join(repoRoot, "packages", "create-aura3d", "templates");
// The §7.1.1 look HDRIs (lookPresets.ts `hdri`). Poly Haven CC0 originals
// (aura.library.json studio-soft / outdoor-midday / outdoor-golden cite the
// same sources); copied here for capture/validation builds.
const hdriSource = path.join(repoRoot, "fixtures", "environment-corpus", "hdri");
const libraryHdriSource = path.join(repoRoot, "assets", "library", "hdri");
const LIBRARY_HDRIS = ["night-2k.hdr"] as const;

const argv = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
// realpath: vite rejects an html entry whose path resolves through a symlink
// (macOS /tmp -> /private/tmp) as a "relative" emitted file name.
mkdirSync(path.resolve(repoRoot, opt("--out", "tools/agent-templates/out/workspace-build")), { recursive: true });
const outDir = realpathSync(path.resolve(repoRoot, opt("--out", "tools/agent-templates/out/workspace-build")));
const requested = opt("--templates", process.env.QRC_TEMPLATES ?? "").split(",").map((s) => s.trim()).filter(Boolean);

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
// generated prefix map for everything else.
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tsPaths = (JSON.parse(readFileSync(path.join(repoRoot, "tsconfig.base.json"), "utf8")) as {
  compilerOptions?: { paths?: Record<string, readonly string[]> };
}).compilerOptions?.paths ?? {};
const exactAliases = Object.entries(tsPaths)
  .filter(([key, targets]) => key.startsWith("@aura3d/") && !key.includes("*") && targets.length > 0)
  .map(([key, targets]) => ({ find: new RegExp(`^${escapeRegExp(key)}$`), replacement: path.join(repoRoot, targets[0]) }));
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
  // A template that authors a look gets the §7.1.1 HDRIs its presets
  // reference (/hdri/<file>.hdr); without them every look IBL 404s.
  const hdri: string[] = [];
  if (templateAuthorsLook(dir) && existsSync(hdriSource)) {
    const target = path.join(dir, "public", "hdri");
    mkdirSync(target, { recursive: true });
    for (const file of readdirSync(hdriSource).filter((name) => name.endsWith(".hdr"))) {
      cpSync(path.join(hdriSource, file), path.join(target, file));
      hdri.push(file);
    }
    // A3D_QR_LOOKS night looks (looks.ts LOOK_QR_UPGRADES): the CC0
    // aura.library.json `night-2k` HDRI.
    for (const file of LIBRARY_HDRIS) {
      cpSync(path.join(libraryHdriSource, file), path.join(target, file));
      hdri.push(file);
    }
  }
  return { dir, hdri };
}

function templateAuthorsLook(dir: string): boolean {
  const src = path.join(dir, "src");
  if (!existsSync(src)) return false;
  const stack = [src];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && /\blooks\.(preset|nodes)\(/.test(readFileSync(file, "utf8"))) return true;
    }
  }
  return false;
}

const rows: BuildRow[] = [];
for (const id of selected) {
  const { dir, hdri } = scaffold(id);
  const distDir = path.join(dir, "dist");
  try {
    await build({
      root: dir,
      configFile: existsSync(path.join(dir, "vite.config.ts")) ? path.join(dir, "vite.config.ts") : false,
      logLevel: "warn",
      resolve: { alias },
      build: { outDir: distDir, emptyOutDir: true, sourcemap: false }
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
