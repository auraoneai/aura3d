// Source + runtime readiness gate for T2.2 Animation-event tracks. Confirms the event-track
// container exists on top of the existing dispatcher/sampler, the editor authoring controller
// serializes to the canonical shape, the Aura Clash arena derives hitbox windows from authored clip
// events (windows match the move frame data exactly => replay-stable), and everything is wired +
// exported. Run via tsx + tsconfig.base (path-maps @aura3d/* to src). Exits non-zero on failure.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createAnimationEventTracks,
  deserializeAnimationEventTracks,
  sampleClipEvents
} from "../../packages/animation/src";
import { createEventTrackEditor } from "../../packages/editor-runtime/src";
import {
  auraClashHitWindowFromTracks,
  auraClashMoveEventTracks,
  auraClashMoveTable
} from "../../apps/aura-clash-showcase/src/playable/combat/auraClashMoveData";

interface Check {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}
const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}
function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

// 1. Files present.
const requiredFiles = [
  "packages/animation/src/AnimationClipEvents.ts",
  "packages/editor-runtime/src/EventTrackEditor.ts",
  "apps/aura-clash-showcase/src/playable/combat/auraClashMoveData.ts",
  "tests/unit/animation/animation-event-tracks.test.ts",
  "tests/browser/animation-studio-editor-harness.ts"
] as const;
const missing = requiredFiles.filter((f) => !existsSync(resolve(f)));
check("required-files-present", missing.length === 0, missing.join(", ") || "all event-track files exist");

// 2. Container: add/move/delete + active windows.
const tracks = createAnimationEventTracks("heavy", 0.46);
const hitId = tracks.addMarker("hitbox", 0.1, { type: "hitbox", duration: 0.28 });
tracks.addMarker("footstep", 0.05, { type: "footstep" });
tracks.moveMarker("hitbox", hitId, 0.12);
const windowOpensCloses = !tracks.isActive("hitbox", 0.05) && tracks.isActive("hitbox", 0.2) && !tracks.isActive("hitbox", 0.45);
tracks.removeMarker("footstep", tracks.track("footstep")!.markers[0]!.id!);
check("container-author-and-windows", windowOpensCloses && tracks.markerCount() === 1, `windowOpensCloses=${windowOpensCloses}, markers=${tracks.markerCount()}`);

// 3. Sampler: markers fire once per forward pass and respect direction.
const seq = createAnimationEventTracks("clip", 1);
seq.addMarker("m", 0.2);
seq.addMarker("m", 0.8);
const source = seq.toEventSource();
const forward = sampleClipEvents({ ...source, id: "clip" }, { from: 0, to: 1 }).map((f) => f.event.time);
const reverse = sampleClipEvents({ ...source, id: "clip" }, { from: 1, to: 0, direction: -1 }).map((f) => f.event.time);
check("sampler-once-and-direction", JSON.stringify(forward) === "[0.2,0.8]" && JSON.stringify(reverse) === "[0.8,0.2]", `forward=${forward}, reverse=${reverse}`);

// 4. Editor authoring serializes to the canonical shape (round-trips through the deserializer).
const editor = createEventTrackEditor({ clipId: "light", duration: 0.34 });
editor.addMarker("hitbox", 0.07, { type: "hitbox", duration: 0.2 });
const serialized = editor.serialize();
const restored = deserializeAnimationEventTracks(serialized);
check("editor-serialize-roundtrip", serialized.schema === "animation-event-tracks/v1" && restored.isActive("hitbox", 0.12), `schema=${serialized.schema}`);

// 5. Arena: hitbox windows derived from authored clip events EXACTLY match the move frame data
// (so deriving from events leaves the deterministic replay checksum unchanged).
let windowsMatch = true;
const detail: string[] = [];
for (const id of ["light", "heavy", "special"] as const) {
  const derived = auraClashHitWindowFromTracks(auraClashMoveEventTracks[id]);
  const move = auraClashMoveTable[id];
  const ok = Math.abs(derived.activeStart - move.activeStart) < 1e-9 && Math.abs(derived.activeEnd - move.activeEnd) < 1e-9;
  if (!ok) windowsMatch = false;
  detail.push(`${id}:${ok}`);
}
check("arena-windows-match-frame-data", windowsMatch, detail.join(", "));

// 6. Source wiring.
const clipEventsSrc = read("packages/animation/src/AnimationClipEvents.ts");
check("container-on-existing-infra", clipEventsSrc.includes("AnimationEventTrackContainer") && clipEventsSrc.includes("sampleClipEvents") && clipEventsSrc.includes("AnimationEventDispatcher"), "event-track container added on top of the existing dispatcher/sampler");

const editorIndexSrc = read("packages/editor-runtime/src/index.ts");
check("editor-exports-authoring", editorIndexSrc.includes("EventTrackEditor"), "editor-runtime exports EventTrackEditor");

const arenaSrc = read("apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts");
check("arena-event-driven-hitbox", arenaSrc.includes("auraClashHitWindowFromTracks") && arenaSrc.includes("moveEventTracks") && arenaSrc.includes("__AURA_CLASH_EVENT_TRACKS_PROOF__"), "arena derives hitbox window from authored clip events");

const harnessSrc = read("tests/browser/animation-studio-editor-harness.ts");
check("editor-harness-event-lane", harnessSrc.includes("EventTrackEditor") && harnessSrc.includes("__EVENT_TRACK_PROOF__"), "editor harness has an event-track lane + proof");

const moveDataSrc = read("apps/aura-clash-showcase/src/playable/combat/auraClashMoveData.ts");
check("move-data-event-tracks", moveDataSrc.includes("createAuraClashMoveEventTracks") && moveDataSrc.includes("hitbox") && moveDataSrc.includes("footstep") && moveDataSrc.includes("vfx"), "move data carries hitbox/footstep/vfx event tracks");

const pass = checks.every((c) => c.pass);
const report = { schema: "animation-event-track-readiness/v1", generatedAt: new Date().toISOString(), pass, checks };
const reportPath = resolve("tests/reports/animation-engine/event-track-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(checks.filter((c) => !c.pass).map((c) => `FAIL ${c.name}: ${c.detail}`).join("\n"));
  process.exit(1);
}
console.log(`animation-engine event-track readiness: OK (${checks.length} checks passed)`);
