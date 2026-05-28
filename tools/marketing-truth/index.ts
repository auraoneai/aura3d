import { statSync, readFileSync } from "node:fs";
import { fileIncludes, noFileMatches, writeReport, type ReleaseCheck } from "../check-common";

const files = ["README.md", "marketing/index.html", "docs/project/current-state.md", "docs/project/go-to-market-strategy.md"];
const publicSiteFiles = ["index.html", "marketing/index.html", "marketing/src/main.ts", "marketing/src/styles.css"];
const marketingHtml = readFileSync("marketing/index.html", "utf8");
const marketingCss = readFileSync("marketing/src/styles.css", "utf8");
const marketingTs = readFileSync("marketing/src/main.ts", "utf8");
const pathBTerms = [
  "AuraScene" + "IR",
  "Mock" + "Provider",
  ["provider", "runtime"].join("-"),
  ["prompt", "to", "scene"].join("-"),
  "@aura3d/" + "ai-scene"
].map((term) => new RegExp(escapeRegExp(term)));
const versionCycleTerms = [
  new RegExp(`\\b${"V"}[234]\\b`, "i"),
  new RegExp(["Path", "A"].join(" "), "i"),
  new RegExp(["Path", "B"].join(" "), "i")
];
const publicDraftLanguageTerms = [
  new RegExp(["place", "holder"].join(""), "i"),
  new RegExp(`\\b${["M", "V", "P"].join("")}\\b`, "i"),
  new RegExp(["needs", "work"].join(" "), "i"),
  new RegExp(["under", "review"].join(" "), "i"),
  new RegExp(`\\b${["t", "o", "y"].join("")}\\b`, "i"),
  new RegExp(["future", "work"].join(" "), "i"),
  new RegExp(`\\b${["T", "B", "D"].join("")}\\b`, "i"),
  new RegExp(["F", "I", "X", "M", "E"].join(""), "i"),
  new RegExp(`\\b${["s", "t", "u", "b"].join("")}\\b`, "i")
];

const checks: ReleaseCheck[] = [
  fileIncludes("marketing/index.html", ["Aura3D", "agent-written browser 3D", "assets add", "check-deploy", "The agent writes code. You bring the assets.", "not a hidden runtime generator"], "marketing truthful product copy"),
  fileIncludes("README.md", ["agent-written browser 3D", "assets add", "create-aura3d"], "README product positioning"),
  noFileMatches(publicSiteFiles, versionCycleTerms, "public site no version-cycle language"),
  noFileMatches(publicSiteFiles, publicDraftLanguageTerms, "public site production language only"),
  noFileMatches(files, pathBTerms, "marketing no removed runtime copy"),
  {
    id: "marketing-restored-design-depth",
    pass: statSync("marketing/index.html").size > 30_000 && statSync("marketing/src/styles.css").size > 25_000,
    detail: `marketing/index.html=${statSync("marketing/index.html").size} bytes, marketing/src/styles.css=${statSync("marketing/src/styles.css").size} bytes`
  },
  {
    id: "marketing-rich-page-structure",
    pass: (marketingHtml.match(/<section/g) ?? []).length >= 8 && (marketingHtml.match(/<iframe/g) ?? []).length >= 4 && /\bhero-grid\b/.test(marketingHtml),
    detail: `sections=${(marketingHtml.match(/<section/g) ?? []).length}, iframes=${(marketingHtml.match(/<iframe/g) ?? []).length}, heroGrid=${/\bhero-grid\b/.test(marketingHtml)}`
  },
  {
    id: "marketing-live-engine-proof",
    pass: !/iframe[^>]+\/apps\/(?:hello-world-typed-asset|material-lighting|camera-path)\//.test(marketingHtml),
    detail: "marketing iframes use product evidence routes instead of API smoke routes"
  },
  {
    id: "marketing-copy-buttons",
    pass: (marketingHtml.match(/data-copy=/g) ?? []).length >= 4 && marketingTs.includes("querySelectorAll<HTMLButtonElement>(\"[data-copy][data-copy-text]\")"),
    detail: `copyButtons=${(marketingHtml.match(/data-copy=/g) ?? []).length}`
  },
  {
    id: "marketing-docs-search",
    pass:
      marketingHtml.includes("data-docs-search-input") &&
      marketingTs.includes("updateDocsSearch") &&
      ["install", "asset add", "templates", "deployment", "troubleshooting"].every((term) => marketingHtml.toLowerCase().includes(term)),
    detail: "marketing search covers install, asset add, templates, deployment, and troubleshooting"
  },
  {
    id: "marketing-style-not-one-pager",
    pass: marketingCss.includes(".hero-grid") && marketingCss.includes(".gallery") && marketingCss.includes(".pkg-grid") && marketingCss.includes(".diag") && marketingCss.includes("@media"),
    detail: "marketing stylesheet keeps restored hero/gallery/package/evidence/responsive design primitives"
  }
];

writeReport("tests/reports/marketing-truth.json", "aura3d-marketing-truth", checks);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
