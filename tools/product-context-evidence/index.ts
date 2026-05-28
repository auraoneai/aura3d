import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

type EvidenceStatus = "automated-pass" | "manual-pass" | "external-pass" | "known-gap";

interface ClaimEvidence {
  readonly claim: string;
  readonly status: EvidenceStatus;
  readonly evidence: readonly string[];
  readonly nextAction?: string;
}

const starterTemplates = ["product-viewer", "cinematic-scene", "mini-game"] as const;
const publicProductFiles = [
  "ProductContextPRD.md",
  "README.md",
  "llms.txt",
  "AGENTS.md",
  ".claude/CLAUDE.md",
  ".cursor/rules/aura3d.mdc",
  ".github/copilot-instructions.md",
  "index.html",
  "marketing/index.html",
  "marketing/src/main.ts",
  "marketing/src/styles.css",
  ...listFiles("docs/agents"),
  "docs/api/readme.md",
  "docs/api/app-api.md",
  "docs/api/public-api.md",
  "docs/templates/create-aura3d-templates.md",
  "docs/project/current-state.md",
  "docs/project/apps-classification.md",
  "docs/project/site-map.md",
  "docs/project/go-to-market-strategy.md",
  "docs/project/claim-guidelines.md"
].filter((path) => existsSync(path));
const activeCodeAndDocs = [
  ...listFiles("packages"),
  ...listFiles("apps"),
  ...listFiles("marketing"),
  ...listFiles("docs/agents"),
  ...listFiles("docs/api"),
  ...listFiles("docs/templates"),
  ...listFiles("docs/concepts"),
  "README.md",
  "ProductContextPRD.md",
  "llms.txt",
  "AGENTS.md"
].filter((path) => !path.startsWith("archive/") && !path.includes("/dist/") && !path.includes("/node_modules/"));

