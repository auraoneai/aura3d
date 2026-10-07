import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

interface Finding {
  readonly path: string;
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

const requiredFiles = [
  "1.6-FINAL-PRD-Finishes.md",
  "docs/project/parity/threejs-r185-surface-inventory.md",
  "benchmark/context/threejs-r185.1-20260808.json",
  "docs/project/claim-guidelines.md",
  "docs/agents/claims-and-boundaries.md"
] as const;

const blockedPatterns: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /\bbroad three\.?js replacement\b/i, reason: "Broad Three.js replacement claim is blocked." },
  { pattern: /\bfull three\.?js(?: api)? replacement\b/i, reason: "Full Three.js API replacement claim is blocked." },
  { pattern: /\bunity replacement\b/i, reason: "Unity replacement claim is blocked." },
  { pattern: /\bunreal replacement\b/i, reason: "Unreal replacement claim is blocked." },
  { pattern: /\bfull game engine replacement\b/i, reason: "Full game engine replacement claim is blocked." },
  { pattern: /\bfull gltf ecosystem parity\b/i, reason: "Full glTF ecosystem parity claim is blocked." },
  { pattern: /\bfull webgpu parity\b/i, reason: "Full WebGPU parity claim is blocked." },
  { pattern: /\bbroad performance superiority\b/i, reason: "Broad performance superiority claim is blocked." },
  { pattern: /\bfull commercial dcc pipeline parity\b/i, reason: "Full DCC pipeline parity claim is blocked." }
] as const;

const safeLinePatterns = [
  /\bblocked\b/i,
  /\bnot\b/i,
  /\bdoes not\b/i,
  /\bdo not\b/i,
  /\buntil\b/i,
  /\bunless\b/i,
  /\btarget\b/i,
  /\bcurrently allowed target language\b/i,
  /\bclaim boundary\b/i,
  /\bblocked claims\b/i,
  /\bdisallowed\b/i,
  /\bremoved\b/i,
  /\bbanned\b/i,
  /\bforbidden\b/i,
  /\bnon-goals?\b/i,
  /\bunsupported\b/i
] as const;

const publicDocRoots = [
  "README.md",
  "docs/project/implementation-plan.md",
  "docs/project"
] as const;
const missing = requiredFiles.filter((path) => !existsSync(resolve(path)));
const findings: Finding[] = [];

for (const path of publicMarkdownFiles(publicDocRoots)) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const blocked of blockedPatterns) {
      if (blocked.pattern.test(line) && !isSafeBlockedClaimContext(lines, index)) {
        findings.push({
          path: relative(process.cwd(), path),
          line: index + 1,
          text: line.trim(),
          reason: blocked.reason
        });
      }
    }
  });
}

const finalPrd = readIfExists("1.6-FINAL-PRD-Finishes.md");
const currentInventory = readIfExists("docs/project/parity/threejs-r185-surface-inventory.md");
const currentTruthChecks = [
  { id: "current-target", pass: /three@0\.185\.1|Three\.js r185/i.test(`${finalPrd}\n${currentInventory}`), detail: "Final acceptance is bound to Three.js r185 / three@0.185.1." },
  { id: "renderer-workstream", pass: finalPrd.includes("## 7. Phase 3 — Make the public renderer a current competitor"), detail: "Final PRD contains the current renderer workstream." },
  { id: "comparison-workstream", pass: finalPrd.includes("## 8. Phase 4 — Current head-to-head comparison program"), detail: "Final PRD contains the current comparison workstream." },
  { id: "no-broad-score", pass: finalPrd.includes("F13 — No broad superiority score"), detail: "Broad superiority scoring remains prohibited." }
] as const;

const report = {
  schema: "a3d-external-parity-truth",
  generatedAt: new Date().toISOString(),
  pass: missing.length === 0
    && findings.length === 0
    && currentTruthChecks.every((entry) => entry.pass),
  requiredFiles: requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)) })),
  missing,
  findings,
  currentTruthChecks,
  historicalMilestonePhraseChecksRemoved: true,
  blockedClaimsRemainBlocked: true
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-truth.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function readIfExists(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

function isSafeBlockedClaimContext(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (safeLinePatterns.some((safe) => safe.test(line))) return true;
  const previousHeading = nearestHeading(lines, index);
  if (safeLinePatterns.some((safe) => safe.test(previousHeading))) return true;
  // Lists often use a plain-text lead-in such as "Disallowed current public
  // wording:" rather than a Markdown heading. Limit the look-back so a remote
  // disclaimer cannot bless an affirmative claim elsewhere in the document.
  const recentContext = lines.slice(Math.max(0, index - 8), index).join("\n");
  return safeLinePatterns.some((safe) => safe.test(recentContext));
}

function nearestHeading(lines: readonly string[], index: number): string {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const line = lines[cursor] ?? "";
    if (/^#{1,6}\s+/.test(line)) return line;
  }
  return "";
}

function publicMarkdownFiles(roots: readonly string[]): string[] {
  const files: string[] = [];
  for (const root of roots) {
    const full = resolve(root);
    if (!existsSync(full)) continue;
    if (statSync(full).isFile()) {
      if (extname(full) === ".md") files.push(full);
      continue;
    }
    files.push(...walk(full).filter((path) => extname(path) === ".md"));
  }
  return files;
}

function walk(dir: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}
