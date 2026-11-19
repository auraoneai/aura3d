import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { animationGenerateVerb, retargetClips } from "../../../../packages/aura3d-cli/src/commands/generate/commands.js";
import type { GenerateDeps } from "../../../../packages/aura3d-cli/src/commands/generate/deps.js";
import { MOTION_MODEL } from "../../../../packages/aura3d-cli/src/commands/generate/motion.js";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/registry.js";
import { buildRiggedGlb } from "../skin/rigged-fixture.js";
import { createFakeFal, fastFal } from "./fake-fal.js";

const KEY = "fal-sentinel-MOTION-a1b2c3d4e5f6";
const dirs: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "aura3d-motion-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function capture(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { cwd, stdout: (line: string) => out.push(line), stderr: (line: string) => err.push(line) }, out, err, all: () => [...out, ...err].join("\n") };
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
}

const MOTION_DICT = JSON.stringify({ fps: 30, rot6d: [[[1, 0, 0, 1, 0, 0]]], transl: [[0, 0.9, 0]] });

function motionFal(options: { stuck?: boolean; submitFailures?: { status: number; count: number } } = {}) {
  return createFakeFal({
    ...options,
    results: {
      [MOTION_MODEL]: (input, id) => (input.output_format === "fbx" ? { fbx_file: { url: `https://cdn.test/${id}.fbx` } } : { motion_json: { url: `https://cdn.test/${id}.json` } })
    },
    media: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [[`https://cdn.test/req-${i + 1}.json`, MOTION_DICT], [`https://cdn.test/req-${i + 1}.fbx`, "FBX"]]).flat())
  });
}

function recordingImport() {
  const calls: Parameters<GenerateDeps["importClipsOntoRig"]>[0][] = [];
  const importClipsOntoRig: GenerateDeps["importClipsOntoRig"] = async (opts) => {
    calls.push(opts);
    writeFileSync(join(opts.projectDir ?? ".", opts.output), "glb");
    return { ok: true, output: opts.output, clips: opts.clips.map((clip) => ({ name: clip.name ?? "?", duration: 2, channels: 66 })), failures: [], warnings: [] };
  };
  return { calls, importClipsOntoRig };
}

function project(): string {
  const dir = tmp();
  writeFileSync(join(dir, "rig.glb"), buildRiggedGlb());
  return dir;
}

describe("animation generate: CLI surface", () => {
  test("is registered; --help prints usage and writes nothing", async () => {
    const dir = tmp();
    const command = cliCommandFor("animation generate");
    expect(command?.usage).toContain("--onto rigged.glb --out hero.glb");
    const cap = capture(dir);
    expect(await command!.run(["--help"], cap.io)).toBe(0);
    expect(cap.out.join("\n")).toMatch(/fal-ai\/hunyuan-motion, \$0\.08 per clip/);
    expect(readdirSync(dir)).toEqual([]);
  });

  test("usage errors exit 2", async () => {
    const dir = project();
    const cases: [string[], RegExp][] = [
      [[], /give a prompt/],
      [["a person runs"], /--onto rigged\.glb and --out hero\.glb are required/],
      [["a person runs", "--onto", "rig.glb", "--out", "o.glb", "--duration", "30"], /--duration got "30"/],
      [["a person runs", "--onto", "rig.glb", "--out", "o.glb", "--guidance", "0"], /--guidance got "0"/],
      [["a person runs", "--onto", "rig.glb", "--out", "o.glb", "--window", "2,1"], /--window must be a,b/],
      [["a", "person", "--onto", "rig.glb", "--out", "o.glb"], /quote the prompt/]
    ];
    for (const [argv, message] of cases) {
      const cap = capture(dir);
      expect(await animationGenerateVerb(argv, cap.io, { env: {} })).toBe(2);
      expect(cap.err.join("\n")).toMatch(message);
    }
    expect(existsSync(join(dir, ".aura3d"))).toBe(false);
  });

  test("--dry-run prices clips (and --fbx) without any call or key", async () => {
    const dir = project();
    writeFileSync(join(dir, "motion.json"), JSON.stringify({ game: "demo", clips: [
      { key: "Run", prompt: "A person runs forward.", duration: 2, loop: true },
      { key: "Jump", prompt: "A person jumps up.", duration: 1.5 },
      { key: "Wave", prompt: "A person waves.", duration: 3 }
    ] }));
    const fal = motionFal();
    const cap = capture(dir);
    expect(await animationGenerateVerb(["--spec", "motion.json", "--fbx", "--dry-run", "--json"], cap.io, { fal: { fetch: fal.fetch, ...fastFal }, env: {}, home: tmp() })).toBe(0);
    const report = JSON.parse(cap.out.join("\n"));
    expect(report).toMatchObject({ ok: true, dryRun: true, estUsd: 0.48 });
    expect(report.keyHint).toMatch(/FAL_KEY/);
    expect(fal.calls).toHaveLength(0);
    expect(existsSync(join(dir, ".aura3d"))).toBe(false);
  });
});

