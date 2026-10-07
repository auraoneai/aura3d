/**
 * T4.2 — vision judge over Kiro Prism /v1/messages (OpenAI-compatible shape on
 * the /anthropic leg). Images go as base64 `image` blocks: Aura and reference
 * as SEPARATE 1280×720 JPEG q90 images — never one 2560-wide composite (Prism
 * resizes > 2000 px on the longest edge, ≤ 4 images per turn, ≤ 800 kB image
 * lane). The key is read from env PRISM_API_KEY and never logged.
 */
import type { BenchmarkJudgementRecord, GameJudgementRecord } from "./types";
import { RUBRIC_PROMPT_VERSION, validateBenchmarkJudgement, validateGameJudgement } from "./rubric";

export interface PrismJudgeOptions {
  readonly baseUrl: string;
  readonly apiKeyEnv: "PRISM_API_KEY";
  readonly model: "claude-opus-5.5";
}

export interface JudgePacketRequest {
  readonly itemId: string;
  /** base64 JPEG payloads, ≤ 4 total, each 1280×720. */
  readonly images: readonly string[];
  readonly prompt: string;
  readonly blindKey?: "A-is-aura" | "B-is-aura";
  readonly kind: "benchmark" | "game";
}

interface PrismMessageResponse {
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
}

/** T4.3 canary contract — caller supplies the frame; expected tokens are fixed. */
export const CANARY_REQUIRED_TOKENS: readonly string[] = ["red", "cube", "left"];

export function canaryPassed(description: string): boolean {
  const lower = description.toLowerCase();
  return CANARY_REQUIRED_TOKENS.every((token) => lower.includes(token));
}

export async function judgeWithPrism(
  packet: JudgePacketRequest,
  opts: PrismJudgeOptions
): Promise<BenchmarkJudgementRecord | GameJudgementRecord> {
  const apiKey = process.env[opts.apiKeyEnv];
  if (!apiKey) throw new Error(`${opts.apiKeyEnv} is not set — vision judging unavailable, never fabricated`);
  if (packet.images.length > 4) throw new Error("Prism allows <= 4 images per turn");

  const response = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "X-Prism-Client": "aura3d-quality-gate",
      "X-Prism-Job-Type": "image-review",
      "X-Prism-Repo": "auraoneai/aura3d",
      "X-Prism-Session": process.env.GITHUB_RUN_ID ?? "local"
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          ...packet.images.map((data) => ({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data }
          })),
          { type: "text", text: packet.prompt }
        ]
      }]
    })
  });
  if (!response.ok) {
    // Status only — never log body near an auth failure (could echo the key).
    throw new Error(`Prism /v1/messages -> HTTP ${response.status}`);
  }
  const body = (await response.json()) as PrismMessageResponse;
  const text = body.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n") ?? "";
  const json = JSON.parse(extractJson(text));
  const record = packet.kind === "benchmark" ? validateBenchmarkJudgement(json) : validateGameJudgement(json);
  return packet.kind === "benchmark"
    ? { ...record, judge: { ...record.judge, kind: "vision-model", model: opts.model, promptVersion: RUBRIC_PROMPT_VERSION } }
    : { ...record, judge: { ...record.judge, kind: "vision-model", model: opts.model, promptVersion: RUBRIC_PROMPT_VERSION } };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("judge response contained no JSON object");
  return text.slice(start, end + 1);
}
