// Skills gate (PRD section 8.3). Run: pnpm check:skills
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CREATE_AURA3D_TEMPLATES, writeAgentSkills, selectSkills, readSkillsManifest } from "../../packages/create-aura3d/src/index.ts";
import { CANONICAL_SKILLS_DIR, SKILL_MIRRORS, expectedMirror, listTree, skillNames } from "./shared.ts";

const repoRoot = process.cwd();
const skillsRoot = resolve(repoRoot, CANONICAL_SKILLS_DIR);
const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);
const MAX_BODY_LINES = 150;
const GITHUB_BLOB = "https://github.com/auraoneai/aura3d/blob/main/";
const SITE = "https://aura3d.auraone.ai/";

const cliHelp = readFileSync(resolve(repoRoot, "packages/aura3d-cli/src/cli-help.ts"), "utf8");
const sceneScript = readFileSync(resolve(repoRoot, "packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts"), "utf8");
const sceneVerbs = new Set([...sceneScript.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]!));
const sitemap = readFileSync(resolve(repoRoot, "sitemap.xml"), "utf8");
const helpCommands = new Set<string>();
for (const m of cliHelp.matchAll(/aura3d ([a-z-]+)(?: ([a-z-]+))?/g)) {
  helpCommands.add(m[1]!);
  if (m[2]) helpCommands.add(`${m[1]} ${m[2]}`);
}
const helpFlags = new Set([...cliHelp.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]));
// Flags consumed by delegated scripts (animation scene verbs) are validated against the scene script.
const sceneFlags = new Set([...sceneScript.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]));

const exportSet = buildExportSet();
const JS_BUILTINS = new Set(["import", "require", "console", "setTimeout", "fetch", "expect", "test", "describe", "it", "main", "if", "for", "while", "return", "function", "new", "await", "async", "typeof", "Math", "JSON", "Object", "Array", "String", "Number", "Promise", "Date", "map", "filter", "reduce", "push"]);

const names = skillNames(repoRoot);
const manifest = readSkillsManifest(skillsRoot);
for (const name of Object.keys(manifest.skills)) if (!names.includes(name)) fail(`manifest lists missing skill ${name}`);
for (const name of names) if (!(name in manifest.skills)) fail(`skill ${name} is not in manifest.json`);
for (const set of [manifest.coreSet, ...Object.values(manifest.templates)]) for (const name of set) if (!(name in manifest.skills)) fail(`manifest references unknown skill ${name}`);
const templateKeys = Object.keys(manifest.templates).sort();
if (JSON.stringify(templateKeys) !== JSON.stringify([...CREATE_AURA3D_TEMPLATES].sort())) fail("manifest.templates keys must equal CREATE_AURA3D_TEMPLATES");

for (const name of names) {
  const dir = join(skillsRoot, name);
  for (const file of listTree(dir).filter((f) => f.endsWith(".md"))) checkMarkdown(name, join(dir, file), file === "SKILL.md");
}

