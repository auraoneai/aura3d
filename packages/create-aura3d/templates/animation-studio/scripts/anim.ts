// Animation Studio command pipeline. Pure Node (no engine/browser) so plan/profile/package/verify
// run deterministically. `preview` is the browser route (npm run dev).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heroCharacter } from "../src/character.js";
import { createAnimationProfile, validateAnimationStudioCharacter } from "../src/profile.js";

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = join(here, "..");
const character = heroCharacter;
const outDir = join(templateRoot, "dist", "animation", character.id);

function write(file: string, data: unknown): string {
  const abs = join(outDir, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`);
  return abs;
}

function plan(): void {
  const readiness = validateAnimationStudioCharacter(character);
  const profile = createAnimationProfile(character);
  console.log(`Animation Studio plan for "${character.name}" (${character.id})`);
  console.log(`  required actions: ${readiness.requiredActions.join(", ")}`);
  console.log(`  clip map: ${Object.entries(character.clipMap).map(([a, c]) => `${a}=${c}`).join(", ")}`);
  console.log(`  state graph: ${profile.stateGraph.states.join(" -> ")} (params ${profile.stateGraph.parameters.join(", ")})`);
  console.log(`  blend tree (speed): ${profile.blendTree.children.map((c) => `${c.clip}@${c.threshold}`).join(", ")}`);
  console.log(`  ik chains: ${character.ikChains.map((c) => c.id).join(", ")}`);
  console.log(`  readiness: ${readiness.ok ? "OK" : `FAILED -> ${readiness.errors.join("; ")}`}`);
  if (!readiness.ok) process.exitCode = 1;
}

function profileCmd(): void {
  const readiness = validateAnimationStudioCharacter(character);
  const profile = createAnimationProfile(character);
  write("animation-profile.json", profile);
  write("rig-readiness.json", readiness);
  console.log(`Wrote animation-profile.json + rig-readiness.json to ${outDir}`);
  if (!readiness.ok) process.exitCode = 1;
}

function packageCmd(): void {
  const readiness = validateAnimationStudioCharacter(character);
  const profile = createAnimationProfile(character);
  write("animation-profile.json", profile);
  write("rig-readiness.json", readiness);
  const manifest = {
    schema: "aura-animation-studio-package/v1",
    characterId: character.id,
    deterministicArtifacts: ["animation-profile.json", "rig-readiness.json", "review-package.md"],
    previewArtifacts: ["preview-frames/{idle,walk,run,blend,ik}.png", "skinning-evidence.json", "motion-quality.json", "route-proof.json"],
    previewNote: "preview artifacts are produced by `npm run dev` + the browser preview route; this pure package step writes the deterministic profile/readiness/review only."
  };
  write("package-manifest.json", manifest);
  const review = [
    `# Animation Studio Review — ${character.name}`,
    "",
    `- Character: ${character.name} (${character.id}), asset key \`${character.assetKey}\``,
    `- Readiness: ${readiness.ok ? "OK" : "FAILED"}`,
    `- Locomotion states: ${profile.stateGraph.states.join(", ")}`,
    `- Blend thresholds: ${profile.blendTree.children.map((c) => `${c.clip}@${c.threshold}`).join(", ")}`,
    `- IK chains: ${character.ikChains.map((c) => c.id).join(", ")}`,
    "",
    "Run `npm run dev` and open the preview route to capture preview-frames, skinning-evidence, motion-quality, and route-proof.",
    ""
  ].join("\n");
  write("review-package.md", review);
  console.log(`Wrote Animation Studio package to ${outDir}`);
  if (!readiness.ok) process.exitCode = 1;
}

function verify(): void {
  const readiness = validateAnimationStudioCharacter(character);
  if (!readiness.ok) {
    console.error(`anim:verify FAILED -> ${readiness.errors.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("anim:verify OK — character readiness passes; profile is exportable.");
}

const cmd = process.argv[2] ?? "plan";
switch (cmd) {
  case "plan":
    plan();
    break;
  case "preview":
    console.log("Run `npm run dev` and open the Animation Studio preview route in a browser.");
    break;
  case "profile":
    profileCmd();
    break;
  case "package":
    packageCmd();
    break;
  case "verify":
    verify();
    break;
  default:
    console.error(`Unknown command "${cmd}". Use plan|preview|profile|package|verify.`);
    process.exitCode = 1;
}
