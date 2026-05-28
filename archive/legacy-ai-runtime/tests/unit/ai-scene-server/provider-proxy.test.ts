import { createTinyRobotGreenhouseSceneIR, validateAuraSceneIR } from "@aura3d/ai-scene";
import {
  AuraProviderProxyError,
  AuraProviderRouter,
  MockProviderTransport,
  OpenAIProvider,
  createAuraProviderProxy,
  type AuraProviderCapabilityMetadata,
  type AuraProviderRawResponse,
  type AuraProviderTransportSceneRequest,
  type AuraSceneProviderTransport,
  type AuraSceneServerProviderId
} from "@aura3d/ai-scene-server";
import { describe, expect, it } from "vitest";

describe("@aura3d/ai-scene-server provider proxy", () => {
  it("keeps the mock provider deterministic and validates returned AuraSceneIR", async () => {
    const proxy = createAuraProviderProxy({
      router: new AuraProviderRouter({
        providers: [new MockProviderTransport({ generatedAt: "2026-01-01T00:00:00.000Z", seed: "unit" })]
      }),
      defaultRetryCount: 0
    });

    const first = await proxy.promptToScene({ provider: "mock", prompt: "Create a rainy neon alley with a robot and glowing flower." });
    const second = await proxy.promptToScene({ provider: "mock", prompt: "Create a rainy neon alley with a robot and glowing flower." });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("mock provider failed");
    expect(validateAuraSceneIR(first.scene).ok).toBe(true);
    expect(first.scene).toEqual(second.scene);
    expect(first.networkUsed).toBe(false);
  });

  it("rejects malformed provider JSON with a structured redacted error", async () => {
    const proxy = createAuraProviderProxy({
      router: new AuraProviderRouter({ providers: [new MalformedJsonTransport()] }),
      defaultProvider: "openai",
      defaultRetryCount: 0
    });

    const result = await proxy.promptToScene({ provider: "openai", prompt: "Return broken JSON." });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("malformed provider unexpectedly succeeded");
    expect(result.error.code).toBe("AURA_PROVIDER_JSON_MALFORMED");
    expect(result.error.message).not.toContain("sk-test");
    expect(result.error.message).toContain("[REDACTED]");
  });

  it("rejects raw API keys in request payloads before routing", async () => {
    const proxy = createAuraProviderProxy({ defaultProvider: "mock" });
    const result = await proxy.promptToScene({
      provider: "mock",
      prompt: "make a scene",
      metadata: { OPENAI_API_KEY: "sk-test12345678901234567890" }
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("secret-bearing request unexpectedly succeeded");
    expect(result.error.code).toBe("AURA_PROVIDER_REQUEST_INVALID");
    expect(result.error.diagnostics?.some((issue) => issue.code === "AURA_PROVIDER_SECRET_IN_REQUEST")).toBe(true);
  });

  it("applies timeout and cancellation to provider calls", async () => {
    const proxy = createAuraProviderProxy({
      router: new AuraProviderRouter({ providers: [new SlowTransport()] }),
      defaultProvider: "local",
      defaultRetryCount: 0
    });

    const result = await proxy.promptToScene({ provider: "local", prompt: "wait forever", timeoutMs: 250 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("slow provider unexpectedly succeeded");
    expect(result.error.code).toBe("AURA_PROVIDER_TIMEOUT");
    expect(result.attempts).toBe(1);
  });

  it("retries retryable transport errors and preserves a request id", async () => {
    const flaky = new FlakyTransport();
    const proxy = createAuraProviderProxy({
      router: new AuraProviderRouter({ providers: [flaky] }),
      defaultProvider: "local",
      defaultRetryCount: 1
    });

    const result = await proxy.promptToScene({ provider: "local", prompt: "retry once", requestId: "req-unit-retry" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.requestId).toBe("req-unit-retry");
    expect(result.attempts).toBe(2);
    expect(flaky.requestIds).toEqual(["req-unit-retry", "req-unit-retry"]);
    expect(validateAuraSceneIR(result.scene).ok).toBe(true);
  });

  it("exposes provider capability metadata without enabling live network by default", () => {
    const proxy = createAuraProviderProxy();
    const capabilities = proxy.capabilities();

    expect(capabilities.map((entry) => entry.id).sort()).toEqual(["anthropic", "gemini", "local", "mock", "openai"]);
    expect(capabilities.find((entry) => entry.id === "mock")?.configured).toBe(true);
    expect(capabilities.filter((entry) => entry.id !== "mock").every((entry) => entry.noNetworkDefault)).toBe(true);
  });

  it("does not make live network calls without explicit Aura3D env gating", async () => {
    let fetchCalled = false;
    const openai = new OpenAIProvider({
      apiKey: "sk-test12345678901234567890",
      enabled: true,
      fetchImpl: (async () => {
        fetchCalled = true;
        throw new Error("network should stay disabled");
      }) as typeof fetch
    });
    const proxy = createAuraProviderProxy({
      router: new AuraProviderRouter({ providers: [openai] }),
      defaultProvider: "openai",
      defaultRetryCount: 0
    });

    const result = await proxy.promptToScene({ provider: "openai", prompt: "make a scene" });

    expect(result.ok).toBe(false);
    expect(fetchCalled).toBe(false);
    if (result.ok) throw new Error("ungated OpenAI provider unexpectedly succeeded");
    expect(result.error.code).toBe("AURA_PROVIDER_NOT_CONFIGURED");
    expect(result.error.message).not.toContain("sk-test");
  });
});

class MalformedJsonTransport implements AuraSceneProviderTransport {
  readonly id = "openai";
  readonly capabilities = capability("openai", true);

  async completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse> {
    return {
      provider: "openai",
      model: request.model,
      requestId: request.requestId,
      text: '{"apiKey":"sk-test12345678901234567890",',
      networkUsed: false
    };
  }
}

class SlowTransport implements AuraSceneProviderTransport {
  readonly id = "local";
  readonly capabilities = capability("local", true);

  async completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse> {
    await new Promise((_resolve, reject) => {
      request.signal?.addEventListener("abort", () => reject(request.signal?.reason), { once: true });
    });
    throw new Error("unreachable");
  }
}

class FlakyTransport implements AuraSceneProviderTransport {
  readonly id = "local";
  readonly capabilities = capability("local", true);
  readonly requestIds: string[] = [];
  private attempts = 0;

  async completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse> {
    this.requestIds.push(request.requestId);
    this.attempts += 1;
    if (this.attempts === 1) {
      throw new AuraProviderProxyError("temporary provider overload", {
        code: "AURA_PROVIDER_OVERLOADED",
        provider: "local",
        requestId: request.requestId,
        retryable: true
      });
    }
    const scene = {
      ...createTinyRobotGreenhouseSceneIR({ generatedAt: "2026-01-01T00:00:00.000Z" }),
      provenance: {
        ...createTinyRobotGreenhouseSceneIR({ generatedAt: "2026-01-01T00:00:00.000Z" }).provenance,
        provider: "local",
        model: request.model,
        requestId: request.requestId
      }
    };
    return {
      provider: "local",
      model: request.model,
      requestId: request.requestId,
      text: JSON.stringify(scene),
      json: scene,
      networkUsed: false
    };
  }
}

function capability(id: AuraSceneServerProviderId, configured: boolean): AuraProviderCapabilityMetadata {
  return {
    id,
    displayName: id,
    defaultModel: `${id}-model`,
    structuredJson: true,
    promptToIR: true,
    promptToPatch: true,
    streaming: false,
    serverSideProxy: true,
    noNetworkDefault: true,
    liveNetwork: false,
    configured,
    requiredEnv: []
  };
}