// Boundaries must carry every llms.txt release-integrity rule's key token.
const boundariesPath = join(skillsRoot, "aura3d-core/references/boundaries.md");
if (!existsSync(boundariesPath)) fail("aura3d-core/references/boundaries.md missing");
else {
  const boundaries = readFileSync(boundariesPath, "utf8");
  if (!boundaries.includes("## Forbidden patterns")) fail("boundaries.md missing '## Forbidden patterns' section");
  const llms = readFileSync(resolve(repoRoot, "llms.txt"), "utf8");
  const block = llms.split("Release integrity rules:")[1]?.split(/\n\n/)[0] ?? "";
  for (const token of [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.replace(/\(.*$/, ""))) {
    if (!boundaries.includes(token)) fail(`boundaries.md forbidden patterns missing llms.txt token ${token}`);
  }
  for (const word of ["WebGPU", "primitives", "CSS/DOM"]) if (block.includes(word) && !boundaries.includes(word)) fail(`boundaries.md missing llms.txt rule mentioning ${word}`);
}

// Mirrors must match canonical source byte-for-byte.
const expected = expectedMirror(repoRoot);
if (readIfExists(join(skillsRoot, "llms.txt")) !== expected.get("llms.txt")) fail(`${CANONICAL_SKILLS_DIR}/llms.txt is stale; run pnpm skills:sync`);
for (const mirror of SKILL_MIRRORS) {
  const root = resolve(repoRoot, mirror);
  const actual = listTree(root);
  for (const file of actual) if (!expected.has(file)) fail(`${mirror}/${file} is not in canonical source; run pnpm skills:sync`);
  for (const [file, contents] of expected) if (readIfExists(join(root, file)) !== contents) fail(`${mirror}/${file} is stale; run pnpm skills:sync`);
}

// Package files must ship the bundle.
for (const pkg of ["packages/aura3d-cli/package.json", "packages/create-aura3d/package.json"]) {
  const files = (JSON.parse(readFileSync(resolve(repoRoot, pkg), "utf8")) as { files?: string[] }).files ?? [];
  if (!files.includes("skills")) fail(`${pkg} files[] must include "skills"`);
}

// Init smoke: write into temp dirs and verify the tree + user-edit protection.
const smoke = mkdtempSync(join(tmpdir(), "aura3d-skills-"));
const smokeReady = Object.keys(manifest.skills).every((name) => names.includes(name));
if (!smokeReady) fail("init smoke skipped: manifest skills missing SKILL.md");
else try {
  const all = writeAgentSkills({ projectDir: smoke, agent: "all", skills: "all", skillsDir: skillsRoot });
  for (const client of Object.values(manifest.clients)) for (const name of names) {
    if (!existsSync(join(smoke, client, name, "SKILL.md"))) fail(`init smoke: ${client}/${name}/SKILL.md not written`);
  }
  if (!existsSync(join(smoke, "llms.txt"))) fail("init smoke: llms.txt not written");
  if (existsSync(join(smoke, ".agents/skills/AUTHORING.md"))) fail("init smoke: authoring notes leaked to user project");
  if (all.skills.length !== names.length) fail("init smoke: --skills all did not select every skill");
  const core = selectSkills(manifest, "core", "fighting-game");
  for (const expectedName of ["aura3d-core", "aura3d-browser-game", "aura3d-character-animation"]) if (!core.includes(expectedName)) fail(`init smoke: core+fighting-game missing ${expectedName}`);
  const target = join(smoke, ".agents/skills/aura3d-core/SKILL.md");
  writeFileSync(target, "user edit\n");
  const again = writeAgentSkills({ projectDir: smoke, agent: "generic", skills: "all", skillsDir: skillsRoot });
  if (!again.skippedUserModified.includes(target) || readFileSync(target, "utf8") !== "user edit\n") fail("init smoke: user-edited file was overwritten");
} finally {
  rmSync(smoke, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: failures.length === 0, skills: names, mirrors: SKILL_MIRRORS, failures }, null, 2));
if (failures.length) process.exitCode = 1;

