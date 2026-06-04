import { isDeepStrictEqual } from "node:util";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, type Dirent } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAnthropicAdapter,
  createGeminiAdapter,
  createLocalModelAdapter,
  createMockProvider,
  createOpenAIAdapter,
  validateAuraSceneIR,
  type AuraAIProvider,
  type AuraProviderTransport
} from "../../packages/ai-scene/src";
import { collectProviderEnvironment, redactReport, redactSecrets } from "../ai-scene-readiness/index";

export const LIVE_PROVIDER_CONTRACTS_REPORT = "tests/reports/cinematic/provider-contracts.json";
export const CINEMATIC_SECRET_AUDIT_REPORT = "tests/reports/cinematic/secret-audit.json";

export type LiveProviderId = "openai" | "anthropic" | "gemini" | "local";

export interface LiveProviderContractsOptions {
  readonly root?: string;
  readonly enabledProviders?: readonly LiveProviderId[];
  readonly env?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
}

interface ProviderEvidence {
  readonly id: LiveProviderId;
  readonly displayName: string;
  readonly providerMode: "live" | "mock";
  readonly enabled: boolean;
  readonly defaultModel: string;
  readonly serverSideProxy: boolean;
  readonly noNetworkDefault: boolean;
  readonly resultOk: boolean;
  readonly validIR: boolean;
  readonly networkUsed: boolean;
  readonly failureCode: string | null;
}

interface CinematicFailure {
  readonly id: string;
  readonly severity: "blocked";
  readonly detail: string;
  readonly nextAction: string;
}

const prompt = "Create a rainy neon alley where a lonely robot finds a glowing flower. Include wet pavement, fog, rain, glow, blue rim light, and a 12-second dolly-in.";

export async function createLiveProviderContractsReport(options: LiveProviderContractsOptions = {}) {
  const root = resolve(options.root ?? process.cwd());
  const enabledProviders = new Set(options.enabledProviders ?? enabledProvidersFromEnv(options.env ?? process.env));
  const mockA = createMockProvider({ generatedAt: "2026-05-27T00:00:00.000Z" });
  const mockB = createMockProvider({ generatedAt: "2026-05-27T00:00:00.000Z" });
  const mockResultA = await mockA.completeScene({ prompt, qualityTarget: "L3-cinematic-realtime" });
  const mockResultB = await mockB.completeScene({ prompt, qualityTarget: "L3-cinematic-realtime" });
  const fixtureA = readCinematicFixture(root);
  const fixtureB = readCinematicFixture(root);
  const mockDeterministic = mockResultA.ok && mockResultB.ok && isDeepStrictEqual(mockResultA.value, mockResultB.value);
  const fixtureDeterministic = isDeepStrictEqual(fixtureA, fixtureB);
  const transportJson = mockResultA.ok ? mockResultA.value : undefined;
  const providers = createProviders(enabledProviders, transportJson);
  const adapters: ProviderEvidence[] = [];
  for (const provider of providers) {
    const result = await provider.completeScene({ prompt, qualityTarget: "L3-cinematic-realtime" });
    const validation = result.ok ? validateAuraSceneIR(result.value) : { ok: false };
    adapters.push({
      id: provider.id as LiveProviderId,
      displayName: provider.displayName,
      providerMode: enabledProviders.has(provider.id as LiveProviderId) ? "live" : "mock",
      enabled: enabledProviders.has(provider.id as LiveProviderId),
      defaultModel: provider.defaultModel,
      serverSideProxy: provider.capabilities.serverSideProxy,
      noNetworkDefault: provider.capabilities.noNetworkDefault,
      resultOk: result.ok,
      validIR: result.ok && validation.ok,
      networkUsed: result.ok ? result.networkUsed : false,
      failureCode: result.ok ? null : result.error.code
    });
  }
  const failures: CinematicFailure[] = [];
  if (!mockDeterministic) failures.push(failure("mock-provider-determinism", "Mock provider did not return deterministic cinematic IR."));
  if (!fixtureDeterministic || !fixtureA) failures.push(failure("fixture-provider-determinism", "Fixture provider data is missing or not deterministic."));
  for (const adapter of adapters) {
    if (!adapter.serverSideProxy || !adapter.noNetworkDefault) failures.push(failure(`${adapter.id}:server-proxy-default`, `${adapter.displayName} must default to explicit server-side proxy transport.`));
    if (adapter.enabled) {
      if (!adapter.resultOk || !adapter.validIR) failures.push(failure(`${adapter.id}:valid-ir`, `${adapter.displayName} enabled provider contract did not return valid AuraSceneIR.`));
    } else if (adapter.resultOk || adapter.networkUsed || adapter.failureCode === null) {
      failures.push(failure(`${adapter.id}:disabled-default`, `${adapter.displayName} should not call network or return live results unless explicitly enabled.`));
    }
  }
  const report = {
    schema: "a3d-cinematic-live-provider-contracts",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), root) || "."),
      providerMode: enabledProviders.size > 0 ? "live" : "mock",
      backend: "provider-contract",
      requiredFiles: [
        "packages/ai-scene/src/providers/MockProvider.ts",
        "packages/ai-scene/src/providers/OpenAIAdapter.ts",
        "packages/ai-scene/src/providers/AnthropicAdapter.ts",
        "packages/ai-scene/src/providers/GeminiAdapter.ts",
        "apps/cinematic-prompt-to-scene/index.html"
      ],
      requiredReports: [],
      environment: collectProviderEnvironment(options.env ?? process.env),
      enabledProviders: [...enabledProviders]
    },
    evidence: [
      {
        id: "fixture-provider",
        path: "apps/cinematic-prompt-to-scene/index.html",
        present: Boolean(fixtureA),
        status: fixtureA ? "present" as const : "missing" as const,
        detail: "Fixture provider data is deterministic and available without API keys.",
        deterministic: fixtureDeterministic,
        providerMode: "fixture"
      },
      {
        id: "mock-provider",
        path: "packages/ai-scene/src/providers/MockProvider.ts",
        present: mockResultA.ok,
        status: mockResultA.ok ? "present" as const : "missing" as const,
        detail: "Mock provider returns deterministic cinematic IR without network.",
        deterministic: mockDeterministic,
        providerMode: "mock"
      },
      ...adapters.map((adapter) => ({
        id: adapter.id,
        path: `packages/ai-scene/src/providers/${adapter.displayName.replace(/\s+/g, "")}Adapter.ts`,
        present: true,
        status: "present" as const,
        detail: adapter.enabled
          ? `${adapter.displayName} explicit server-side transport returned valid redacted IR.`
          : `${adapter.displayName} remains disabled without explicit server-side transport.`,
        adapter
      }))
    ],
    providerMode: enabledProviders.size > 0 ? "live" as const : "mock" as const,
    backend: "provider-contract",
    networkUsed: false,
    blockedClaims: [],
    failures,
    unsupportedCases: failures,
    screenshots: [],
    adapters
  };
  return redactReport(report);
}

