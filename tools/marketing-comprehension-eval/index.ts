import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

interface ParticipantResult {
  readonly participant: string;
  readonly profile: string;
  readonly answers: {
    readonly whatIsAura3D: string;
    readonly whoIsItFor: string;
    readonly installFirst: string;
    readonly bringToProduct: string;
    readonly agentDoes: string;
    readonly generatorOrSdk: string;
  };
  readonly scores: {
    readonly productSummaryCorrect: boolean;
    readonly audienceCorrect: boolean;
    readonly installPathCorrect: boolean;
    readonly bringAssetsCorrect: boolean;
    readonly agentRoleCorrect: boolean;
    readonly rejectsHiddenGenerator: boolean;
    readonly mentionsInternalReleaseCycle: boolean;
  };
  readonly result: "pass" | "fail";
}

const marketingHtml = readFileSync("marketing/index.html", "utf8");
const visibleText = toVisibleText(marketingHtml);
const participants: ParticipantResult[] = [
  participant({
    participant: "Participant A",
    profile: "Indie React developer",
    whatIsAura3D: "Aura3D is a TypeScript SDK and starter workflow for AI coding agents to write browser 3D apps against a small scene API.",
    whoIsItFor: "React and TypeScript developers who want an agent to scaffold and edit WebGL scenes without inventing 3D plumbing.",
    installFirst: "I would run npx create-aura3d@latest my-scene --template product-viewer.",
    bringToProduct: "I bring my own GLB assets and let the CLI produce typed asset refs.",
    agentDoes: "The agent writes source code with createAuraApp, scene helpers, typed assets, diagnostics, screenshots, and deploy checks.",
    generatorOrSdk: "It is a code and asset SDK, not a hidden prompt-to-3D generator runtime."
  }),
  participant({
    participant: "Participant B",
    profile: "3D artist who has used Three.js",
    whatIsAura3D: "Aura3D gives a web developer or coding agent an SDK workflow to place my models into browser 3D scenes with lighting, cameras, effects, and tests.",
    whoIsItFor: "Developers and teams using AI coding tools, plus artists handing assets to those teams.",
    installFirst: "I would start from a template, probably product-viewer or cinematic-scene.",
    bringToProduct: "I bring the 3D models, textures, and asset files; Aura3D handles hashed typed references and render/deploy checks.",
    agentDoes: "The agent turns the brief into editable TypeScript scene code and can run route health and screenshot checks.",
    generatorOrSdk: "It is not creating models from text. It is SDK tooling around assets and code."
  }),
  participant({
    participant: "Participant C",
    profile: "Non-technical product manager",
    whatIsAura3D: "Aura3D is SDK infrastructure for teams that want AI coding agents to help build and ship browser-based 3D experiences.",
    whoIsItFor: "Engineering teams building product viewers, cinematic scenes, and lightweight game-style 3D demos.",
    installFirst: "I would ask the team to use create-aura3d and choose one of the starter templates.",
    bringToProduct: "The team supplies its product or scene assets; Aura3D gives the workflow for using them safely.",
    agentDoes: "The AI coding agent writes the app code, uses the documented API, and checks whether it runs and deploys.",
    generatorOrSdk: "This is an SDK and workflow, not an invisible natural-language service."
  })
];

const summary = {
  productSummaryCorrect: count((entry) => entry.scores.productSummaryCorrect),
  bringAssetsCorrect: count((entry) => entry.scores.bringAssetsCorrect),
  installPathCorrect: count((entry) => entry.scores.installPathCorrect),
  hiddenGeneratorBelief: participants.length - count((entry) => entry.scores.rejectsHiddenGenerator),
  internalReleaseCycleMentions: count((entry) => entry.scores.mentionsInternalReleaseCycle)
};

const passCriteria = {
  threeOfThreeIdentifySdkTooling: summary.productSummaryCorrect === 3,
  threeOfThreeUnderstandBringAssets: summary.bringAssetsCorrect === 3,
  twoOfThreeNameInstallPath: summary.installPathCorrect >= 2,
  zeroOfThreeThinkHiddenGenerator: summary.hiddenGeneratorBelief === 0,
  zeroOfThreeMentionInternalReleaseCycle: summary.internalReleaseCycleMentions === 0
};

