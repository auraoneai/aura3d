import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectJudgeShots,
  lookJudgementFromPrism,
  lookJudgePrompt,
  runLookJudge,
  type PrismJudgeFn
} from "../../../../packages/aura3d-cli/src/look/judge";
import { AGENT_LOOK_CATEGORIES, validateLookJudgement } from "../../../../packages/aura3d-cli/src/look/rubric";

// GU47 WP-9 (E-I): `aura3d look judge --judge prism` wired to judgeWithPrism. Prism is never called: the provider is stubbed.

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SECRET = "sk-test-NEVER-PRINT-0123456789";

const record = (over: Record<string, unknown> = {}) => ({
  itemId: "aura-fc-3d",
  judge: { id: "prism" },
  scores: { lighting: 8.2, shadows: 6.3, composition: 9, ui_hud: 7, sound: 4 },
  observations: [{ category: "lighting", seen: "warm key from the left" }],
  dominantCauses: [{ cause: "flat shadows", percent: 60 }],
  competitiveWithModernThree: true,
  critique: "x".repeat(220),
  ...over
});

function io(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { cwd, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } };
}

const saved = { key: process.env.PRISM_API_KEY, file: process.env.PRISM_KEY_FILE, base: process.env.PRISM_BASE_URL };
beforeEach(() => {
  delete process.env.PRISM_API_KEY;
  delete process.env.PRISM_KEY_FILE;
  delete process.env.PRISM_BASE_URL;
});
afterEach(() => {
  for (const [name, value] of [["PRISM_API_KEY", saved.key], ["PRISM_KEY_FILE", saved.file], ["PRISM_BASE_URL", saved.base]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function workspace(shots: Record<string, Buffer>) {
  const cwd = mkdtempSync(join(tmpdir(), "look-prism-"));
  for (const [name, data] of Object.entries(shots)) writeFileSync(join(cwd, name), data);
  return cwd;
}

describe("look judge --judge prism (WP-9 E-I)", () => {
  it("loads the real C-32 provider and refuses to run without a key (no network)", async () => {
    const mod = await import("../../../../tools/quality-gate/src/judge-prism");
    expect(typeof mod.judgeWithPrism).toBe("function");
    const cwd = workspace({ "a.jpg": JPEG });
    const h = io(cwd);
    const code = await runLookJudge(["--judge", "prism", "--shots", "a.jpg"], h.io);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toMatch(/judge-unavailable: set PRISM_API_KEY or PRISM_KEY_FILE/);
  });

  it("exits 2 judge-unavailable when the provider cannot be loaded", async () => {
    const cwd = workspace({ "a.jpg": JPEG });
    const h = io(cwd);
    process.env.PRISM_API_KEY = SECRET;
    const code = await runLookJudge(["--judge", "prism", "--shots", "a.jpg"], h.io, { loadPrismJudge: async () => undefined });
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("judge-unavailable");
  });

  it("sends the JPEG frames and the 12-category prompt, writes a valid prism LookJudgement, keeps the key out of output", async () => {
    const cwd = workspace({ "shots-a.jpg": JPEG, "shots-b.jpeg": JPEG });
    const keyFile = join(cwd, "prism.key");
    writeFileSync(keyFile, `${SECRET}\n`);
    process.env.PRISM_KEY_FILE = keyFile;
    process.env.PRISM_BASE_URL = "https://prism.example.invalid";
    const calls: { packet: Parameters<PrismJudgeFn>[0]; opts: Parameters<PrismJudgeFn>[1]; keyDuringCall: string | undefined }[] = [];
    const stub: PrismJudgeFn = async (packet, opts) => {
      calls.push({ packet, opts, keyDuringCall: process.env.PRISM_API_KEY });
      return record();
    };
    const h = io(cwd);
    const code = await runLookJudge(
      ["--judge", "prism", "--shots", "shots-a.jpg,shots-b.jpeg", "--round", "2", "--genre", "racing", "--item", "aura-fc-3d", "--references", "ref-1,ref-2", "--out", "out/look-judgement.json"],
      h.io,
      { loadPrismJudge: async () => stub }
    );
    expect(h.err).toEqual([]);
    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.packet.kind).toBe("game");
    expect(call.packet.itemId).toBe("aura-fc-3d");
    expect(call.packet.images).toEqual([JPEG.toString("base64"), JPEG.toString("base64")]);
    for (const category of AGENT_LOOK_CATEGORIES) expect(call.packet.prompt).toContain(category);
    expect(call.packet.prompt).toContain('"itemId": "aura-fc-3d"');
    expect(call.opts).toEqual({ baseUrl: "https://prism.example.invalid", apiKeyEnv: "PRISM_API_KEY", model: "claude-opus-5.5" });
    expect(call.keyDuringCall).toBe(SECRET);
    expect(process.env.PRISM_API_KEY).toBeUndefined();

    const written = JSON.parse(readFileSync(join(cwd, "out/look-judgement.json"), "utf8"));
    expect(validateLookJudgement(written)).toEqual({ ok: true, errors: [] });
    expect(written.judge).toBe("prism");
    expect(written.round).toBe(2);
    expect(written.references).toEqual(["ref-1", "ref-2"]);
    expect(written.shots.map((s: { path: string }) => s.path)).toEqual(["shots-a.jpg", "shots-b.jpeg"]);
    expect(written.shots[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(written.scores).toEqual({ lighting: 8, shadows: 6.5, composition: 9, ui_hud: 7 });
    expect(written.nextChange.category).toBe("shadows");
    expect(written.observations.some((o: { category: string }) => o.category === "shadows")).toBe(true);
    const printed = [...h.out, ...h.err].join("\n");
    expect(printed).toContain("weakest category: shadows");
    expect(printed).not.toContain(SECRET);
    expect(readFileSync(join(cwd, "out/look-judgement.json"), "utf8")).not.toContain(SECRET);
  });

  it("redacts the key from a provider error and exits 1", async () => {
    const cwd = workspace({ "a.jpg": JPEG });
    process.env.PRISM_API_KEY = SECRET;
    const h = io(cwd);
    const code = await runLookJudge(["--judge", "prism", "--shots", "a.jpg"], h.io, {
      loadPrismJudge: async () => async () => { throw new Error(`HTTP 401 for key ${SECRET}`); }
    });
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("[redacted]");
    expect(h.err.join("\n")).not.toContain(SECRET);
  });

  it("rejects non-JPEG frames, more than 4 frames and a missing --shots", async () => {
    const cwd = workspace({ "a.png": PNG, "fake.jpg": PNG, "1.jpg": JPEG, "2.jpg": JPEG, "3.jpg": JPEG, "4.jpg": JPEG, "5.jpg": JPEG });
    expect(collectJudgeShots("a.png", cwd).error).toMatch(/not a JPEG/);
    expect(collectJudgeShots("fake.jpg", cwd).error).toMatch(/not a JPEG/);
    expect(collectJudgeShots("1.jpg,2.jpg,3.jpg,4.jpg,5.jpg", cwd).error).toMatch(/at most 4/);
    expect(collectJudgeShots("missing.jpg", cwd).error).toMatch(/not found/);
    expect(collectJudgeShots("1.jpg,2.jpg", cwd).files).toHaveLength(2);
    const h = io(cwd);
    expect(await runLookJudge(["--judge", "prism"], h.io)).toBe(2);
    expect(await runLookJudge(["--judge", "prism", "--shots", "1.jpg", "--genre", "nope"], h.io)).toBe(2);
    expect(await runLookJudge(["--judge", "robot", "--validate", "x.json"], h.io)).toBe(2);
  });

  it("maps a provider record onto the rubric: snaps to 0.5, drops non-rubric categories, adds observations below 7", () => {
    const judgement = lookJudgementFromPrism(record({ observations: "not an array", scores: { camera: 3.74, lighting: 12 } }), {
      round: 1,
      shots: [{ path: "a.jpg", sha256: "a".repeat(64) }]
    });
    expect(judgement.scores).toEqual({ camera: 3.5, lighting: 10 });
    expect(judgement.observations).toEqual([{ category: "camera", seen: `critique: ${"x".repeat(220)}` }]);
    expect(judgement.nextChange.category).toBe("camera");
    expect(validateLookJudgement(judgement).ok).toBe(true);
    expect(lookJudgePrompt({ itemId: "x", subject: "a racing game", shots: 1 })).toContain("1 screenshot of one browser 3D game (a racing game)");
  });
});
