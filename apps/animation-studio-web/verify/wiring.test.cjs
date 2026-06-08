/**
 * G2 wiring tests — exercise the REAL production modules (no copies).
 *
 * Loads the actual `src/state/backend.ts` (parseCliResult) and
 * `src/state/mapDocument.ts` (mapDocument) by transpiling them with esbuild
 * (TS → CJS, types erased — both modules are pure) and asserts:
 *   - parseCliResult maps a COMMITTED CLI result → modify ("~") diffs.
 *   - parseCliResult maps a REJECTED CLI result → delete ("!") error diffs.
 *   - mapDocument maps a sample runtime EpisodeDocument → the UI model
 *     (cast / shots / beats / camera / DUR), the same shape the panels read.
 *
 * Run:  node --test verify/wiring.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const esbuild = require("esbuild");
const Module = require("node:module");

const SRC = resolve(__dirname, "..", "src", "state");

/** Transpile a TS module to CJS and evaluate it in an isolated module scope. */
function loadTs(file) {
  const code = readFileSync(resolve(SRC, file), "utf8");
  const out = esbuild.transformSync(code, { loader: "ts", format: "cjs", target: "node20" }).code;
  const m = new Module(file, module);
  m._compile(out, resolve(SRC, file));
  return m.exports;
}

const { parseCliResult } = loadTs("backend.ts");
const { mapDocument } = loadTs("mapDocument.ts");

test("parseCliResult: committed result → modify diffs", () => {
  const res = { ok: true, rejected: false, output: "ok (warnings: 1)\n  warn: no characters yet", ms: 120, hash: "995" };
  const { diffs } = parseCliResult("camera --shot shot-1 --preset close-up", res);
  assert.ok(diffs.length >= 1, "expected at least one diff line");
  assert.ok(diffs.every((d) => d.op === "~" && d.k === "mod"), "committed diffs must be modify ops");
});

test("parseCliResult: committed 'ok' only → falls back to the command text", () => {
  const { diffs } = parseCliResult("camera --shot shot-1 --preset close-up", { ok: true, output: "ok" });
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].op, "~");
  assert.match(diffs[0].t, /camera --shot shot-1/);
});

test("parseCliResult: rejected result → delete (error) diffs", () => {
  const res = { ok: false, rejected: true, output: "usage: camera --shot <id> [--preset p] [--subject x,y,z]" };
  const { diffs } = parseCliResult("camera", res);
  assert.ok(diffs.length >= 1);
  assert.ok(diffs.every((d) => d.op === "!" && d.k === "del"), "rejected diffs must be delete/error ops");
  assert.match(diffs[0].t, /usage: camera/);
});

test("parseCliResult: rejected multi-line REJECTED block → one diff per reason", () => {
  const res = {
    ok: false,
    rejected: true,
    output: "REJECTED — edit would break the scene:\n - shot-9 does not exist\n - preset 'foo' is unknown"
  };
  const { diffs } = parseCliResult("camera --shot shot-9 --preset foo", res);
  assert.equal(diffs.length, 2);
  assert.ok(diffs.every((d) => d.op === "!"));
  assert.match(diffs[0].t, /shot-9 does not exist/);
  assert.match(diffs[1].t, /preset .*foo.* is unknown/);
});

test("mapDocument: sample EpisodeDocument → UI model", () => {
  const doc = {
    id: "scene",
    duration: 60,
    set: { clearColor: [0.01, 0.012, 0.03, 1] },
    assets: {
      characters: [{ id: "miko", role: "lead" }, { id: "luma" }],
      props: [{ id: "crystal" }, { id: "crystal" }]
    },
    shots: [
      { shotId: "shot-1", presetId: "establishing", startTime: 0, endTime: 20 },
      { shotId: "shot-2", presetId: "close-up", startTime: 20, endTime: 40 }
    ],
    dialogue: {
      language: "en",
      lines: [
        { lineId: "l1", speakerId: "miko", startTime: 1, endTime: 4, text: "Hello." },
        { lineId: "l2", speakerId: "luma", startTime: 21, endTime: 25, text: "Hi." }
      ]
    }
  };

  const ui = mapDocument(doc);

  // Title + duration
  assert.equal(ui.title, "Scene");
  assert.equal(ui.DUR, 60);

  // Shots → named by preset label, dur from [start,end)
  assert.equal(ui.shots.length, 2);
  assert.equal(ui.shots[0].id, "shot-1");
  assert.equal(ui.shots[0].name, "Establishing");
  assert.equal(ui.shots[0].dur, 20);
  assert.equal(ui.shots[1].name, "Close-up");
  // `who` is the set of speakers active in the shot window
  assert.deepEqual(ui.shots[0].who, ["miko"]);
  assert.deepEqual(ui.shots[1].who, ["luma"]);

  // Cast → capitalized name, glyph, line count
  assert.equal(ui.cast.length, 2);
  const miko = ui.cast.find((c) => c.id === "miko");
  assert.equal(miko.name, "Miko");
  assert.equal(miko.kind, "lead");
  assert.equal(miko.glyph, "M");
  assert.equal(miko.lines, 1);

  // Props deduped with a count
  assert.equal(ui.props.length, 1);
  assert.equal(ui.props[0].id, "crystal");
  assert.equal(ui.props[0].meta, "2×");

  // Sets: one entry since doc.set is present
  assert.equal(ui.sets.length, 1);

  // Beats mirror dialogue lines; mapped into the right shot
  assert.equal(ui.beats.length, 2);
  assert.equal(ui.beats[0].shot, "shot-1");
  assert.equal(ui.beats[1].shot, "shot-2");
  assert.equal(ui.beats[0].text, "Hello.");

  // Camera track: one span per shot
  assert.equal(ui.camera.length, 2);
  assert.equal(ui.camera[1].text, "Close-up");
});

test("mapDocument: empty-ish doc (no cast/dialogue) → empty collections, derived DUR", () => {
  const doc = {
    id: "scene",
    set: {},
    shots: [{ shotId: "shot-1", presetId: "medium", startTime: 0, endTime: 12 }]
  };
  const ui = mapDocument(doc);
  assert.equal(ui.cast.length, 0);
  assert.equal(ui.beats.length, 0);
  assert.equal(ui.shots.length, 1);
  assert.equal(ui.DUR, 12, "DUR derives from the max shot endTime when duration is absent");
});
