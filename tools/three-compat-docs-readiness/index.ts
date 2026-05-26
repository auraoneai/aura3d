import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface RetainedDoc {
  readonly path: string;
  readonly requiredTerms: readonly string[];
}

const retainedDocs: readonly RetainedDoc[] = [
  {
    path: "docs/api/public-api.md",
    requiredTerms: ["@aura3d/engine", "@aura3d/three-compat", "Public entrypoint"]
  },
  {
    path: "docs/comparisons/threejs.md",
    requiredTerms: ["Three.js", "reference implementation", "A3D runtime renderer"]
  },
  {
    path: "docs/project/compatibility.md",
    requiredTerms: ["compatibility", "support", "migration"]
  },
  {
    path: "docs/project/migration.md",
    requiredTerms: ["Three.js", "migration", "packages/three-compat"]
  },
  {
    path: "docs/project/threejs-parity-status.md",
    requiredTerms: ["Three.js", "parity", "tests/reports/threejs-parity"]
  },
  {
    path: "docs/project/threejs-superiority-status.md",
    requiredTerms: ["superiority", "tests/reports/superiority", "regenerate"]
  },
  {
    path: "docs/templates/create-aura3d-templates.md",
    requiredTerms: ["template", "create-aura3d", "three-compat"]
  }
] as const;

function listMarkdownFiles(dir: string): readonly string[] {
  const fullDir = resolve(dir);
  if (!existsSync(fullDir)) return [];
  const entries = readdirSync(fullDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return listMarkdownFiles(relativePath);
    return entry.isFile() && entry.name.endsWith(".md") ? [relativePath] : [];
  });
}

const missingRequiredFiles = retainedDocs.filter((doc) => !existsSync(resolve(doc.path))).map((doc) => doc.path);
const docsWithMissingTerms = retainedDocs.flatMap((doc) => {
  if (!existsSync(resolve(doc.path))) return [];
  const text = readFileSync(resolve(doc.path), "utf8");
  const missingTerms = doc.requiredTerms.filter((term) => !text.includes(term));
  return missingTerms.length === 0 ? [] : [`${doc.path}: ${missingTerms.join(", ")}`];
});
const markdownFiles = listMarkdownFiles("docs");
const allDocs = markdownFiles.map((file) => readFileSync(resolve(file), "utf8")).join("\n");
const runnableSnippets = markdownFiles.filter((file) => readFileSync(resolve(file), "utf8").includes("```ts"));
const workflowWords = ["Install", "Scaffold", "Build", "Deploy", "Debug", "Migrate"];
const missingWorkflowWords = workflowWords.filter((word) => !allDocs.toLowerCase().includes(word.toLowerCase()));
const checks = [
  { name: "required-files-present", pass: missingRequiredFiles.length === 0, detail: missingRequiredFiles.join(", ") || "retained Three.js compatibility docs exist" },
  { name: "required-terms-present", pass: docsWithMissingTerms.length === 0, detail: docsWithMissingTerms.join("; ") || "retained docs include required terms" },
  { name: "docs-surface-count", pass: markdownFiles.length === 61, detail: `${markdownFiles.length}/61 retained markdown files` },
  { name: "snippet-count", pass: runnableSnippets.length >= 4, detail: `${runnableSnippets.length}/4 docs with TypeScript snippets` },
  { name: "claim-boundaries", pass: allDocs.includes("Not A Full Drop-In Replacement") && (allDocs.includes("known limits") || allDocs.includes("Known Limits")), detail: "drop-in replacement and known-limits boundaries documented" },
  { name: "threejs-map", pass: allDocs.includes("Three.js"), detail: "Three.js compatibility content present" },
  { name: "raw-three-gap-section", pass: allDocs.includes("known limits") || allDocs.includes("Known Limits"), detail: "known limits coverage present" },
  { name: "workflow-coverage", pass: missingWorkflowWords.length === 0, detail: missingWorkflowWords.join(", ") || "install, scaffold, build, deploy, debug, migrate covered" }
];
const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-docs-readiness/current",
  generatedAt: new Date().toISOString(),
  pass,
  docsSurfaceCount: markdownFiles.length,
  snippetDocCount: runnableSnippets.length,
  checks
};
const reportPath = resolve("tests/reports/three-compat-docs-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Three.js compatibility docs readiness passed: ${markdownFiles.length} retained docs, ${runnableSnippets.length} snippet docs.`);
