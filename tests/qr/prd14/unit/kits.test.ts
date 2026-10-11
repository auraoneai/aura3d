import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PRD-14 T3.2/T3.3 (row 14-KITS): every apps/showcase-kits/<Kn>/kit.json
 * validates against kit.schema.json, every staged file has an allow-listed
 * licence and a matching SHA-256, and no kit or file claims `accept` without a
 * recorded human reviewer and look-dev run id. K8 cues.json covers every
 * art/direction.ts audio[] cue at the -16 LUFS integrated target.
 */

const ROOT = process.cwd();
const KITS_DIR = resolve(ROOT, "apps/showcase-kits");
const KIT_IDS = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K9"] as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema = { [key: string]: Json };

interface LookDev {
  readonly runId: string | null;
  readonly reviewer: string | null;
  readonly verdict: string;
}
interface KitFile {
  readonly id: string;
  readonly path: string;
  readonly licence: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly lookdev: LookDev;
}
interface Kit {
  readonly kit: string;
  readonly lookdev: LookDev;
  readonly files: readonly KitFile[];
}
interface CueSample {
  readonly id: string;
  readonly path: string;
  readonly licence: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly provenance: string;
  readonly loudness: { readonly integratedLufs: number | null; readonly truePeakDbtp: number | null; readonly runId: string | null };
}
interface Cues {
  readonly kit: string;
  readonly loudness: { readonly targetIntegratedLufs: number; readonly tool: string; readonly measuredOn: string | null; readonly runId: string | null };
  readonly samples: readonly CueSample[];
  readonly cues: readonly { appDir: string; event: string; cue: string; variants: number; samples: string[]; status: string }[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (repoPath: string): string => createHash("sha256").update(readFileSync(resolve(ROOT, repoPath))).digest("hex");

const schema = readJson<Schema>(join(KITS_DIR, "kit.schema.json"));
const defs = schema.$defs as Record<string, Schema>;
const LICENCES = (defs.licence.enum as string[]).slice();
const VERDICTS = (defs.verdict.enum as string[]).slice();

function typeOf(value: Json): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/** Validates the JSON Schema subset kit.schema.json uses; returns error paths. */
function validate(value: Json, node: Schema, path = "$"): string[] {
  if (typeof node.$ref === "string") {
    const name = node.$ref.replace("#/$defs/", "");
    const target = defs[name];
    if (target === undefined) return [`${path}: unresolved $ref ${node.$ref}`];
    return validate(value, target, path);
  }
  const errors: string[] = [];
  const actual = typeOf(value);
  if (node.type !== undefined) {
    const allowed = Array.isArray(node.type) ? (node.type as string[]) : [node.type as string];
    const ok = allowed.includes(actual) || (actual === "integer" && allowed.includes("number"));
    if (!ok) return [`${path}: expected ${allowed.join("|")}, got ${actual}`];
  }
  if ("const" in node && value !== node.const) errors.push(`${path}: expected const ${JSON.stringify(node.const)}`);
  if (Array.isArray(node.enum) && !(node.enum as Json[]).includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (typeof value === "string") {
    if (typeof node.minLength === "number" && value.length < node.minLength) errors.push(`${path}: shorter than ${node.minLength}`);
    if (typeof node.pattern === "string" && !new RegExp(node.pattern).test(value)) errors.push(`${path}: does not match ${node.pattern}`);
  }
  if (typeof value === "number" && typeof node.minimum === "number" && value < node.minimum) errors.push(`${path}: below ${node.minimum}`);
  if (Array.isArray(value) && node.items !== undefined) {
    value.forEach((item, i) => errors.push(...validate(item, node.items as Schema, `${path}[${i}]`)));
  }
  if (actual === "object") {
    const obj = value as Record<string, Json>;
    const props = (node.properties ?? {}) as Record<string, Schema>;
    for (const key of (node.required ?? []) as string[]) if (!(key in obj)) errors.push(`${path}: missing ${key}`);
    for (const [key, child] of Object.entries(obj)) {
      if (props[key] !== undefined) errors.push(...validate(child, props[key], `${path}.${key}`));
      else if (node.additionalProperties === false) errors.push(`${path}: unexpected property ${key}`);
    }
  }
  return errors;
}

/** A verdict of `accept` is only real when a human reviewer and a look-dev run id are recorded. */
function acceptProblems(lookdev: LookDev, where: string): string[] {
  if (!VERDICTS.includes(lookdev.verdict)) return [`${where}: verdict ${lookdev.verdict} not in ${VERDICTS.join("|")}`];
  if (lookdev.verdict !== "accept") return [];
  const problems: string[] = [];
  if (typeof lookdev.reviewer !== "string" || lookdev.reviewer.trim() === "") problems.push(`${where}: accept without a human reviewer`);
  if (typeof lookdev.runId !== "string" || lookdev.runId.trim() === "") problems.push(`${where}: accept without a look-dev run id`);
  return problems;
}

function directionAudioCues(): { appDir: string; event: string; cue: string; variants: number }[] {
  const out: { appDir: string; event: string; cue: string; variants: number }[] = [];
  // The 18 rebuild games from games.json; each must carry art/direction.ts (a missing file throws).
  const games = readJson<{ games: { id: string; appDir?: string }[] }>(resolve(ROOT, "tools/quality-rebuild-capture/games.json")).games;
  for (const dir of games.map((g) => g.appDir ?? g.id).sort()) {
    const src = readFileSync(resolve(ROOT, "apps", dir, "art/direction.ts"), "utf8");
    for (const m of src.matchAll(/\{ event: "([^"]+)", cue: "([^"]+)", variants: (\d+)/g)) {
      out.push({ appDir: dir, event: m[1], cue: m[2], variants: Number(m[3]) });
    }
  }
  return out;
}

describe("showcase kits (PRD-14 T3.2)", () => {
  it("has exactly one kit.json per K1-K7 and K9 plus K8 cues.json", () => {
    const dirs = readdirSync(KITS_DIR).filter((n) => /^K\d$/.test(n) && statSync(join(KITS_DIR, n)).isDirectory()).sort();
    expect(dirs).toEqual(["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8", "K9"]);
    for (const id of KIT_IDS) expect(readJson<Kit>(join(KITS_DIR, id, "kit.json")).kit).toBe(id);
    expect(readJson<Cues>(join(KITS_DIR, "K8", "cues.json")).kit).toBe("K8");
  });

  for (const id of KIT_IDS) {
    describe(id, () => {
      const kit = readJson<Kit>(join(KITS_DIR, id, "kit.json"));

      it("validates against kit.schema.json", () => {
        expect(validate(kit as unknown as Json, schema)).toEqual([]);
      });

      it("records allowed verdicts and never an accept without reviewer and run id", () => {
        const problems = [
          ...acceptProblems(kit.lookdev, `${id}.lookdev`),
          ...kit.files.flatMap((f) => acceptProblems(f.lookdev, `${id}.files.${f.id}.lookdev`))
        ];
        if (kit.lookdev.verdict === "accept") {
          if (kit.files.length === 0) problems.push(`${id}: kit accept with no staged files`);
          for (const f of kit.files) if (f.lookdev.verdict !== "accept") problems.push(`${id}: kit accept but ${f.id} is ${f.lookdev.verdict}`);
        }
        expect(problems).toEqual([]);
      });

      it("stages every file with an allow-listed licence, matching bytes and SHA-256", () => {
        const ids = kit.files.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const f of kit.files) {
          expect(LICENCES, `${id}/${f.id} licence`).toContain(f.licence);
          expect(statSync(resolve(ROOT, f.path)).size, `${id}/${f.id} bytes`).toBe(f.bytes);
          expect(sha256(f.path), `${id}/${f.id} sha256`).toBe(f.sha256);
        }
      });
    });
  }
});

describe("showcase kits K8 cues (PRD-14 T3.3)", () => {
  const k8 = readJson<Cues>(join(KITS_DIR, "K8", "cues.json"));

  it("targets -16 LUFS integrated measured with ffmpeg ebur128, with run ids on any measured value", () => {
    expect(k8.loudness.targetIntegratedLufs).toBe(-16);
    expect(k8.loudness.tool).toBe("ffmpeg -af ebur128");
    const measured = k8.samples.filter((s) => s.loudness.integratedLufs !== null);
    if (measured.length > 0) expect(k8.loudness.runId, "measured loudness needs the remote run id").toMatch(/\S/);
    for (const s of measured) expect(s.loudness.runId, `${s.id} loudness run id`).toMatch(/\S/);
  });

  it("references licensed samples with provenance sample and matching SHA-256", () => {
    const ids = k8.samples.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of k8.samples) {
      expect(s.provenance, `${s.id} provenance`).toBe("sample");
      expect(LICENCES, `${s.id} licence`).toContain(s.licence);
      expect(statSync(resolve(ROOT, s.path)).size, `${s.id} bytes`).toBe(s.bytes);
      expect(sha256(s.path), `${s.id} sha256`).toBe(s.sha256);
    }
  });

  it("maps every art/direction.ts audio[] cue, and each mapped sample exists", () => {
    const declared = directionAudioCues();
    expect(declared.length).toBeGreaterThan(0);
    const key = (c: { appDir: string; event: string; cue: string }) => `${c.appDir}|${c.event}|${c.cue}`;
    expect(k8.cues.map(key).sort()).toEqual(declared.map(key).sort());
    const sampleIds = new Set(k8.samples.map((s) => s.id));
    for (const c of k8.cues) {
      const d = declared.find((x) => key(x) === key(c));
      expect(c.variants, `${key(c)} variants`).toBe(d?.variants);
      for (const s of c.samples) expect(sampleIds.has(s), `${key(c)} -> ${s}`).toBe(true);
      const expected = c.samples.length === 0 ? "unsourced" : c.samples.length >= c.variants ? "sourced" : "partial";
      expect(c.status, `${key(c)} status`).toBe(expected);
    }
  });
});