describe("animation generate: mocked fal", () => {
  test("submit → pending → (timeout) → resume → complete → retarget, paying once; key never printed", async () => {
    const dir = project();
    const home = tmp();
    const argv = ["A person sprints forward, arms pumping.", "--onto", "rig.glb", "--out", "hero.glb", "--name", "Sprint", "--duration", "2", "--seed", "3", "--loop", "--window", "0.2,1.9", "--game", "demo"];
    const stuck = motionFal({ stuck: true });
    const first = capture(dir);
    const imports = recordingImport();
    expect(await animationGenerateVerb(argv, first.io, { fal: { fetch: stuck.fetch, ...fastFal, timeoutMs: 0 }, env: { FAL_KEY: KEY }, home, deps: imports })).toBe(1);
    expect(first.out.join("\n")).toMatch(/Sprint: FAILED .*rerun the same command to resume/);
    const work = join(dir, ".aura3d/fal/motion/demo/Sprint");
    expect(JSON.parse(readFileSync(join(work, "pending-dict.json"), "utf8"))).toMatchObject({ request_id: "req-1", model: MOTION_MODEL });
    expect(JSON.parse(stuck.posts()[0]!.body!)).toEqual({ prompt: "A person sprints forward, arms pumping.", duration: 2, guidance_scale: 5, seed: 3, output_format: "dict" });
    expect(imports.calls).toHaveLength(0);

    const later = motionFal();
    later.seed(MOTION_MODEL, "req-1", {}, 0);
    const second = capture(dir);
    expect(await animationGenerateVerb([...argv, "--json"], second.io, { fal: { fetch: later.fetch, ...fastFal }, env: { FAL_KEY: KEY }, home, deps: imports })).toBe(0);
    expect(later.posts()).toHaveLength(0);
    const report = JSON.parse(second.out.join("\n"));
    expect(report).toMatchObject({ ok: true, usd: 0, output: "hero.glb", imported: [{ name: "Sprint", channels: 66 }] });
    expect(readFileSync(join(work, "motion.json"), "utf8")).toBe(MOTION_DICT);
    expect(existsSync(join(work, "pending-dict.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(work, "provenance.json"), "utf8"))).toMatchObject({ schema: "aura3d.idol-motion-provenance/1", model: MOTION_MODEL, requestId: "req-1" });
    const ledger = readFileSync(join(dir, ".aura3d/fal/ledger.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(ledger).toEqual([expect.objectContaining({ game: "demo", key: "Sprint", model: MOTION_MODEL, usd: 0.08, requestId: "req-1", status: "submitted" })]);

    // generate → import wiring.
    expect(imports.calls).toEqual([expect.objectContaining({ projectDir: dir, onto: "rig.glb", output: "hero.glb", loop: true, window: [0.2, 1.9], keepBaseAnimations: false, clips: [{ name: "Sprint", file: join(work, "motion.json") }] })]);

    // A third run reuses motion.json for $0 with no call.
    const offline = motionFal();
    const third = capture(dir);
    expect(await animationGenerateVerb(argv, third.io, { fal: { fetch: offline.fetch, ...fastFal }, env: { FAL_KEY: KEY }, home, deps: recordingImport() })).toBe(0);
    expect(offline.calls).toHaveLength(0);
    expect(third.out.join("\n")).toMatch(/Sprint: reused/);

    expect(first.all() + second.all() + third.all()).not.toContain(KEY);
    for (const file of walk(dir)) expect(readFileSync(file).includes(KEY), file).toBe(false);
  });

  test("429 on submit backs off and retries; --fbx adds a second ledgered request", async () => {
    const dir = project();
    const fal = motionFal({ submitFailures: { status: 429, count: 2 } });
    const imports = recordingImport();
    const cap = capture(dir);
    expect(await animationGenerateVerb(["A person jumps.", "--onto", "rig.glb", "--out", "hero.glb", "--name", "Jump", "--fbx", "--game", "g"], cap.io, { fal: { fetch: fal.fetch, ...fastFal }, env: { FAL_KEY: KEY }, home: tmp(), deps: imports })).toBe(0);
    expect(fal.posts()).toHaveLength(4);
    expect(existsSync(join(dir, ".aura3d/fal/motion/g/Jump/motion.fbx"))).toBe(true);
    const ledger = readFileSync(join(dir, ".aura3d/fal/ledger.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(ledger.map((line) => line.key)).toEqual(["Jump", "Jump:fbx"]);
    expect(cap.out.join("\n")).toMatch(/\$0\.16 this run/);
  });

  test("a fal error that echoes the key is redacted from output, files and the exit message", async () => {
    const dir = project();
    const fal = createFakeFal({ results: {}, submitFailures: { status: 400, count: 1, body: `{"detail":"Authorization Key ${KEY} rejected"}` } } as never);
    const cap = capture(dir);
    expect(await animationGenerateVerb(["A person waves.", "--onto", "rig.glb", "--out", "hero.glb"], cap.io, { fal: { fetch: fal.fetch, ...fastFal }, env: { FAL_KEY: KEY }, home: tmp(), deps: recordingImport() })).toBe(1);
    expect(cap.all()).toContain("[redacted]");
    expect(cap.all()).not.toContain(KEY);
    for (const file of walk(dir)) expect(readFileSync(file).includes(KEY), file).toBe(false);
  });

  test("spec clips with different loop/window/turn settings retarget in groups onto one output", async () => {
    const imports = recordingImport();
    const dir = project();
    const result = await retargetClips(imports, {
      projectDir: dir, onto: "rig.glb", out: "hero.glb", keepBaseAnimations: false,
      clips: [
        { clip: { key: "Run", prompt: "run", loop: true }, file: "a.json" },
        { clip: { key: "Walk", prompt: "walk", loop: true }, file: "b.json" },
        { clip: { key: "Spin", prompt: "spin", faceForward: false }, file: "c.json" }
      ]
    });
    expect(result).toMatchObject({ ok: true, output: "hero.glb", clips: [{ name: "Run" }, { name: "Walk" }, { name: "Spin" }] });
    expect(imports.calls.map((call) => ({ onto: call.onto, clips: call.clips.map((clip) => clip.name), loop: call.loop, faceForward: call.faceForward, keep: call.keepBaseAnimations }))).toEqual([
      { onto: "rig.glb", clips: ["Run", "Walk"], loop: true, faceForward: undefined, keep: false },
      { onto: "hero.glb", clips: ["Spin"], loop: undefined, faceForward: false, keep: true }
    ]);
  });
});
