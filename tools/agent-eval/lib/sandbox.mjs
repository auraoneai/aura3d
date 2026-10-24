import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

export const ARMS = ["aura", "three"];
export const AGENT_EVAL_DIR = resolve(import.meta.dirname, "..");

/** Entry docs the docs-only Aura3D arm receives, copied verbatim from the repo. Nothing else from the repo goes in. */
export const DOC_SOURCES = [
  { from: "llms.txt", to: "llms.txt" },
  { from: "AGENTS.md", to: "AGENTS.md" },
  { from: "docs/agents", to: "docs/agents" },
  { from: "packages/aura3d-cli/skills", to: ".agents/skills" }
];

/** Repo roots whose files must never appear in any sandbox (markdown/text docs and skills trees are documentation, carved out of the content comparison). */
export const FORBIDDEN_ROOTS = ["packages", "examples", "apps", "tests", "tools", "evidence", "src", "fixtures", "benchmark"];
const SKILLS_DOCS = /(^|\/)skills\//;

const ALLOWED_TOP_LEVEL = {
  common: ["index.html", "tsconfig.json", "package.json", "TASK.md", "src", "public", "node_modules"],
  aura: ["llms.txt", "AGENTS.md", "docs", ".agents"],
  three: []
};

export const TASK_ASSETS = {
  3: [{ from: "fixtures/threejs-parity/assets/character/soldier.glb", to: "public/assets/soldier.glb" }],
  7: [{ from: "fixtures/threejs-parity/assets/character/robot-expressive.glb", to: "public/assets/prop.glb" }]
};

export const LIBRARY_LABEL = {
  aura: "Aura3D (`@aura3d/engine`, already installed in node_modules)",
  three: "three.js 0.185.1 (`three` and `@types/three`, already installed in node_modules)"
};

export function readTask(taskNumber, arm, tasksDir = join(AGENT_EVAL_DIR, "tasks")) {
  const file = readdirSync(tasksDir).find((name) => name.startsWith(`${String(taskNumber).padStart(2, "0")}-`) && name.endsWith(".md") && !name.startsWith("00-"));
  if (!file) throw new Error(`no task ${taskNumber}`);
  const contract = readFileSync(join(tasksDir, "00-contract.md"), "utf8");
  return { file, text: `${readFileSync(join(tasksDir, file), "utf8")}\n${contract}`.replaceAll("{{LIBRARY}}", LIBRARY_LABEL[arm]) };
}

