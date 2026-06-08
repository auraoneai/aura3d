import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * B4/B5 — motion-evidence artifacts.
 *
 * B4: a skeleton-overlay strip (first/mid/final) per standard intent on the STANDARD reference rig,
 *     each showing visible motion (first vs final pixels differ + a non-trivial max rotation).
 * B5: the SAME clip retargeted onto five materially-different synthetic rigs (Mixamo / Blender / UE /
 *     sparse 8-bone mascot / rich humanoid) plus a props-only rig; each rig's `gradeRig` grade is
 *     recorded and a D-grade rig is reported as refusing body acting.
 *
 * Drives the standalone `motion-evidence-cli.ts` (no Playwright / GPU) into a temp dir and validates
 * the produced PNGs + summary JSON. Mirrors the B2 skeleton-overlay test's subprocess pattern.
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const CLI = resolve(
  REPO_ROOT,
  "packages/create-aura3d/templates/animation-studio/scripts/motion-evidence-cli.ts"
);

const STANDARD_INTENTS = ["idle", "talk", "gesture", "point", "nod", "walk", "run", "react"] as const;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A clip must travel at least this far (rad) on some key bone to count as "visible motion". */
const MIN_VISIBLE_ROT = 0.15;

interface IntentSummaryEntry {
  png: string;
  bonesTouched: string[];
  bonesTouchedCount: number;
  maxRotAmplitudeRad: number;
  firstFinalDiff: number;
  panelJointCounts: number[];
  pngBytes: number;
}
interface RigSummaryEntry {
  png: string;
  convention: string;
  grade: "A" | "B" | "C" | "D";
  mappedBoneCount: number;
  retargetCoverage: number;
  retargetedBoneCount: number;
  refusesBodyActing: boolean;
  clip: string;
  firstFinalDiff: number;
  gradeReasons: string[];
  pngBytes: number;
}

const workDir = mkdtempSync(join(tmpdir(), "aura-motion-evidence-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

let cliResult: {
  ok: boolean;
  intents: { intent: string; bonesTouched: number; maxRotAmplitudeRad: number; firstFinalDiff: number }[];
  rigs: { name: string; grade: string; mappedBoneCount: number; refusesBodyActing: boolean; firstFinalDiff: number }[];
};
let intentSummary: Record<string, IntentSummaryEntry>;
let rigSummary: Record<string, RigSummaryEntry>;

beforeAll(() => {
  const stdout = execFileSync("npx", ["tsx", CLI, "--out", workDir, "--clip", "gesture"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const line = stdout.trim().split("\n").pop() ?? "{}";
  cliResult = JSON.parse(line);
  expect(cliResult.ok, `motion-evidence CLI failed: ${line}`).toBe(true);
  intentSummary = JSON.parse(readFileSync(join(workDir, "standard-clips", "summary.json"), "utf8")).intents;
  rigSummary = JSON.parse(readFileSync(join(workDir, "rig-overlays", "summary.json"), "utf8")).rigs;
}, 120_000);

describe("B4 — per-intent visual regression strips", () => {
  it.each(STANDARD_INTENTS)("intent %s: strip exists, is a valid PNG, and shows visible motion", (intent) => {
    const png = join(workDir, "standard-clips", `${intent}.png`);
    expect(existsSync(png), `strip PNG missing for ${intent}`).toBe(true);
    const bytes = readFileSync(png);
    expect(bytes.subarray(0, 8).equals(PNG_SIG), `${intent} not a PNG`).toBe(true);

    const entry = intentSummary[intent]!;
    expect(entry, `no summary row for ${intent}`).toBeDefined();
    // Motion: first vs final frame differ (the body moved) ...
    expect(entry.firstFinalDiff, `${intent} strip is static (firstFinalDiff=0)`).toBeGreaterThan(0);
    // ... AND a real key bone rotated more than a small threshold (not an invisible clip).
    expect(entry.maxRotAmplitudeRad, `${intent} max rotation too small`).toBeGreaterThan(MIN_VISIBLE_ROT);
    // The clip touches at least one bone.
    expect(entry.bonesTouchedCount, `${intent} touches no bones`).toBeGreaterThan(0);
  });

  it("every standard intent produced an artifact (none skipped)", () => {
    for (const intent of STANDARD_INTENTS) expect(intentSummary[intent], `missing ${intent}`).toBeDefined();
    expect(Object.keys(intentSummary).sort()).toEqual([...STANDARD_INTENTS].sort());
  });
});

describe("B5 — 5-rig retargeting overlays + grades", () => {
  const EXPECTED = ["mixamo", "blender", "ue", "mascot8", "rich"] as const;

  it.each(EXPECTED)("rig %s: overlay strip exists and grade is recorded", (name) => {
    const png = join(workDir, "rig-overlays", `${name}.png`);
    expect(existsSync(png), `overlay PNG missing for ${name}`).toBe(true);
    expect(readFileSync(png).subarray(0, 8).equals(PNG_SIG), `${name} not a PNG`).toBe(true);
    const entry = rigSummary[name]!;
    expect(entry, `no summary row for ${name}`).toBeDefined();
    expect(["A", "B", "C", "D"]).toContain(entry.grade);
  });

  it("the materially-different rigs grade as expected (Mixamo/Blender/UE/rich = A, sparse mascot = C)", () => {
    expect(rigSummary.mixamo!.grade).toBe("A");
    expect(rigSummary.blender!.grade).toBe("A");
    expect(rigSummary.ue!.grade).toBe("A");
    expect(rigSummary.rich!.grade).toBe("A");
    // The sparse 8-bone mascot has no real limb chains → mascot/sparse grade.
    expect(rigSummary.mascot8!.grade).toBe("C");
    expect(rigSummary.mascot8!.mappedBoneCount).toBeLessThan(rigSummary.mixamo!.mappedBoneCount);
  });

  it("a D-grade rig is reported as REFUSING body acting", () => {
    const dRigs = Object.values(rigSummary).filter((r) => r.grade === "D");
    expect(dRigs.length, "expected at least one D-grade rig in the harness").toBeGreaterThan(0);
    for (const rig of dRigs) {
      expect(rig.refusesBodyActing, `D-grade rig ${rig.convention} must refuse body acting`).toBe(true);
      expect(rig.gradeReasons.join(" ")).toMatch(/not enough body structure|D\)/);
    }
    // Capable rigs must NOT refuse.
    expect(rigSummary.mixamo!.refusesBodyActing).toBe(false);
  });

  it("higher-grade rigs draw a richer figure than the sparse mascot (coverage masking is visible)", () => {
    // The sparse mascot's overlay PNG is smaller than a full humanoid's (fewer bone strokes).
    expect(rigSummary.mascot8!.pngBytes).toBeLessThan(rigSummary.mixamo!.pngBytes);
  });
});
