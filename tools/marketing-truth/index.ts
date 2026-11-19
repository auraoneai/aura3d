import { readFileSync } from "node:fs";
import { fileIncludes, noFileMatches, writeReport, type ReleaseCheck } from "../check-common";

// The release copy is pinned to the canonical release manifest, not to a
// hard-coded version. `check:version` enforces that every version claim on the
// page matches the root package.json version; this checker does the same.
const canonicalVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version?: string }).version ?? "0.0.0";
const files = ["README.md", "marketing/index.html", "docs/project/status/current-state.md", "docs/project/go-to-market-strategy.md"];
const publicSiteFiles = ["index.html", "marketing/index.html", "marketing/src/main.ts", "marketing/src/styles.css", "marketing/src/home.css"];
const marketingHtml = readFileSync("marketing/index.html", "utf8");
const pathBTerms = [
  "AuraScene" + "IR",
  "Mock" + "Provider",
  ["provider", "runtime"].join("-"),
  ["prompt", "to", "scene"].join("-"),
  "@aura3d/" + "ai-scene"
].map((term) => new RegExp(escapeRegExp(term)));
const versionCycleTerms = [
  // Ban internal cycle labels such as "V2" while allowing an explicit public
  // semver such as "v2.0.0" in package and release metadata.
  new RegExp(`\\b${"V"}[234]\\b(?!\\.)`, "i"),
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
  fileIncludes("marketing/index.html", [
    '"@type": "SoftwareApplication"', `"softwareVersion": "${canonicalVersion}"`,
    "npx create-aura3d@" + canonicalVersion, "npm run dev", "{{GAME_COUNT}} games"
  ], "homepage release metadata, starter and game inventory"),
  fileIncludes("marketing/docs/aura3d-vs-threejs.html", [
    'id="migrating"', 'id="method"', "WebGL2", "evidence/vs-threejs/RESULTS.md"
  ], "comparison documents its method, runtime and evidence"),
  fileIncludes("marketing/index.html", [
    'href="/docs/agent-quickstart"', 'href="/docs/templates"', 'href="/docs/#examples"',
    'href="/apps/showcase-index/"', 'href="/docs/aura3d-vs-threejs"', 'href="/docs/deployment"',
    'href="https://www.npmjs.com/package/@aura3d/engine"', 'href="https://github.com/auraoneai/aura3d"'
  ], "public developer destinations"),
  fileIncludes("README.md", ["agent-written browser 3D", "assets add", "create-aura3d"], "README product positioning"),
  noFileMatches(publicSiteFiles, versionCycleTerms, "public site no version-cycle language"),
  noFileMatches(publicSiteFiles, publicDraftLanguageTerms, "public site production language only"),
  noFileMatches(files, pathBTerms, "marketing no removed runtime copy"),
  {
    id: "marketing-playable-story",
    pass: /<a\b[^>]*href="\/apps\/[^"]+"[^>]*data-demo-play/.test(marketingHtml)
      && /<iframe\b[^>]*data-demo-frame/.test(marketingHtml)
      && !/<iframe\b[^>]*\ssrc=/.test(marketingHtml)
      && /href="\/games\/[^"]+\/"/.test(marketingHtml)
      && /href="https:\/\/github.com\/auraoneai\/aura3d\/blob\/main\/examples\/[^"]+\.ts"/.test(marketingHtml),
    detail: "featured game has a direct play action, an on-demand embed, production notes and linked TypeScript source"
  },
  {
    id: "marketing-example-matches-source",
    pass: (marketingHtml.match(/<pre[^>]*id="studio-snippet"[^>]*><code>([\s\S]*?)<\/code>/)?.[1] ?? "")
      .replace(/\s+/g, "") === readFileSync("tools/bench-vs-threejs/tagline/aura-hello/main.ts", "utf8").replace(/\s+/g, ""),
    detail: "product scene snippet matches the linked implementation"
  }
];

writeReport("tests/reports/marketing-truth.json", "aura3d-marketing-truth", checks);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
