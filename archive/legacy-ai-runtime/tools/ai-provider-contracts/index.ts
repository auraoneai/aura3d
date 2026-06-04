import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAnthropicAdapter,
  createGeminiAdapter,
  createLocalModelAdapter,
  createMockProvider,
  createOpenAIAdapter,
  validateAuraSceneIR
} from "../../packages/ai-scene/src";
import { collectProviderEnvironment, redactReport, redactSecrets } from "../ai-scene-readiness/index";

export const AI_PROVIDER_CONTRACTS_REPORT = "tests/reports/ai-scene/provider-contracts.json";

export async function createAIProviderContractsReport(root = process.cwd()) {
  const prompt = "Create a cinematic greenhouse scene with a robot, glowing flower, sunrise light, fog, and a camera push.";
  const mock = createMockProvider({ generatedAt: "2026-05-26T00:00:00.000Z" });
  const mockResult = await mock.completeScene({ prompt, qualityTarget: "L3" });
  const mockValidation = mockResult.ok ? validateAuraSceneIR(mockResult.value) : { ok: false, errors: [] };
  const adapters = [
    createOpenAIAdapter(),
    createAnthropicAdapter(),
    createGeminiAdapter(),
    createLocalModelAdapter()
  ];
  const adapterEvidence = [];
  for (const adapter of adapters) {
    const result = await adapter.completeScene({ prompt, qualityTarget: "L3" });
    adapterEvidence.push({
      id: adapter.id,
      displayName: adapter.displayName,
      defaultModel: adapter.defaultModel,
      noNetworkDefault: adapter.capabilities.noNetworkDefault,
      serverSideProxy: adapter.capabilities.serverSideProxy,
      resultOkWithoutTransport: result.ok,
      networkUsed: result.ok ? result.networkUsed : false,
      failureCode: result.ok ? null : result.error.code
    });
  }
  const blockedClaims: string[] = [];
  const unsupportedCases = [];
  if (!mockResult.ok) unsupportedCases.push(unsupported("mock-provider", "MockProvider failed to generate scene IR."));
  if (!mockValidation.ok) unsupportedCases.push(unsupported("mock-ir-validation", "MockProvider generated invalid AuraSceneIR."));
  for (const entry of adapterEvidence) {
    if (entry.resultOkWithoutTransport || entry.networkUsed || !entry.noNetworkDefault || !entry.serverSideProxy) {
      unsupportedCases.push(unsupported(`provider:${entry.id}`, `${entry.displayName} does not satisfy no-key server-proxy adapter defaults.`));
    }
  }
  return {
    schema: "a3d-ai-provider-contracts",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0 && blockedClaims.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), resolve(root)) || "."),
      providerMode: "mock",
      requiredFiles: [
        "packages/ai-scene/src/providers/MockProvider.ts",
        "packages/ai-scene/src/providers/OpenAIAdapter.ts",
        "packages/ai-scene/src/providers/AnthropicAdapter.ts",
        "packages/ai-scene/src/providers/GeminiAdapter.ts",
        "packages/ai-scene/src/providers/LocalModelAdapter.ts"
      ],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: [
      {
        id: "mock-provider",
        present: true,
        status: "present",
        path: "packages/ai-scene/src/providers/MockProvider.ts",
        detail: mockResult.ok ? "MockProvider generated valid deterministic scene IR without network." : "MockProvider failed."
      },
      ...adapterEvidence.map((entry) => ({
        id: entry.id,
        present: true,
        status: "present",
        path: `packages/ai-scene/src/providers/${entry.displayName.replace(/\s+/g, "")}Adapter.ts`,
        detail: `${entry.displayName} requires explicit server-side transport and does not read browser API keys by default.`
      }))
    ],
    providerMode: "mock",
    networkUsed: false,
    blockedClaims,
    unsupportedCases,
    adapters: adapterEvidence,
    mockValidation
  };
}

type AIProviderContractsReport = Awaited<ReturnType<typeof createAIProviderContractsReport>>;

export function writeAIProviderContractsReport(report: AIProviderContractsReport | Promise<AIProviderContractsReport> = createAIProviderContractsReport(), path = AI_PROVIDER_CONTRACTS_REPORT): Promise<void> {
  return Promise.resolve(report).then((resolvedReport) => {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(resolve(path), `${JSON.stringify(redactReport(resolvedReport), null, 2)}\n`);
  });
}

function unsupported(id: string, detail: string) {
  return { id, severity: "blocked" as const, detail, nextAction: "Fix the provider contract before release." };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await createAIProviderContractsReport();
  await writeAIProviderContractsReport(report);
  if (!report.pass) {
    console.error(`AI provider contracts failed:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`AI provider contracts passed. Report: ${AI_PROVIDER_CONTRACTS_REPORT}`);
  }
}