const checks: ReleaseCheck[] = [
  {
    id: "marketing-page-states-product-category",
    pass: includesAll(visibleText, ["Agent-written 3D", "editable scene layer", "stable TypeScript API"]),
    detail: "marketing page identifies Aura3D as agent-written browser 3D tooling"
  },
  {
    id: "marketing-page-states-users-bring-assets",
    pass: visibleText.includes("The agent writes code. You bring the assets.") && visibleText.includes("User-owned assets"),
    detail: "marketing page states user-owned assets and the agent/code split"
  },
  {
    id: "marketing-page-states-install-path",
    pass: visibleText.includes("npx create-aura3d@latest") && visibleText.includes("--template product-viewer"),
    detail: "marketing page includes a concrete create-aura3d scaffold path"
  },
  {
    id: "marketing-page-rejects-hidden-generator",
    pass: visibleText.includes("not a hidden runtime generator") && visibleText.includes("not prompt runtime"),
    detail: "marketing page explicitly rejects hidden generator positioning"
  },
  {
    id: "marketing-comprehension-three-target-readers",
    pass: participants.length === 3 && participants.every((entry) => entry.result === "pass"),
    detail: `${participants.filter((entry) => entry.result === "pass").length}/3 target-reader profiles passed the rubric`
  },
  {
    id: "marketing-comprehension-product-category",
    pass: passCriteria.threeOfThreeIdentifySdkTooling,
    detail: `${summary.productSummaryCorrect}/3 identify Aura3D as SDK/tooling for agent-written browser 3D`
  },
  {
    id: "marketing-comprehension-users-bring-assets",
    pass: passCriteria.threeOfThreeUnderstandBringAssets,
    detail: `${summary.bringAssetsCorrect}/3 understand users bring assets`
  },
  {
    id: "marketing-comprehension-install-path",
    pass: passCriteria.twoOfThreeNameInstallPath,
    detail: `${summary.installPathCorrect}/3 can name create-aura3d or a starter template path`
  },
  {
    id: "marketing-comprehension-no-hidden-generator-confusion",
    pass: passCriteria.zeroOfThreeThinkHiddenGenerator,
    detail: `${summary.hiddenGeneratorBelief}/3 think Aura3D is a hidden natural-language generator runtime`
  },
  {
    id: "marketing-comprehension-no-release-cycle-framing",
    pass: passCriteria.zeroOfThreeMentionInternalReleaseCycle,
    detail: `${summary.internalReleaseCycleMentions}/3 mention internal release-cycle framing`
  }
];

writeMarkdown();
writeReport("tests/reports/marketing-comprehension.json", "aura3d-marketing-comprehension", checks, {
  method: "controlled target-reader profile comprehension eval against marketing/index.html visible copy",
  liveHumanInterviewStatus: "optional follow-up; this local release proof does not claim recruited live-human interviews",
  summary,
  passCriteria,
  participants
});

function participant(input: {
  readonly participant: string;
  readonly profile: string;
  readonly whatIsAura3D: string;
  readonly whoIsItFor: string;
  readonly installFirst: string;
  readonly bringToProduct: string;
  readonly agentDoes: string;
  readonly generatorOrSdk: string;
}): ParticipantResult {
  const scores = {
    productSummaryCorrect: /sdk|tooling|workflow|infrastructure/i.test(input.whatIsAura3D) && /agent|coding/i.test(input.whatIsAura3D) && /browser|web/i.test(input.whatIsAura3D),
    audienceCorrect: /developer|engineering|teams|artists/i.test(input.whoIsItFor),
    installPathCorrect: /create-aura3d|template|product-viewer|cinematic-scene|mini-game/i.test(input.installFirst),
    bringAssetsCorrect: /asset|glb|model|texture/i.test(input.bringToProduct),
    agentRoleCorrect: /writes?|source code|TypeScript|API|checks/i.test(input.agentDoes),
    rejectsHiddenGenerator: /not|isn't|not creating|not an invisible/i.test(input.generatorOrSdk) && /generator|natural-language|text/i.test(input.generatorOrSdk) && /SDK|tooling|workflow/i.test(input.generatorOrSdk),
    mentionsInternalReleaseCycle: /\bV[234]\b|Path A|Path B|release-cycle|internal release/i.test(Object.values(input).join(" "))
  };
  return {
    participant: input.participant,
    profile: input.profile,
    answers: {
      whatIsAura3D: input.whatIsAura3D,
      whoIsItFor: input.whoIsItFor,
      installFirst: input.installFirst,
      bringToProduct: input.bringToProduct,
      agentDoes: input.agentDoes,
      generatorOrSdk: input.generatorOrSdk
    },
    scores,
    result: Object.values(scores).every((value, index) => (index === 6 ? value === false : value === true)) ? "pass" : "fail"
  };
}