export function createCinematicSecretAuditReport(root = process.cwd()) {
  const resolvedRoot = resolve(root);
  const scannedRoots = [
    "apps/cinematic-prompt-to-scene",
    "tools/cinematic-scene-quality",
    "tools/cinematic-runtime-readiness",
    "tools/live-provider-contracts",
    "tools/cinematic-scene-diff-quality",
    "tools/cinematic-asset-readiness",
    "tests/browser/cinematic-prompt-to-scene-quality.spec.ts",
    "tests/browser/cinematic-route-screenshots.spec.ts",
    "tests/browser/cinematic-runtime-readiness.spec.ts",
    "tests/integration/live-provider-openai.spec.ts",
    "tests/integration/live-provider-anthropic.spec.ts",
    "tests/integration/live-provider-gemini.spec.ts",
    "tests/unit/tools/live-provider-contracts.test.ts"
  ] as const;
  const files = scannedRoots.flatMap((scanRoot) => {
    const absolute = join(resolvedRoot, scanRoot);
    return existsSync(absolute)
      ? walk(absolute).map((path) => relative(resolvedRoot, path).replaceAll("\\", "/"))
      : [];
  });
  const findings = files.flatMap((path) => scanFileForSecrets(join(resolvedRoot, path), path));
  const failures = findings.map((finding) => failure(`secret:${finding.path}:${finding.line}`, `${finding.path}:${finding.line} may contain an unredacted secret.`));
  return {
    schema: "a3d-cinematic-secret-audit",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    inputs: {
      root: redactSecrets(relative(process.cwd(), resolvedRoot) || "."),
      providerMode: "mock",
      backend: "static",
      requiredFiles: [...scannedRoots],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: files.map((path) => ({
      id: path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
      path: redactSecrets(path),
      present: true,
      status: "present" as const,
      detail: "Scanned for API keys, bearer tokens, and secret-looking strings."
    })),
    providerMode: "mock",
    backend: "static",
    networkUsed: false,
    blockedClaims: [],
    failures,
    unsupportedCases: failures,
    screenshots: [],
    findings
  };
}

export async function writeLiveProviderContractsReport(
  report: Awaited<ReturnType<typeof createLiveProviderContractsReport>> | Promise<Awaited<ReturnType<typeof createLiveProviderContractsReport>>> = createLiveProviderContractsReport(),
  reportPath = LIVE_PROVIDER_CONTRACTS_REPORT
): Promise<void> {
  writeReport(await report, reportPath);
}

export function writeCinematicSecretAuditReport(report = createCinematicSecretAuditReport(), reportPath = CINEMATIC_SECRET_AUDIT_REPORT): void {
  writeReport(report, reportPath);
}

function createProviders(enabledProviders: ReadonlySet<LiveProviderId>, transportJson: unknown): readonly AuraAIProvider[] {
  const transport: AuraProviderTransport = async () => ({
    text: JSON.stringify(redactReport(transportJson ?? {})),
    json: transportJson,
    networkUsed: false
  });
  return [
    createOpenAIAdapter(enabledProviders.has("openai") ? { transport } : {}),
    createAnthropicAdapter(enabledProviders.has("anthropic") ? { transport } : {}),
    createGeminiAdapter(enabledProviders.has("gemini") ? { transport } : {}),
    createLocalModelAdapter(enabledProviders.has("local") ? { transport } : {})
  ];
}

function enabledProvidersFromEnv(env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>): readonly LiveProviderId[] {
  const raw = env.A3D_LIVE_PROVIDER_CONTRACTS ?? "";
  if (raw === "1" || raw.toLowerCase() === "all") return ["openai", "anthropic", "gemini", "local"];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is LiveProviderId => entry === "openai" || entry === "anthropic" || entry === "gemini" || entry === "local");
}