export function docsCommit(repoRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Export just the doc set at a git ref into a temp dir, so before/after docs runs can be pinned to commits. */
export function exportDocs(repoRoot, ref, into) {
  mkdirSync(into, { recursive: true });
  const paths = DOC_SOURCES.map((d) => d.from);
  const tar = execFileSync("git", ["archive", ref, "--", ...paths], { cwd: repoRoot, maxBuffer: 1 << 28 });
  execFileSync("tar", ["-x", "-C", into], { input: tar });
  return into;
}

export function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walk(root, base = root, out = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.name === "node_modules") continue;
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

export function listSandboxFiles(dir) {
  return walk(dir);
}

/** Hash of the doc set copied into an Aura3D sandbox, recorded per run so docs versions are comparable. */
export function docSetFingerprint(dir) {
  const files = ["llms.txt", "AGENTS.md", ...listSandboxFiles(dir).filter((f) => f.startsWith("docs/") || f.startsWith(".agents/"))].filter((f) =>
    existsSync(join(dir, f))
  );
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(file).update(readFileSync(join(dir, file)));
  return { files: files.length, sha256: hash.digest("hex") };
}

/**
 * Build an isolated sandbox. `baseDir` holds the installed node_modules for the arm (npm install of the
 * published packages); it is symlinked read-only-by-convention, never copied.
 */
export function buildSandbox({ arm, task, dir, repoRoot, baseDir, tasksDir, docsRoot = repoRoot }) {
  if (!ARMS.includes(arm)) throw new Error(`unknown arm ${arm}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "public"), { recursive: true });
  cpSync(join(AGENT_EVAL_DIR, "scaffold", "index.html"), join(dir, "index.html"));
  cpSync(join(AGENT_EVAL_DIR, "scaffold", "tsconfig.json"), join(dir, "tsconfig.json"));
  cpSync(join(baseDir, "package.json"), join(dir, "package.json"));
  writeFileSync(join(dir, "TASK.md"), readTask(task, arm, tasksDir).text);
  symlinkSync(join(baseDir, "node_modules"), join(dir, "node_modules"), "dir");
  for (const asset of TASK_ASSETS[task] ?? []) {
    if (asset.arms && !asset.arms.includes(arm)) continue;
    mkdirSync(join(dir, asset.to, ".."), { recursive: true });
    cpSync(join(repoRoot, asset.from), join(dir, asset.to));
  }
  if (arm === "aura") {
    for (const doc of DOC_SOURCES) {
      const source = join(docsRoot, doc.from);
      if (!existsSync(source)) continue;
      mkdirSync(join(dir, doc.to, ".."), { recursive: true });
      cpSync(source, join(dir, doc.to), { recursive: true });
    }
  }
  return { dir, docs: arm === "aura" ? docSetFingerprint(dir) : null };
}

function repoSourceIndex(repoRoot) {
  const raw = execFileSync("git", ["ls-files", "-z", "--", ...FORBIDDEN_ROOTS], { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 28 });
  const index = new Map();
  for (const path of raw.split("\0")) {
    if (!path || SKILLS_DOCS.test(path) || /\.(md|txt)$/i.test(path) || path.startsWith("tools/agent-eval/scaffold/") || path.startsWith("evidence/agent-eval/")) continue;
    const name = basename(path);
    if (!index.has(name)) index.set(name, []);
    index.get(name).push(path);
  }
  return index;
}

/**
 * Returns violations: files outside the arm's allow-list, files under repo source roots, files byte-identical
 * to a tracked repo source file, a node_modules that is not a symlink into baseDir, or repo absolute paths in
 * scaffold-owned files. An empty list proves the sandbox carries no repo source.
 */
export function findRepoSourceLeaks({ dir, arm, repoRoot, baseDir }) {
  const violations = [];
  const allowed = new Set([...ALLOWED_TOP_LEVEL.common, ...ALLOWED_TOP_LEVEL[arm]]);
  const nm = join(dir, "node_modules");
  if (!existsSync(nm) || !lstatSync(nm).isSymbolicLink()) violations.push("node_modules is not a symlink");
  else if (realpathSync(nm) !== realpathSync(join(baseDir, "node_modules"))) violations.push("node_modules does not point at the arm base");
  for (const top of readdirSync(dir)) if (!allowed.has(top)) violations.push(`unexpected top-level entry: ${top}`);
  const index = repoSourceIndex(repoRoot);
  for (const file of walk(dir)) {
    const root = file.split("/")[0];
    if (FORBIDDEN_ROOTS.includes(root) && root !== "src") violations.push(`repo source root inside sandbox: ${file}`);
    const candidates = index.get(basename(file));
    if (candidates && !file.startsWith("src/")) {
      const mine = hashFile(join(dir, file));
      for (const candidate of candidates) {
        const theirs = join(repoRoot, candidate);
        if (existsSync(theirs) && hashFile(theirs) === mine && !file.startsWith("public/assets/")) violations.push(`${file} is identical to repo source ${candidate}`);
      }
    }
    if (["index.html", "tsconfig.json", "package.json", "TASK.md"].includes(file) && readFileSync(join(dir, file), "utf8").includes(repoRoot)) {
      violations.push(`${file} mentions the repo path`);
    }
  }
  return violations;
}

export function assertNoRepoSourceLeak(args) {
  const violations = findRepoSourceLeaks(args);
  if (violations.length) throw new Error(`sandbox leak:\n${violations.slice(0, 20).join("\n")}`);
}

/** Author-owned files only (what a run produced), as {path: text}. */
export function collectAuthored(dir) {
  const out = {};
  for (const file of walk(dir)) {
    if (file.startsWith("src/") || file === "index.html" || file === "vite.config.ts" || file === "tsconfig.json") {
      out[file] = readFileSync(join(dir, file), "utf8");
    }
  }
  return out;
}

export function writeSnapshot(dir, snapshotDir) {
  rmSync(snapshotDir, { recursive: true, force: true });
  mkdirSync(snapshotDir, { recursive: true });
  const authored = collectAuthored(dir);
  for (const [file, text] of Object.entries(authored)) {
    mkdirSync(join(snapshotDir, file, ".."), { recursive: true });
    writeFileSync(join(snapshotDir, file), text);
  }
  return Object.keys(authored);
}

export function resolveInside(root, relativePath) {
  const full = resolve(root, relativePath);
  if (full !== root && !full.startsWith(root + sep)) throw new Error("path escapes the sandbox");
  return full;
}
