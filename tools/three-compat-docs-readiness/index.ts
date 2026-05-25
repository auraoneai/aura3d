import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface DocsManifest {
  readonly schema: string;
  readonly requirements: {
    readonly minimumGuidePages: number;
    readonly minimumRunnableOrLinkedSnippets: number;
  };
  readonly docs: readonly { readonly slug: string; readonly title: string; readonly path: string }[];
  readonly snippets: readonly { readonly id: string; readonly doc: string; readonly linkedExample: string | null }[];
}

const requiredFiles = [
  "docs/project/three-compat-roadmap-getting-started.md",
  "docs/project/three-compat-roadmap-api-reference.md",
  "docs/project/three-compat-roadmap-threejs-migration-guide.md",
  "docs/project/three-compat-roadmap-examples-index.md",
  "docs/project/three-compat-roadmap-templates-index.md",
  "docs/project/three-compat-roadmap-troubleshooting.md",
  "docs/project/three-compat-roadmap-performance-guide.md",
  "docs/project/three-compat-roadmap-asset-pipeline-guide.md",
  "docs/project/three-compat-roadmap-controls-guide.md",
  "docs/project/three-compat-roadmap-shader-authoring-guide.md",
  "docs/project/three-compat-roadmap-release-notes.md",
  "tests/unit/tools/three-compat-docs.test.ts"
] as const;

const manifest = JSON.parse(readFileSync(resolve("docs/project/three-compat-roadmap-docs-manifest.json"), "utf8")) as DocsManifest;
const missingRequiredFiles = requiredFiles.filter((file) => !existsSync(resolve(file)));
const missingDocs = manifest.docs.filter((doc) => !existsSync(resolve(doc.path))).map((doc) => doc.path);
const allDocs = manifest.docs.map((doc) => readFileSync(resolve(doc.path), "utf8")).join("\n");
const runnableOrLinkedSnippets = manifest.snippets.filter((snippet) => {
  const docText = readFileSync(resolve(snippet.doc), "utf8");
  return docText.includes("```ts") || Boolean(snippet.linkedExample && existsSync(resolve(snippet.linkedExample)));
});
const workflowWords = ["Install", "Scaffold", "Build", "Deploy", "Debug", "Migrate"];
const missingWorkflowWords = workflowWords.filter((word) => !allDocs.includes(word));
const checks = [
  { name: "required-files-present", pass: missingRequiredFiles.length === 0, detail: missingRequiredFiles.join(", ") || "all required docs files exist" },
  { name: "guide-page-count", pass: manifest.docs.length >= manifest.requirements.minimumGuidePages && missingDocs.length === 0, detail: `${manifest.docs.length}/${manifest.requirements.minimumGuidePages} guide pages` },
  { name: "snippet-count", pass: runnableOrLinkedSnippets.length >= manifest.requirements.minimumRunnableOrLinkedSnippets, detail: `${runnableOrLinkedSnippets.length}/${manifest.requirements.minimumRunnableOrLinkedSnippets} snippets` },
  { name: "api-stability-labels", pass: ["stable", "experimental", "internal"].every((label) => allDocs.includes(label)), detail: "stable/experimental/internal labels documented" },
  { name: "threejs-map", pass: allDocs.includes("Three.js Developer Quick Map"), detail: "Three.js developer quick map table present" },
  { name: "raw-three-gap-section", pass: allDocs.includes("What Still Requires Raw Three.js Or Another Engine"), detail: "raw Three.js / other engine gap section present" },
  { name: "workflow-coverage", pass: missingWorkflowWords.length === 0, detail: missingWorkflowWords.join(", ") || "install, scaffold, build, deploy, debug, migrate covered" }
];
const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-three-compat-docs-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  guidePageCount: manifest.docs.length,
  snippetCount: runnableOrLinkedSnippets.length,
  checks
};
const reportPath = resolve("tests/reports/three-compat-docs-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 docs readiness passed: ${manifest.docs.length} guide pages, ${runnableOrLinkedSnippets.length} snippets.`);
