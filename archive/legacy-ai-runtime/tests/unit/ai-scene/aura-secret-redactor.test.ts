import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../../packages/ai-scene/src";

describe("Aura AI scene secret redaction", () => {
  it("redacts API keys, bearer tokens, and prompt secrets recursively", () => {
    const report = {
      provider: "openai",
      apiKey: "sk-live-1234567890abcdef",
      headers: {
        Authorization: "Bearer provider-token-123",
        "x-api-key": "AIzaSySecretKey"
      },
      prompt: "Use SECRET_PROJECT=neon-robot and render a rainy alley.",
      nested: {
        credentials: {
          anthropicApiKey: "anthropic-secret-456"
        }
      },
      safe: {
        providerMode: "mock",
        sceneId: "scene-neon-alley-001"
      }
    };

    const redacted = redactSecrets(report);
    const serialized = JSON.stringify(redacted);

    expect(redacted).toMatchObject({
      provider: "openai",
      apiKey: "[REDACTED]",
      headers: {
        Authorization: "Bearer [REDACTED]",
        "x-api-key": "[REDACTED]"
      },
      safe: {
        providerMode: "mock",
        sceneId: "scene-neon-alley-001"
      }
    });
    expect(serialized).not.toContain("sk-live-1234567890abcdef");
    expect(serialized).not.toContain("provider-token-123");
    expect(serialized).not.toContain("AIzaSySecretKey");
    expect(serialized).not.toContain("anthropic-secret-456");
    expect(serialized).not.toContain("SECRET_PROJECT=neon-robot");
    expect(serialized).toContain("[REDACTED]");
  });

  it("does not mutate the source report", () => {
    const source = { apiKey: "sk-source-secret", nested: { token: "Bearer nested-secret" } };

    const redacted = redactSecrets(source);

    expect(source).toEqual({ apiKey: "sk-source-secret", nested: { token: "Bearer nested-secret" } });
    expect(redacted).toEqual({ apiKey: "[REDACTED]", nested: { token: "Bearer [REDACTED]" } });
  });
});
