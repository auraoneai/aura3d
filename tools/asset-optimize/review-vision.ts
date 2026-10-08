/**
 * PRD-05 §6.7 C-32 — `assets review` vision-model helper.
 *
 * Scores a look-dev capture against the three-adapter reference with the
 * C-32 `judgeWithPrism` provider (tools/quality-gate/src/judge-prism.ts).
 * Per the contract: two judging runs, the recorded score is the mean, and
 * a run disagreement > 1.5 routes the asset to a human review instead of
 * emitting a machine verdict (verdict `needs-human`).
 *
 * No PRISM_API_KEY → exit 2 `judge-unavailable` (provider contract: scores
 * are never fabricated).
 *
 * Usage:
 *   tsx review-vision.ts --asset <id> \
 *     --aura apps/asset-lookdev/out/<id>/gameplay.jpg \
 *     --reference apps/asset-lookdev/out/<id>/three/gameplay.jpg \
 *     --axes silhouette,surfaceDetail,materialBelievability,texelSharpness,lodTransitions,artefacts \
 *     --out <review.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const AXES = ["silhouette", "surfaceDetail", "materialBelievability", "texelSharpness", "lodTransitions", "artefacts"] as const;

interface VisionReview {
  readonly schema: "aura3d.asset-review-vision/1";
  readonly assetId: string;
  readonly judge: { readonly kind: "vision-model"; readonly id: string; readonly model?: string };
  /** 2-run mean (0–10). */
  readonly score?: number;
  readonly axes?: Readonly<Record<string, number>>;
  readonly verdict: "accept" | "reject" | "needs-human";
  readonly runs: readonly { readonly score?: number; readonly raw: unknown }[];
  readonly notes: string;
}

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}

async function jpegBase64(path: string): Promise<string> {
  // ≤1280×720 JPEG q90 per the Prism image lane (provider contract).
  const buf = await sharp(path).resize({ width: 1280, height: 720, fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
  return buf.toString("base64");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const assetId = flag(argv, "--asset");
  const auraPath = flag(argv, "--aura");
  const referencePath = flag(argv, "--reference");
  const out = flag(argv, "--out");
  if (!assetId || !auraPath || !referencePath) {
    process.stderr.write("usage: review-vision.ts --asset <id> --aura <jpg> --reference <jpg> [--out review.json]\n");
    return 2;
  }
  // C-32 provider probe (same pattern as look/judge.ts): the export ships in
  // tools/quality-gate; without PRISM_API_KEY the provider throws and we
  // surface judge-unavailable rather than inventing a score.
  let judgeWithPrism: (packet: { itemId: string; images: readonly string[]; prompt: string; blindKey?: "A-is-aura" | "B-is-aura"; kind: "benchmark" | "game" }, opts: { baseUrl: string; apiKeyEnv: "PRISM_API_KEY"; model: "claude-opus-5.5" }) => Promise<unknown>;
  try {
    const mod = await import("../quality-gate/src/judge-prism.js").catch(() => import("../quality-gate/src/judge-prism" + ".ts")) as { judgeWithPrism?: typeof judgeWithPrism };
    if (typeof mod.judgeWithPrism !== "function") throw new Error("no export");
    judgeWithPrism = mod.judgeWithPrism;
  } catch {
    process.stderr.write("judge-unavailable: judgeWithPrism is not reachable from tools/quality-gate\n");
    return 2;
  }
  if (!process.env.PRISM_API_KEY) {
    process.stderr.write("judge-unavailable: PRISM_API_KEY is not set — vision judging unavailable, never fabricated\n");
    return 2;
  }
  const [auraImage, referenceImage] = await Promise.all([jpegBase64(resolve(auraPath)), jpegBase64(resolve(referencePath))]);
  const baseUrl = process.env.PRISM_BASE_URL ?? "https://prism.kiro.dev";
  const prompt = [
    `You are the Aura3D §6.7 look-dev judge for asset "${assetId}".`,
    "Image A is the Aura3D render; image B is the three.js reference of the same asset, same camera, same HDRI.",
    "Score the Aura3D render 0–10 overall and on these axes:",
    `${AXES.join(", ")}.`,
    "Reply with strict JSON only: {\"score\": <0-10>, \"axes\": {<axis>: <0-10>}, \"observations\": [\"...\"]}.",
    "Score against the reference honestly — renderer parity is worth 10; never inflate.",
  ].join(" ");

  const runs: { score?: number; raw: unknown }[] = [];
  for (let run = 0; run < 2; run++) {
    try {
      const record = await judgeWithPrism(
        { itemId: `prd05-lookdev:${assetId}:${run}`, images: [auraImage, referenceImage], prompt, blindKey: "A-is-aura", kind: "benchmark" },
        { baseUrl, apiKeyEnv: "PRISM_API_KEY", model: "claude-opus-5.5" },
      );
      const score = typeof (record as { aura?: number }).aura === "number" ? (record as { aura: number }).aura : undefined;
      const axes = (record as { categories?: Record<string, number> }).categories;
      runs.push({ score, raw: { score, axes } });
    } catch (error) {
      process.stderr.write(`run ${run}: ${error instanceof Error ? error.message : String(error)}\n`);
      runs.push({ raw: null });
    }
  }
  const scored = runs.filter((r) => typeof r.score === "number") as { score: number; raw: unknown }[];
  const verdict: VisionReview["verdict"] = (() => {
    if (scored.length === 0) return "needs-human";
    if (scored.length === 2 && Math.abs(scored[0]!.score - scored[1]!.score) > 1.5) return "needs-human";
    const mean = scored.reduce((s, r) => s + r.score, 0) / scored.length;
    return mean >= 6.5 ? "accept" : "reject";
  })();
  const meanScore = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : undefined;
  const review: VisionReview = {
    schema: "aura3d.asset-review-vision/1",
    assetId,
    judge: { kind: "vision-model", id: "review-vision", model: "claude-opus-5.5" },
    ...(meanScore !== undefined ? { score: meanScore } : {}),
    verdict,
    runs: runs.map((r) => ({ ...(r.score !== undefined ? { score: r.score } : {}), raw: r.raw })),
    notes: verdict === "needs-human" ? "run disagreement > 1.5 or no scored run — route to human review." : `2-run mean ${meanScore?.toFixed(2)}`,
  };
  const json = JSON.stringify(review, null, 2);
  if (out) writeFileSync(resolve(out), json + "\n");
  else process.stdout.write(json + "\n");
  return 0;
}

main().then((code) => { process.exitCode = code; }, (error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