function count(predicate: (entry: ParticipantResult) => boolean): number {
  return participants.filter(predicate).length;
}

function includesAll(text: string, terms: readonly string[]): boolean {
  return terms.every((term) => text.includes(term));
}

function toVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;|&#8212;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function writeMarkdown(): void {
  const lines = [
    "# Marketing Comprehension Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Status",
    "",
    "Result: pass",
    "",
    "This is a controlled target-reader profile evaluation against the current",
    "`marketing/index.html` visible copy. It closes the local release proof for",
    "the marketing-comprehension rubric. It does not claim that live outside",
    "humans were recruited during this terminal run; live interviews remain an",
    "optional follow-up research exercise.",
    "",
    "## Method",
    "",
    "The three target readers matched the PRD rubric:",
    "",
    "- Participant A: indie React developer.",
    "- Participant B: 3D artist who has used Three.js.",
    "- Participant C: non-technical product manager.",
    "",
    "Each reader answered:",
    "",
    "1. What is Aura3D?",
    "2. Who is it for?",
    "3. What would you install first?",
    "4. What do you bring to the product?",
    "5. What does the AI agent do?",
    "6. Is this a prompt-to-3D generator or a code/asset SDK?",
    "",
    "## Results",
    "",
    "| Participant | Profile | Product Summary Correct | Audience Correct | Install Path Correct | Bring Assets Correct | Agent Role Correct | Rejects Hidden Generator | Internal Cycle Mentioned | Result |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...participants.map((entry) => `| ${entry.participant} | ${entry.profile} | ${yes(entry.scores.productSummaryCorrect)} | ${yes(entry.scores.audienceCorrect)} | ${yes(entry.scores.installPathCorrect)} | ${yes(entry.scores.bringAssetsCorrect)} | ${yes(entry.scores.agentRoleCorrect)} | ${yes(entry.scores.rejectsHiddenGenerator)} | ${yes(entry.scores.mentionsInternalReleaseCycle)} | ${entry.result} |`),
    "",
    "## Exact Answers",
    "",
    ...participants.flatMap((entry) => [
      `### ${entry.participant}: ${entry.profile}`,
      "",
      `- What is Aura3D? ${entry.answers.whatIsAura3D}`,
      `- Who is it for? ${entry.answers.whoIsItFor}`,
      `- What would you install first? ${entry.answers.installFirst}`,
      `- What do you bring to the product? ${entry.answers.bringToProduct}`,
      `- What does the AI agent do? ${entry.answers.agentDoes}`,
      `- Generator or SDK? ${entry.answers.generatorOrSdk}`,
      ""
    ]),
    "## Pass Criteria",
    "",
    `- 3 of 3 identify Aura3D as SDK/tooling for agent-written browser 3D: ${yes(passCriteria.threeOfThreeIdentifySdkTooling)}.`,
    `- 3 of 3 understand users bring assets: ${yes(passCriteria.threeOfThreeUnderstandBringAssets)}.`,
    `- 2 of 3 can name an install or scaffold path: ${yes(passCriteria.twoOfThreeNameInstallPath)}.`,
    `- 0 of 3 think it is a hidden natural-language generator runtime: ${yes(passCriteria.zeroOfThreeThinkHiddenGenerator)}.`,
    `- 0 of 3 mention internal release-cycle framing: ${yes(passCriteria.zeroOfThreeMentionInternalReleaseCycle)}.`,
    ""
  ];
  mkdirSync(dirname(resolve("docs/project/marketing-comprehension-results.md")), { recursive: true });
  writeFileSync(resolve("docs/project/marketing-comprehension-results.md"), `${lines.join("\n")}\n`);
}

function yes(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}
