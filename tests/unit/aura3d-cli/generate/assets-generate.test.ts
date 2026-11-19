import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { assetsGenerateVerb } from "../../../../packages/aura3d-cli/src/commands/generate/commands.js";
import { IDOL_IMAGE_MODEL, IDOL_MODEL, buildIdolPrompt, idolAdmitRole, idolRole } from "../../../../packages/aura3d-cli/src/commands/generate/idol.js";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/registry.js";
import { buildRiggedGlb, buildStaticGlb } from "../skin/rigged-fixture.js";
import { createFakeFal, fastFal } from "./fake-fal.js";

const KEY = "fal-sentinel-KEY-9f8e7d6c5b4a";
const dirs: string[] = [];
function tmp(prefix = "aura3d-gen-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
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

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d20000000049454e44ae426082", "hex");

function idolFal(options: { rigged?: boolean; polls?: number } = {}) {
  return createFakeFal({
    polls: options.polls ?? 1,
    results: {
      [IDOL_IMAGE_MODEL]: () => ({ images: [{ url: "https://cdn.test/ref.png" }] }),
      [IDOL_MODEL]: (input) => ({
        game_glb: { url: "https://cdn.test/game.glb" },
        mesh_stats: { num_vertices: 3, num_faces: 1 },
        ...(options.rigged ? { rigged_character_glb: { url: "https://cdn.test/rigged.glb" }, rig: { animations: ["Run"], ok: true } } : {}),
        echoedSeed: input.seed
      })
    },
    media: { "https://cdn.test/ref.png": PNG, "https://cdn.test/game.glb": buildStaticGlb(), "https://cdn.test/rigged.glb": buildRiggedGlb() }
  });
}

function runtime(fal: ReturnType<typeof createFakeFal>, home: string) {
  return { fal: { fetch: fal.fetch, ...fastFal }, env: { FAL_KEY: KEY }, home };
}

describe("assets generate: CLI surface", () => {
  test("is registered, --help prints usage and writes nothing", async () => {
    const project = tmp();
    const command = cliCommandFor("assets generate");
    expect(command?.usage).toContain("--provider idol");
    const cap = capture(project);
    expect(await command!.run(["--help"], cap.io)).toBe(0);
    expect(cap.out.join("\n")).toMatch(/aura3d assets generate "<prompt>" --name key/);
    expect(readdirSync(project)).toEqual([]);
  });

  test("usage errors exit 2 and name the fix", async () => {
    const project = tmp();
    const cases: [string[], RegExp][] = [
      [["a robot"], /--name <key> is required/],
      [["--name", "bot"], /give a prompt or --image/],
      [["a robot", "--name", "bot", "--size", "tall"], /--size must be height=N/],
      [["a robot", "--name", "bot", "--front", "up"], /--front must be/],
      [["a robot", "--name", "bot", "--role", "boss"], /--role must be one of/],
      [["a robot", "--name", "bot", "--animations", "idle"], /--animations needs --rig/],
      [["a robot", "--name", "bot", "--provider", "tripo"], /--provider tripo is not supported/],
      [["a robot", "--name", "bot", "--bogus"], /unknown flag --bogus/]
    ];
    for (const [argv, message] of cases) {
      const cap = capture(project);
      expect(await assetsGenerateVerb(argv, cap.io, { env: {} })).toBe(2);
      expect(cap.err.join("\n")).toMatch(message);
    }
    expect(readdirSync(project)).toEqual([]);
  });

  test("--provider meshy only points at the existing Meshy flow", async () => {
    const cap = capture(tmp());
    expect(await assetsGenerateVerb(["a lamp", "--name", "lamp", "--provider", "meshy"], cap.io, { env: {} })).toBe(2);
    expect(cap.err.join("\n")).toMatch(/assets resolve .*--allow meshy/);
    expect(cap.err.join("\n")).toMatch(/assets import-meshy/);
  });

  test("--dry-run prints the cost estimate, makes no call and needs no key", async () => {
    const project = tmp();
    const home = tmp();
    const fal = idolFal();
    const cap = capture(project);
    expect(await assetsGenerateVerb(["a rusty robot", "--name", "bot", "--rig", "--dry-run", "--json"], cap.io, { fal: { fetch: fal.fetch, ...fastFal }, env: {}, home })).toBe(0);
    const report = JSON.parse(cap.out.join("\n"));
    expect(report).toMatchObject({ ok: true, dryRun: true, estUsd: 0.42, results: [{ key: "bot", dryRun: true, rig: true, role: "character", estUsd: 0.42 }] });
    expect(report.keyHint).toMatch(/FAL_KEY/);
    expect(fal.calls).toHaveLength(0);
    expect(existsSync(join(project, ".aura3d"))).toBe(false);
    // --image skips the paid reference still.
    writeFileSync(join(project, "ref.png"), PNG);
    const image = capture(project);
    expect(await assetsGenerateVerb(["--image", "ref.png", "--name", "crate", "--dry-run"], image.io, { env: { FAL_KEY: KEY }, home })).toBe(0);
    expect(image.out.join("\n")).toMatch(/est\. \$0\.20/);
    expect(image.out.join("\n")).toMatch(/fal key: found \(env:FAL_KEY\)/);
    expect(image.all()).not.toContain(KEY);
  });

  test("spec dry run totals every item and honours --only", async () => {
    const project = tmp();
    writeFileSync(join(project, "spec.json"), JSON.stringify({ game: "demo", outDir: "assets/idol", items: [
      { key: "palm", subject: "a palm tree", role: "background" },
      { key: "hero", subject: "a hero", rig: true },
      { key: "car", subject: "a car", kind: "vehicle" }
    ] }));
    const cap = capture(project);
    expect(await assetsGenerateVerb(["--spec", "spec.json", "--dry-run", "--json"], cap.io, { env: {} })).toBe(0);
    expect(JSON.parse(cap.out.join("\n")).estUsd).toBe(1.16);
    const only = capture(project);
    expect(await assetsGenerateVerb(["--spec", "spec.json", "--only", "car", "--dry-run", "--json"], only.io, { env: {} })).toBe(0);
    expect(JSON.parse(only.out.join("\n")).results).toEqual([expect.objectContaining({ key: "car", role: "vehicle", estUsd: 0.37 })]);
    const unknown = capture(project);
    expect(await assetsGenerateVerb(["--spec", "spec.json", "--only", "nope", "--dry-run"], unknown.io, { env: {} })).toBe(1);
    expect(unknown.err.join("\n")).toMatch(/--only: nope not in the spec/);
  });

  test("prompt template and role mapping match the proven tools/idol lane", () => {
    expect(buildIdolPrompt({ key: "a", subject: "A red crate" })).toMatch(/^A red crate\. Photoreal studio render.*Single isolated object.*No text, no logos/);
    expect(buildIdolPrompt({ key: "a", subject: "A knight", rig: true })).toMatch(/T-pose/);
    expect(buildIdolPrompt({ key: "a", prompt: "verbatim" })).toBe("verbatim");
    expect(idolRole({ key: "a", rig: true })).toBe("character");
    expect(idolRole({ key: "a", kind: "vehicle" })).toBe("vehicle");
    expect(idolRole({ key: "a" })).toBe("prop");
    expect(idolAdmitRole("background")).toBe("set-dressing");
  });
});

describe("assets generate: mocked fal end to end", () => {
  test("prompt → reference still → Idol → optimise/normalise/slim/preview → .idol.json → admitted as candidate; key never printed", async () => {
    const project = tmp();
    const home = tmp();
    const fal = idolFal({ polls: 2 });
    const cap = capture(project);
    const code = await assetsGenerateVerb(["a weathered wooden crate", "--name", "crate", "--size", "height=1", "--front", "+z", "--seed", "11", "--json"], cap.io, runtime(fal, home));
    expect(cap.err.join("\n")).toBe("");
    expect(code).toBe(0);
    const report = JSON.parse(cap.out.join("\n"));
    expect(report).toMatchObject({ ok: true, command: "assets generate", usd: 0.37, ledger: ".aura3d/fal/ledger.jsonl" });
    const row = report.results[0];
    expect(row).toMatchObject({ key: "crate", finalGlb: "assets/idol/crate.glb", provenance: "assets/idol/crate.idol.json", usd: 0.37, admitted: { ok: true, id: "crate", quality: "candidate" } });
    expect(row.dims[1]).toBeCloseTo(1, 3);
    expect(row.preview).toMatch(/\.aura3d\/fal\/.+\/crate\/views\.png$/);

    // Two paid submits, both ledgered at submit time, in the user project.
    expect(fal.posts().map((call) => call.url)).toEqual([`https://queue.fal.run/${IDOL_IMAGE_MODEL}`, `https://queue.fal.run/${IDOL_MODEL}`]);
    const idolInput = JSON.parse(fal.posts()[1]!.body!);
    expect(idolInput).toMatchObject({ enable_pbr: true, image_type: "synthetic", seed: 11, mesh_resolution: 1024 });
    expect(String(idolInput.image_url)).toMatch(/^data:image\/png;base64,/);
    const ledger = readFileSync(join(project, ".aura3d/fal/ledger.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(ledger).toEqual([
      expect.objectContaining({ key: "crate", model: IDOL_IMAGE_MODEL, usd: 0.17, status: "submitted", requestId: "req-1" }),
      expect.objectContaining({ key: "crate", model: IDOL_MODEL, usd: 0.2, status: "submitted", requestId: "req-2" })
    ]);

    // Provenance.
    const prov = JSON.parse(readFileSync(join(project, "assets/idol/crate.idol.json"), "utf8"));
    expect(prov).toMatchObject({ schema: "aura3d.idol-provenance/1", key: "crate", role: "prop", admitRole: "prop", rig: false, usd: 0.37, generator: "aura3d assets generate" });
    expect(prov.steps.map((step: { step: string }) => step.step)).toEqual(["reference", "idol"]);
    expect(prov.steps[1]).toMatchObject({ model: IDOL_MODEL, requestId: "req-2", input: { image_url: "(reference still)" } });
    expect(prov.settings).toMatchObject({ size: { height: 1 }, front: "+z", seed: 11 });

    // In-process admission: candidate, fal licence, provenance evidence and generation record.
    const manifest = JSON.parse(readFileSync(join(project, "aura.assets.json"), "utf8"));
    const entry = manifest.assets.find((asset: { id: string }) => asset.id === "crate");
    expect(entry).toMatchObject({ type: "model", role: "prop", quality: "candidate" });
    expect(["candidate", "prototype", "ungraded"]).toContain(entry.quality);
    expect(entry.provenance).toMatchObject({ license: "LicenseRef-fal-idol-generated", sourceFamily: "idol", evidence: ["assets/idol/crate.idol.json"], generation: { provider: "fal", model: IDOL_MODEL, taskId: "req-2", operation: "image-to-3d" } });
    expect(existsSync(join(project, "src/aura-assets.ts"))).toBe(true);
    expect(existsSync(join(project, ".aura3d/fal/.admit.lock"))).toBe(false);

    // The key appears nowhere: not in output, not in any file the run wrote.
    expect(cap.all()).not.toContain(KEY);
    for (const file of walk(project)) expect(readFileSync(file).includes(KEY), file).toBe(false);

    // A rerun skips the existing asset without any call.
    const again = idolFal();
    const skip = capture(project);
    expect(await assetsGenerateVerb(["a weathered wooden crate", "--name", "crate"], skip.io, runtime(again, home))).toBe(0);
    expect(again.calls).toHaveLength(0);
    expect(skip.out.join("\n")).toMatch(/exists at assets\/idol\/crate\.glb/);

    // --renormalize redoes post-processing from the raw downloads for $0 (no fal call at all), keeping the stored settings.
    const offline = createFakeFal({ results: {} });
    const renorm = capture(project);
    expect(await assetsGenerateVerb(["--name", "crate", "--renormalize", "--size", "height=2", "--json"], renorm.io, { fal: { fetch: offline.fetch, ...fastFal }, env: {}, home })).toBe(0);
    expect(offline.calls).toHaveLength(0);
    const renormReport = JSON.parse(renorm.out.join("\n"));
    expect(renormReport.results[0]).toMatchObject({ key: "crate", renormalized: true, usd: 0, admitted: { ok: true, quality: "candidate" } });
    expect(renormReport.results[0].dims[1]).toBeCloseTo(2, 3);
    expect(readFileSync(join(project, ".aura3d/fal/ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
    const renormProv = JSON.parse(readFileSync(join(project, "assets/idol/crate.idol.json"), "utf8"));
    expect(renormProv.settings).toMatchObject({ size: { height: 2 }, front: "+z", seed: 11 });
    expect(renormProv.renormalizedAt).toBeTruthy();
  }, 60_000);

  test("--image skips the paid still; rigs are refit, never simplified and keep scale 1 with sceneScale in provenance", async () => {
    const project = tmp();
    const home = tmp();
    mkdirSync(join(project, "refs"));
    writeFileSync(join(project, "refs/knight.png"), PNG);
    const fal = idolFal({ rigged: true });
    const normalizeCalls: { keepScale?: boolean; front?: string }[] = [];
    const cap = capture(project);
    const code = await assetsGenerateVerb(["--image", "refs/knight.png", "--name", "knight", "--game", "g", "--rig", "--animations", "Run", "--size", "height=1.8", "--no-admit", "--json"], cap.io, {
      ...runtime(fal, home),
      deps: {
        normalizeGlb: async (input, output, opts) => {
          normalizeCalls.push({ keepScale: opts.keepScale, front: String(opts.front) });
          const { normalizeGlb } = await import("../../../../packages/aura3d-cli/src/commands/asset-post/index.js");
          return normalizeGlb(input, output, opts);
        }
      }
    });
    expect(cap.err.join("\n")).toBe("");
    expect(code).toBe(0);
    const row = JSON.parse(cap.out.join("\n")).results[0];
    expect(row).toMatchObject({ key: "knight", finalGlb: "assets/idol/knight.glb", usd: 0.25 });
    expect(row.skin).toMatch(/pass|FAIL/);
    expect(row.admitted).toBeUndefined();
    expect(fal.posts().map((call) => call.url)).toEqual([`https://queue.fal.run/${IDOL_MODEL}`]);
    expect(JSON.parse(fal.posts()[0]!.body!)).toMatchObject({ rig: true, animations: ["Run"] });
    expect(normalizeCalls).toEqual([{ keepScale: true, front: "+x" }]);
    const prov = JSON.parse(readFileSync(join(project, "assets/idol/knight.idol.json"), "utf8"));
    expect(prov).toMatchObject({ rig: true, role: "character", steps: [{ step: "reference", source: "refs/knight.png" }, { step: "idol", input: { image_url: "(local image)" } }] });
    expect(prov.normalized.scale).toBe(1);
    expect(prov.normalized.sceneScale).toBeGreaterThan(0);
    expect(prov.skin).toHaveProperty("report");
    expect(existsSync(join(project, "aura.assets.json"))).toBe(false);
    expect(statSync(join(project, ".aura3d/fal/g/knight/rigged.glb")).size).toBeGreaterThan(0);
  }, 60_000);

  test("a crash after the Idol submit resumes the pending request on rerun without paying again", async () => {
    const project = tmp();
    const home = tmp();
    writeFileSync(join(project, "ref.png"), PNG);
    const first = createFakeFal({ stuck: true, results: {} });
    const cap = capture(project);
    const code = await assetsGenerateVerb(["--image", "ref.png", "--name", "lamp", "--game", "g", "--no-admit"], cap.io, { fal: { fetch: first.fetch, ...fastFal, timeoutMs: 0 }, env: { FAL_KEY: KEY }, home });
    expect(code).toBe(1);
    expect(cap.out.join("\n")).toMatch(/rerun the same command to resume/);
    expect(existsSync(join(project, ".aura3d/fal/g/lamp/pending-idol.json"))).toBe(true);
    const later = idolFal();
    later.seed(IDOL_MODEL, "req-1", {}, 0);
    const rerun = capture(project);
    expect(await assetsGenerateVerb(["--image", "ref.png", "--name", "lamp", "--game", "g", "--no-admit"], rerun.io, runtime(later, home))).toBe(0);
    expect(later.posts()).toHaveLength(0);
    expect(readFileSync(join(project, ".aura3d/fal/ledger.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
    expect(existsSync(join(project, "assets/idol/lamp.glb"))).toBe(true);
    expect(cap.all() + rerun.all()).not.toContain(KEY);
  }, 60_000);
});