function checkMarkdown(skill: string, path: string, isSkill: boolean): void {
  const rel = path.replace(`${skillsRoot}/`, "");
  const text = readFileSync(path, "utf8");
  if (isSkill) {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!fm) fail(`${rel}: missing frontmatter`);
    else {
      const nameLine = /^name:\s*(.+)$/m.exec(fm[1]!)?.[1]?.trim();
      const desc = /^description:\s*(.+)$/m.exec(fm[1]!)?.[1]?.trim() ?? "";
      if (nameLine !== skill) fail(`${rel}: frontmatter name "${nameLine}" must equal directory "${skill}"`);
      if (!desc.includes("Use when")) fail(`${rel}: description must contain "Use when"`);
      const body = text.slice(fm[0].length).split("\n").length;
      if (body > MAX_BODY_LINES) fail(`${rel}: body is ${body} lines (max ${MAX_BODY_LINES})`);
    }
  }
  const lines = text.split("\n");
  let inFence = false;
  lines.forEach((line, index) => {
    const at = `${rel}:${index + 1}`;
    if (line.trimStart().startsWith("```")) { inFence = !inFence; return; }
    const codeSpans = inFence ? [line] : [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    for (const code of codeSpans) {
      if (/from ["']three["']|import \* as THREE|new GLTFLoader\(/.test(code) && inFence) fail(`${at}: forbidden three.js import/loader in code block`);
      if (/https?:\/\/\S+\.gl(b|tf)\b/i.test(code)) fail(`${at}: raw GLB/glTF URL`);
      if (inFence && /unsafeModelUrl\(/.test(code)) fail(`${at}: unsafeModelUrl in code block`);
      checkCommands(at, code);
      if (!inFence) checkApis(at, code);
    }
    if (/scenario\.com/i.test(line)) fail(`${at}: Scenario URL`);
    if (/(sk-[A-Za-z0-9]{20,}|MESHY_API_KEY=\S{8,}|ghp_[A-Za-z0-9]{20,})/.test(line)) fail(`${at}: secret-like token`);
    for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) checkLink(at, path, m[1]!);
  });
}

function checkCommands(at: string, code: string): void {
  for (const m of code.matchAll(/(?:^|\s|`)(?:aura3d|npx @aura3d\/cli@[\w.-]+)\s+([a-z][\w-]*)(?:\s+([a-z][\w-]*))?([^|;&]*)/g)) {
    const [top, sub, rest = ""] = [m[1]!, m[2], m[3]];
    if (!helpCommands.has(top)) { fail(`${at}: unknown aura3d command "${top}"`); continue; }
    if (top === "assets" && sub && !helpCommands.has(`assets ${sub}`)) fail(`${at}: unknown command "assets ${sub}"`);
    const isScene = top === "animation" && sub === "scene";
    if (isScene) {
      const verb = /^\s*([a-z][\w-]*)/.exec(rest)?.[1];
      if (verb && !sceneVerbs.has(verb)) fail(`${at}: unknown animation scene verb "${verb}"`);
    } else if (top === "animation" && sub && !helpCommands.has(`animation ${sub}`) && !cliHelp.includes(`|${sub}`) && !cliHelp.includes(`${sub}|`)) {
      fail(`${at}: unknown animation action "${sub}"`);
    }
    for (const flag of `${sub ?? ""} ${rest}`.matchAll(/--[a-z][a-z0-9-]*/g)) {
      const known = isScene ? sceneFlags.has(flag[0]) || helpFlags.has(flag[0]) : helpFlags.has(flag[0]);
      if (!known) fail(`${at}: unknown flag ${flag[0]} for aura3d ${top}${sub ? ` ${sub}` : ""}`);
    }
  }
  for (const m of code.matchAll(/(?:^|\s)animation-scene\s+([a-z][\w-]*)/g)) {
    if (!sceneVerbs.has(m[1]!)) fail(`${at}: unknown animation-scene verb "${m[1]}"`);
  }
}

function checkApis(at: string, code: string): void {
  const call = /^([a-z][A-Za-z0-9]*)\(/.exec(code);
  if (call && !JS_BUILTINS.has(call[1]!) && !exportSet.has(call[1]!)) fail(`${at}: API ${call[1]}( is not exported by any package`);
  const member = /^([a-z][A-Za-z0-9]*)\.([a-zA-Z][A-Za-z0-9]*)/.exec(code);
  if (member && exportSet.has(member[1]!) && engineNamespaces.has(member[1]!)) {
    const body = engineNamespaces.get(member[1]!)!;
    if (!new RegExp(`\\b${member[2]}\\b`).test(body)) fail(`${at}: ${member[1]}.${member[2]} is not a member of engine namespace ${member[1]}`);
  }
}

function checkLink(at: string, file: string, href: string): void {
  if (href.startsWith("#") || href.startsWith("mailto:")) return;
  if (href.startsWith(GITHUB_BLOB)) {
    const repoPath = href.slice(GITHUB_BLOB.length).split("#")[0]!;
    if (!existsSync(resolve(repoRoot, repoPath))) fail(`${at}: GitHub link target missing in repo: ${repoPath}`);
    return;
  }
  if (href.startsWith(SITE)) {
    if (!sitemap.includes(href.split("#")[0]!)) fail(`${at}: site URL not in sitemap.xml: ${href}`);
    return;
  }
  if (/^https?:/.test(href)) return;
  if (/^(\.\.\/)*docs\//.test(href) && !href.startsWith("../")) fail(`${at}: repo-relative docs link will not resolve downstream: ${href}`);
  const target = resolve(join(file, ".."), href.split("#")[0]!);
  if (!target.startsWith(skillsRoot)) fail(`${at}: relative link escapes the skills tree: ${href}`);
  else if (!existsSync(target)) fail(`${at}: broken relative link ${href}`);
}

var engineNamespaces: Map<string, string>;
function buildExportSet(): Set<string> {
  const set = new Set<string>();
  engineNamespaces = new Map();
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "templates" || entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.ts$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        const src = readFileSync(path, "utf8");
        for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) set.add(m[1]!);
        for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) for (const part of m[1]!.split(",")) {
          const alias = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
          if (alias) set.add(alias);
        }
        if (path.endsWith("packages/engine/src/agent-api/index.ts")) {
          for (const m of src.matchAll(/export const ([a-z][A-Za-z0-9]*) = \{/g)) {
            const start = m.index! + m[0].length;
            let depth = 1, i = start;
            while (i < src.length && depth > 0) { const c = src[i++]; if (c === "{") depth++; else if (c === "}") depth--; }
            engineNamespaces.set(m[1]!, src.slice(start, i));
          }
        }
      }
    }
  };
  visit(resolve(repoRoot, "packages"));
  return set;
}

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}
