import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WS-3.1 — the stated invariant, enforced.
 *
 * > *A single runtime input service owns keyboard state for a mounted Aura3D application, and adapters do
 * > not independently interpret the same event stream.*
 *
 * The PRD is explicit that this is **service ownership, not a grep count**, because multiple low-level
 * listeners are legitimate: an editor iframe, an application shell, a WebXR session, a standalone-package
 * adapter, a test harness. Requiring exactly one repo-wide `keydown` would force awkward architecture.
 *
 * So this asserts the thing that actually matters — that no single mounted application wires two competing
 * keyboard services — and enumerates every legitimate independent listener with its justification. An
 * unlisted new one fails, which is the point: the list is the review, not the count.
 */

const ROOT = process.cwd();

/**
 * Files allowed to attach their own keyboard listener, each with the reason.
 *
 * A file appears here because it owns a *distinct* event stream, not because it happens to listen. Adding
 * an entry is a claim that the stream is genuinely separate from the mounted app's.
 */
const LEGITIMATE_KEYBOARD_OWNERS: Readonly<Record<string, string>> = {
  "packages/engine/src/agent-api/GameRuntime.ts":
    "THE runtime input service. `createGameInput` owns keyboard state for a mounted Aura3D application: action mapping, buffering, combos, axes, pointer, gamepad, replay.",
  "packages/input/src/InputSystem.ts":
    "Standalone device layer for consumers that are NOT a mounted app. `packages/controls` (Orbit/Map/Drag/FirstPerson/Fly/PointerLock) and the camera-control apps consume `InputSnapshot` as a DATA TYPE rather than as a competing service. Verified by measurement: no file in packages/, apps/ or examples/ imports both this and game.input().",
  "packages/editor-runtime/src/StaticExportRuntime.ts":
    "An exported static build hosts a scene inside its own page shell, so its shortcut stream is separate from the hosted app's gameplay input.",
  "packages/editor-runtime/src/TimelineUI.ts":
    "Editor timeline scrubbing shortcuts. Editor chrome, not the hosted scene: the two must not share an action map or a spacebar would both play the timeline and jump the character.",
  "packages/create-aura3d/templates/character-controller/src/main.ts":
    "Scaffold template, shipped for a developer to copy and own. Deliberately plain listeners so the generated project is readable without first learning the input service.",
  "packages/create-aura3d/templates/animation-studio/studio/src/App.tsx":
    "As above: scaffold template source, owned by the developer once generated."
};

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const child = join(directory, entry);
    if (statSync(child).isDirectory()) walk(child, out);
    else if (/\.tsx?$/.test(entry)) out.push(child);
  }
  return out;
}

/**
 * Attaching a keyboard listener, i.e. claiming ownership of the keyboard stream.
 *
 * Two shapes, because a literal-only pattern misses the interesting case. `packages/input`'s `InputSystem`
 * attaches from a **table** of `[type, listener]` pairs, so `addEventListener("keydown"` never appears in
 * its source — my first version of this test therefore reported it as not attaching, and would have let a
 * new table-driven service in silently. A declared `"keydown"` string is the signal that survives both
 * spellings.
 */
const ATTACH_PATTERN = /addEventListener\(\s*["'`]key(?:down|up)["'`]|\[\s*["'`]key(?:down|up)["'`]\s*,/;

describe("input service ownership (WS-3.1)", () => {
  it("only enumerated owners attach a keyboard listener inside packages/", () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "packages"))) {
      const relative = file.slice(ROOT.length + 1);
      const source = readFileSync(file, "utf8");
      if (!ATTACH_PATTERN.test(source)) continue;
      if (LEGITIMATE_KEYBOARD_OWNERS[relative] === undefined) offenders.push(relative);
    }
    expect(
      offenders,
      "a new keyboard listener must be justified in LEGITIMATE_KEYBOARD_OWNERS, or routed through the runtime input service"
    ).toEqual([]);
  });

  it("every enumerated owner still exists and still attaches, so the list cannot rot", () => {
    /*
     * The inverse check, and the one that keeps an allowlist honest. Without it, entries survive after the
     * code moves and the list slowly becomes a record of what used to be true — which is how a governance
     * artifact turns into decoration.
     */
    for (const [relative, justification] of Object.entries(LEGITIMATE_KEYBOARD_OWNERS)) {
      const source = readFileSync(join(ROOT, relative), "utf8");
      expect(ATTACH_PATTERN.test(source), `${relative} no longer attaches a keyboard listener; remove its entry`).toBe(true);
      expect(justification.length, `${relative} needs a real justification`).toBeGreaterThan(40);
    }
  });

  it("no consumer wires both input services, which is what makes them non-duplicate", () => {
    /*
     * The measurement behind WS-3.1's decision. `packages/input` and `createGameInput` are not two
     * implementations of one capability competing for the same consumer — they serve disjoint sets:
     *
     *   createGameInput  -> game routes (turbo-drift, skyline-runner, orbital-defense, aura-clash)
     *   packages/input   -> packages/controls + camera-control apps, as a DATA TYPE (InputSnapshot)
     *
     * If a file ever imports both, they have started competing and the consolidation question reopens.
     */
    const both: string[] = [];
    for (const root of ["apps", "examples", "packages"]) {
      for (const file of walk(join(ROOT, root))) {
        const source = readFileSync(file, "utf8");
        const usesPackage = /from\s+["'`]@aura3d\/input["'`]/.test(source);
        const usesEngine = /\bgame\.input\(|createGameInput\(/.test(source);
        // GameRuntime defines the engine one; the engine barrel re-exports both. Neither is a consumer.
        if (file.endsWith("GameRuntime.ts") || file.endsWith("agent-api/index.ts")) continue;
        if (usesPackage && usesEngine) both.push(file.slice(ROOT.length + 1));
      }
    }
    expect(both, "a file using both input services means they now compete for the same consumer").toEqual([]);
  });
});
