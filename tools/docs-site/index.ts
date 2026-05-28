import { readFileSync, statSync } from "node:fs";
import { existsCheck, fileIncludes, noFileMatches, writeReport, type ReleaseCheck } from "../check-common";

const files = ["index.html", "marketing/index.html", "marketing/src/main.ts", "marketing/src/styles.css"];
const marketingHtml = readFileSync("marketing/index.html", "utf8");
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
  existsCheck("tests/reports/docs-site/marketing-home.png", "docs site screenshot"),
  fileIncludes("marketing/index.html", ["/llms.txt", "product-viewer", "cinematic-scene", "mini-game", "data-copy=\"asset-add\"", "deployment", "hero-grid", "wow-concept-car-cinema", "/marketing/src/main.ts"], "marketing product paths"),
  noFileMatches(files, versionCycleTerms, "docs site marketing no version-cycle language"),
  noFileMatches(files, publicDraftLanguageTerms, "docs site production language only"),
  noFileMatches(files, pathBTerms, "docs site no removed runtime copy"),
  {
    id: "marketing-screenshot-nontrivial",
    pass: statSync("tests/reports/docs-site/marketing-home.png").size > 15_000,
    detail: `marketing screenshot is ${statSync("tests/reports/docs-site/marketing-home.png").size} bytes`
  },
  {
    id: "marketing-search-and-template-surface",
    pass:
      marketingHtml.includes("data-docs-search-input") &&
      ["install", "asset add", "templates", "deployment", "troubleshooting", "product-viewer", "cinematic-scene", "mini-game", "check-deploy", "llms.txt"].every((term) => marketingHtml.toLowerCase().includes(term)),
    detail: "marketing page exposes functional docs search terms, templates, deploy command, and agent docs"
  }
];

writeReport("tests/reports/docs-site.json", "aura3d-docs-site", checks);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
