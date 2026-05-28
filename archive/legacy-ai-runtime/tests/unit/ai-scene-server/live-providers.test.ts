import { validateAuraSceneIR } from "@aura3d/ai-scene";
import { createAuraProviderProxy } from "@aura3d/ai-scene-server";
import { describe, expect, it } from "vitest";

const LIVE = process.env.AURA3D_LIVE_PROVIDER_TESTS === "true";
const PROMPT = "Create a compact cinematic AuraSceneIR for a rainy neon alley where a small robot finds a glowing flower.";

describe("@aura3d/ai-scene-server opt-in live providers", () => {
  const openaiIt = LIVE && (process.env.OPENAI_API_KEY || process.env.AURA3D_OPENAI_API_KEY) ? it : it.skip;
  openaiIt("OpenAI provider returns valid IR when enabled", async () => {
    const result = await createAuraProviderProxy({ defaultProvider: "openai", defaultTimeoutMs: 120_000, defaultRetryCount: 1 }).promptToScene({
      provider: "openai",
      prompt: PROMPT,
      timeoutMs: 120_000
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(validateAuraSceneIR(result.scene).ok).toBe(true);
  });

  const anthropicIt = LIVE && (process.env.ANTHROPIC_API_KEY || process.env.AURA3D_ANTHROPIC_API_KEY) ? it : it.skip;
  anthropicIt("Anthropic provider returns valid IR when enabled", async () => {
    const result = await createAuraProviderProxy({ defaultProvider: "anthropic", defaultTimeoutMs: 120_000, defaultRetryCount: 1 }).promptToScene({
      provider: "anthropic",
      prompt: PROMPT,
      timeoutMs: 120_000
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(validateAuraSceneIR(result.scene).ok).toBe(true);
  });

  const geminiIt = LIVE && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.AURA3D_GEMINI_API_KEY) ? it : it.skip;
  geminiIt("Gemini provider returns valid IR when enabled", async () => {
    const result = await createAuraProviderProxy({ defaultProvider: "gemini", defaultTimeoutMs: 120_000, defaultRetryCount: 1 }).promptToScene({
      provider: "gemini",
      prompt: PROMPT,
      timeoutMs: 120_000
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(validateAuraSceneIR(result.scene).ok).toBe(true);
  });

  const localIt = LIVE && process.env.AURA3D_LOCAL_MODEL_ENDPOINT ? it : it.skip;
  localIt("Local provider returns valid IR when enabled", async () => {
    const result = await createAuraProviderProxy({ defaultProvider: "local", defaultTimeoutMs: 120_000, defaultRetryCount: 1 }).promptToScene({
      provider: "local",
      prompt: PROMPT,
      timeoutMs: 120_000
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(validateAuraSceneIR(result.scene).ok).toBe(true);
  });
});