const activeTemplateDirs = existsSync("packages/create-aura3d/templates")
  ? readdirSync("packages/create-aura3d/templates", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
const appDirs = existsSync("apps")
  ? readdirSync("apps", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
const appsClassification = readText("docs/project/apps-classification.md");
const rootPackage = readJson<{ files?: string[]; scripts?: Record<string, string> }>("package.json");
const createPackage = readJson<{ files?: string[]; name?: string; bin?: Record<string, string> }>("packages/create-aura3d/package.json");
const cliPackage = readJson<{ bin?: Record<string, string> }>("packages/aura3d-cli/package.json");

const versionTerms = [/\bV[234]\b/i, /Path A/i, /Path B/i, /path-a/i, /path-b/i, /check:v4/i, /__v4/i, /aura3d-v4/i];
const draftTerms = [
  new RegExp(["place", "holder"].join(""), "i"),
  /\bMVP\b/i,
  /future work/i,
  /under review/i,
  /needs work/i,
  /\btoy\b/i,
  /\bstub\b/i
];
const archivedRuntimeTerms = [/AuraSceneIR/, /MockProvider/, /prompt-to-scene/, /@aura3d\/ai-scene/];

const checks: ReleaseCheck[] = [
  {
    id: "product-context-prd-exists",
    pass: existsSync("ProductContextPRD.md"),
    detail: "ProductContextPRD.md is present"
  },
  {
    id: "test-plan-prd-exists",
    pass: existsSync("TestV4PlanPRD.md"),
    detail: "TestV4PlanPRD.md is present"
  },
  {
    id: "release-gate-script-exists",
    pass: Boolean(rootPackage.scripts?.["check:release"]),
    detail: `check:release=${rootPackage.scripts?.["check:release"] ?? "missing"}`
  },
  {
    id: "product-context-script-registered",
    pass: Boolean(rootPackage.scripts?.["check:product-context"]),
    detail: `check:product-context=${rootPackage.scripts?.["check:product-context"] ?? "missing"}`
  },
  {
    id: "active-template-directory-exactly-three",
    pass: sameSet(activeTemplateDirs, [...starterTemplates]),
    detail: `active template dirs: ${activeTemplateDirs.join(", ")}`
  },
  {
    id: "held-back-template-archive-present",
    pass: existsSync("archive/held-back-create-aura3d-templates/README.md"),
    detail: "archive/held-back-create-aura3d-templates/README.md documents held-back templates"
  },
  {
    id: "apps-classification-covers-active-apps",
    pass: appDirs.every((dir) => appsClassification.includes(`\`${dir}\``) || appsClassification.includes(`\`/apps/${dir}/\``)),
    detail: appDirs.filter((dir) => !appsClassification.includes(`\`${dir}\``) && !appsClassification.includes(`\`/apps/${dir}/\``)).length === 0
      ? `${appDirs.length} active app dirs are classified`
      : `missing classifications: ${appDirs.filter((dir) => !appsClassification.includes(`\`${dir}\``) && !appsClassification.includes(`\`/apps/${dir}/\``)).join(", ")}`
  },
  {
    id: "public-product-language-no-release-cycle",
    pass: findMatches(publicProductFiles, versionTerms).length === 0,
    detail: summarizeMatches(publicProductFiles, versionTerms)
  },
  {
    id: "public-site-no-draft-status-language",
    pass: findMatches(["index.html", "marketing/index.html", "marketing/src/main.ts", "marketing/src/styles.css"], draftTerms).length === 0,
    detail: summarizeMatches(["index.html", "marketing/index.html", "marketing/src/main.ts", "marketing/src/styles.css"], draftTerms)
  },
  {
    id: "active-code-no-archived-runtime-surface",
    pass: findMatches(activeCodeAndDocs, archivedRuntimeTerms).length === 0,
    detail: summarizeMatches(activeCodeAndDocs, archivedRuntimeTerms)
  },
  {
    id: "archive-not-workspace-package",
    pass: !readText("pnpm-workspace.yaml").includes("archive"),
    detail: "pnpm workspace does not include archive paths"
  },
  {
    id: "create-aura3d-public-install-name",
    pass: createPackage.name === "create-aura3d",
    detail: `packages/create-aura3d/package.json name is ${createPackage.name ?? "missing"}`
  },
  {
    id: "aura3d-cli-user-facing-bin",
    pass: Boolean(cliPackage.bin?.["aura3d"] ?? cliPackage.bin?.["aura"]),
    detail: `@aura3d/cli bin entries: ${Object.keys(cliPackage.bin ?? {}).join(", ") || "none"}`
  },
  {
    id: "root-package-ships-only-starter-templates",
    pass: (rootPackage.files ?? []).filter((file) => file.startsWith("templates/")).every((file) => starterTemplates.some((template) => file === `templates/${template}`)),
    detail: `root template files: ${(rootPackage.files ?? []).filter((file) => file.startsWith("templates/")).join(", ")}`
  }
];

const claims: ClaimEvidence[] = [
  claim("Aura3D is the editable scene layer for agent-written browser 3D.", "automated-pass", ["ProductContextPRD.md", "README.md", "marketing/index.html"]),
  claim("AI coding agents write TypeScript or JavaScript against a compact public API.", statusFrom("check:agent-api"), ["pnpm run check:agent-api", "tests/reports/agent-api-surface.json"]),
  claim("Users bring their own assets.", statusFromReport("tests/reports/asset-corpus.json"), ["tools/asset-corpus/index.ts", "tests/reports/asset-corpus.json"], "Run and expand asset corpus against real external GLBs."),
  claim("Aura3D provides typed asset references.", statusFrom("check:assets-cli"), ["pnpm run check:assets-cli", "tests/unit/aura3d-cli/assets.test.ts"]),
  claim("Aura3D provides starter templates.", statusFrom("check:templates"), ["pnpm run check:templates", "packages/create-aura3d/templates"]),
  claim("Aura3D provides diagnostics.", statusFrom("check:devtools"), ["pnpm run check:devtools", "packages/engine/src/devtools"]),
  claim("Aura3D provides screenshots.", statusFrom("check:examples"), ["pnpm run check:examples", "tests/browser/examples-route-health.spec.ts"]),
  claim("Aura3D provides static deployment checks.", statusFrom("check:deployment"), ["pnpm run check:deployment", "packages/aura3d-cli/src/index.ts"]),
  claim("@aura3d/engine exposes the public engine surface.", statusFrom("check:agent-api"), ["packages/engine/src/agent-api/index.ts", "tools/agent-api-surface/index.ts"]),
  claim("@aura3d/react is an optional thin React adapter.", statusFrom("check:agent-api"), ["packages/react/src/index.ts", "tests/unit/react-adapter/react-adapter.test.ts"]),
  claim("@aura3d/cli supports asset, doctor, deployment, serve, and agent-file flows.", statusFrom("check:assets-cli"), ["packages/aura3d-cli/src/cli.ts", "packages/aura3d-cli/src/index.ts"]),
  claim("create-aura3d scaffolds product-viewer, cinematic-scene, and mini-game.", createPackage.name === "create-aura3d" ? statusFrom("check:templates") : "known-gap", ["packages/create-aura3d", "tools/agent-templates/index.ts"], "Align package name with public npx command or update every public command."),
  claim("Agent-readable context is useful.", statusFromReport("tests/reports/agent-context/codex-self-test.json"), ["docs/agents/*", "tests/reports/agent-context/codex-self-test.json"], "Run Codex self-test, then Claude Code, Cursor, and Copilot."),
  claim("Legacy AI-runtime code is outside the active workspace.", checkStatus("active-code-no-archived-runtime-surface"), ["archive/legacy-ai-runtime", "tools/product-context-evidence/index.ts"]),
  claim("The public authoring model is source code plus typed assets.", statusFromReport("tests/reports/agent-context/codex-self-test.json"), ["README.md", "docs/agents/build-playbook.md"], "Verify with generated app and typed assets."),
  claim("The active starter-template directory contains only the three starter templates.", checkStatus("active-template-directory-exactly-three"), ["packages/create-aura3d/templates"]),
  claim("Held-back template experiments are outside the active starter-template directory and documented in archive.", checkStatus("held-back-template-archive-present"), ["archive/held-back-create-aura3d-templates/README.md"]),
  claim("Active apps directories are classified.", checkStatus("apps-classification-covers-active-apps"), ["docs/project/apps-classification.md"]),
  claim("Marketing speaks in product and workflow language.", statusFrom("check:marketing-truth"), ["marketing/index.html", "tools/marketing-truth/index.ts"]),
  claim("Public site checks reject draft-copy, internal-status, and version-cycle wording.", statusFrom("check:docs-site"), ["tools/docs-site/index.ts", "tools/marketing-truth/index.ts"]),
  claim("Broad product confidence depends on focused release checks and dogfood, not aggregate monorepo test counts.", "automated-pass", ["ProductContextPRD.md", "TestV4PlanPRD.md"]),
  claim("Extra apps routes are evidence and not the primary getting-started path.", statusFrom("check:examples"), ["docs/project/apps-classification.md", "marketing/index.html"]),
  claim("Bundle-size proof measures built bundles, including starter apps.", statusFrom("check:bundle-size"), ["tools/bundle-size/index.ts", "tests/reports/bundle-size.json"])
];

const completeClaims = claims.filter((entry) => entry.status !== "known-gap").length;
checks.push({
  id: "claim-evidence-matrix-complete",
  pass: claims.every((entry) => entry.status !== "known-gap"),
  detail: `${completeClaims}/${claims.length} claims have pass evidence; known gaps: ${claims.filter((entry) => entry.status === "known-gap").map((entry) => entry.claim).join(" | ") || "none"}`
});

writeEvidenceMarkdown(claims, checks);
writeReport("tests/reports/product-context-evidence.json", "aura3d-product-context-evidence", checks, { claims });

function claim(claimText: string, status: EvidenceStatus, evidence: readonly string[], nextAction?: string): ClaimEvidence {
  return { claim: claimText, status, evidence, nextAction };
}

function checkStatus(id: string): EvidenceStatus {
  return checks.find((check) => check.id === id)?.pass ? "automated-pass" : "known-gap";
}

function statusFrom(scriptName: string): EvidenceStatus {
  const reportHints: Record<string, string> = {
    "check:agent-api": "tests/reports/agent-api-surface.json",
    "check:assets-cli": "tests/reports/asset-cli.json",
    "check:templates": "tests/reports/agent-templates.json",
    "check:examples": "tests/reports/agent-examples.json",
    "check:devtools": "tests/reports/agent-devtools.json",
    "check:deployment": "tests/reports/agent-deployment.json",
    "check:docs-site": "tests/reports/docs-site.json",
    "check:bundle-size": "tests/reports/bundle-size.json",
    "check:marketing-truth": "tests/reports/marketing-truth.json"
  };
  return statusFromReport(reportHints[scriptName] ?? "");
}

function statusFromReport(path: string): EvidenceStatus {
  if (!path || !existsSync(path)) return "known-gap";
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { pass?: unknown };
    return parsed.pass === true ? "automated-pass" : "known-gap";
  } catch {
    return "known-gap";
  }
}

function writeEvidenceMarkdown(claims: readonly ClaimEvidence[], checks: readonly ReleaseCheck[]): void {
  const lines = [
    "# Product Context Evidence",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Claims with evidence: ${claims.filter((entry) => entry.status !== "known-gap").length}/${claims.length}`,
    `- Automated checks passing: ${checks.filter((check) => check.pass).length}/${checks.length}`,
    "",
    "## Claim Matrix",
    "",
    "| Claim | Status | Evidence | Next Action |",
    "|---|---|---|---|",
    ...claims.map((entry) => `| ${escapeTable(entry.claim)} | \`${entry.status}\` | ${entry.evidence.map((item) => `\`${item}\``).join("<br>")} | ${escapeTable(entry.nextAction ?? "")} |`),
    "",
    "## Automated Checks",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("docs/project/product-context-evidence.md", `${lines.join("\n")}\n`);
}

function findMatches(paths: readonly string[], patterns: readonly RegExp[]): readonly string[] {
  const hits: string[] = [];
  for (const path of paths) {
    if (!existsSync(path) || statSync(path).isDirectory() || isBinaryLike(path)) continue;
    const text = readText(path);
    for (const pattern of patterns) {
      if (pattern.test(text)) hits.push(`${path}: ${pattern.source}`);
    }
  }
  return hits;
}

function summarizeMatches(paths: readonly string[], patterns: readonly RegExp[]): string {
  const matches = findMatches(paths, patterns);
  return matches.length === 0 ? "no banned text found" : matches.slice(0, 12).join("; ");
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", "coverage", "test-results", ".git"].includes(entry.name)) continue;
        stack.push(path);
      } else {
        files.push(path);
      }
    }
  }
  return files.sort();
}

function readText(path: string): string {
  return existsSync(path) && !statSync(path).isDirectory() ? readFileSync(path, "utf8") : "";
}

function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function isBinaryLike(path: string): boolean {
  return [".glb", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"].includes(extname(path).toLowerCase());
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