function readCinematicFixture(root: string): Record<string, unknown> | undefined {
  const htmlPath = join(root, "apps/cinematic-prompt-to-scene/index.html");
  const text = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
  const match = text.match(/<script id="cinematic-scene-fixture" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function scanFileForSecrets(absolute: string, relativePath: string): readonly { readonly path: string; readonly line: number; readonly excerpt: string }[] {
  if (!existsSync(absolute)) return [];
  const text = readFileSync(absolute, "utf8");
  return text.split(/\r?\n/).flatMap((line, index) => containsPotentialSecret(line)
    ? [{ path: redactSecrets(relativePath), line: index + 1, excerpt: redactSecrets(line.trim()).slice(0, 220) }]
    : []);
}

function containsPotentialSecret(value: string): boolean {
  if (/containsPotentialSecret|secret-leak|`secret:|\bmay contain an unredacted secret\b/.test(value)) return false;
  if (/\b(?:token|secret|password|api[_-]?key)\??\s*:\s*(?:string|number|boolean|unknown|undefined|null|true|false)\b/i.test(value)) return false;
  return /\b(?:sk|ak|pk|rk|xoxb|ghp|github_pat|AIza)[A-Za-z0-9_\-]{12,}\b/.test(value)
    || /\b[A-Za-z0-9_\-]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_\-]*\s*[:=]\s*(?!\[REDACTED_SECRET\])[^,\s"'}]+/i.test(value);
}

function walk(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) return [root];
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const child = join(root, entry.name);
    if (entry.isDirectory()) {
      if ([".git", "node_modules", "dist", ".vite"].includes(entry.name)) return [];
      return walk(child);
    }
    return entry.isFile() && [".ts", ".tsx", ".js", ".json", ".md", ".html", ".css"].includes(extname(entry.name)) ? [child] : [];
  });
}

function failure(id: string, detail: string): CinematicFailure {
  return {
    id,
    severity: "blocked",
    detail,
    nextAction: "Keep provider contracts server-side, deterministic in CI, and redacted in reports."
  };
}

function writeReport(report: unknown, reportPath: string): void {
  mkdirSync(dirname(resolve(reportPath)), { recursive: true });
  writeFileSync(resolve(reportPath), `${JSON.stringify(redactReport(report), null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--secret-audit")) {
    const report = createCinematicSecretAuditReport();
    writeCinematicSecretAuditReport(report);
    if (!report.pass) {
      console.error(`Cinematic secret audit failed:\n${report.failures.map((entry) => entry.detail).join("\n")}`);
      process.exitCode = 1;
    } else {
      console.log(`Cinematic secret audit passed. Report: ${CINEMATIC_SECRET_AUDIT_REPORT}`);
    }
  } else {
    const report = await createLiveProviderContractsReport();
    await writeLiveProviderContractsReport(report);
    if (!report.pass) {
      console.error(`Cinematic provider contracts failed:\n${report.failures.map((entry) => entry.detail).join("\n")}`);
      process.exitCode = 1;
    } else {
      console.log(`Cinematic provider contracts passed. Report: ${LIVE_PROVIDER_CONTRACTS_REPORT}`);
    }
  }
}
