export type AnalyticsConsentCategory = "necessary" | "analytics" | "marketing" | "preferences";
export type AnalyticsProviderMode = "console" | "batched-local" | "disabled";

export interface AnalyticsPrivacyFixtureOptions {
  readonly seed?: number;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly frameMs?: number;
  readonly eventCount?: number;
  readonly errorCount?: number;
  readonly analyticsConsent?: boolean;
  readonly marketingConsent?: boolean;
}

export interface AnalyticsPrivacyFixture {
  readonly source: "origin-master-analytics-privacy-adapted";
  readonly consent: {
    readonly version: "1.0";
    readonly explicitRequired: true;
    readonly categories: Record<AnalyticsConsentCategory, boolean>;
    readonly grantedCount: number;
    readonly deniedCount: number;
    readonly changeEvents: readonly { readonly category: AnalyticsConsentCategory; readonly granted: boolean; readonly previous: boolean }[];
  };
  readonly anonymization: {
    readonly userHash: string;
    readonly sessionHash: string;
    readonly emailRedacted: true;
    readonly tokenRedacted: true;
    readonly ipAnonymized: string;
    readonly piiPatternHits: number;
  };
  readonly batching: {
    readonly providerMode: AnalyticsProviderMode;
    readonly maxBatchSize: number;
    readonly queuedEvents: number;
    readonly flushedBatches: number;
    readonly offlineQueueEnabled: true;
    readonly blockedWithoutConsent: number;
  };
  readonly metrics: {
    readonly frameMs: number;
    readonly fps: number;
    readonly errorCount: number;
    readonly errorsPerMinute: number;
    readonly loadEvents: number;
    readonly customMetricCount: number;
  };
  readonly productionReadiness: {
    readonly consentTelemetry: true;
    readonly anonymizationTelemetry: true;
    readonly batchingTelemetry: true;
    readonly metricsTelemetry: true;
    readonly providerBoundaryTelemetry: true;
  };
  readonly blockedClaims: readonly string[];
  readonly claimBoundary: string;
  readonly hash: string;
}

export function sampleAnalyticsPrivacyFixture(options: AnalyticsPrivacyFixtureOptions = {}): AnalyticsPrivacyFixture {
  const seed = normalizeSeed(options.seed ?? 0xa11a);
  const userId = normalizeText(options.userId ?? "external-parity-runtime-player", "userId");
  const sessionId = normalizeText(options.sessionId ?? "runtime-session", "sessionId");
  const frameMs = positive(options.frameMs ?? 16.7, "frameMs");
  const eventCount = count(options.eventCount ?? 24, "eventCount");
  const errorCount = count(options.errorCount ?? 0, "errorCount");
  const analyticsConsent = options.analyticsConsent ?? true;
  const marketingConsent = options.marketingConsent ?? false;
  const categories: Record<AnalyticsConsentCategory, boolean> = {
    necessary: true,
    analytics: analyticsConsent,
    marketing: marketingConsent,
    preferences: true
  };
  const consentValues = Object.values(categories);
  const blockedWithoutConsent = analyticsConsent ? 0 : eventCount;
  const queuedEvents = analyticsConsent ? Math.min(eventCount, 50) : 0;
  const flushedBatches = analyticsConsent ? Math.ceil(queuedEvents / 10) : 0;
  const fps = Number((1000 / frameMs).toFixed(2));
  const fixture: Omit<AnalyticsPrivacyFixture, "hash"> = {
    source: "origin-master-analytics-privacy-adapted",
    consent: {
      version: "1.0",
      explicitRequired: true,
      categories,
      grantedCount: consentValues.filter(Boolean).length,
      deniedCount: consentValues.filter((granted) => !granted).length,
      changeEvents: [
        { category: "analytics", granted: analyticsConsent, previous: false },
        { category: "preferences", granted: true, previous: false }
      ]
    },
    anonymization: {
      userHash: stableHash(`user:${userId}:analytics`),
      sessionHash: stableHash(`session:${sessionId}:analytics`),
      emailRedacted: true,
      tokenRedacted: true,
      ipAnonymized: anonymizeIp(`198.51.${Math.floor(seededUnit(seed) * 100)}.${Math.floor(seededUnit(seed ^ 0x1979) * 240)}`),
      piiPatternHits: 3
    },
    batching: {
      providerMode: analyticsConsent ? "batched-local" : "disabled",
      maxBatchSize: 50,
      queuedEvents,
      flushedBatches,
      offlineQueueEnabled: true,
      blockedWithoutConsent
    },
    metrics: {
      frameMs: Number(frameMs.toFixed(3)),
      fps,
      errorCount,
      errorsPerMinute: Number((errorCount / 3).toFixed(3)),
      loadEvents: 3 + Math.floor(seededUnit(seed ^ 0x441) * 3),
      customMetricCount: 4
    },
    productionReadiness: {
      consentTelemetry: true,
      anonymizationTelemetry: true,
      batchingTelemetry: true,
      metricsTelemetry: true,
      providerBoundaryTelemetry: true
    },
    blockedClaims: [
      "GDPR/CCPA compliance certification",
      "production analytics SaaS integration",
      "real provider delivery guarantees",
      "cross-device identity graph",
      "Unity Analytics parity",
      "Unreal Insights/Analytics parity"
    ],
    claimBoundary: "This fixture ports old analytics, consent, anonymization, batching, and metrics concepts into deterministic local telemetry. It does not send analytics events, certify privacy compliance, integrate a production provider, or claim Unity Analytics or Unreal Insights parity."
  };
  return {
    ...fixture,
    hash: stableHash(JSON.stringify(fixture))
  };
}

function anonymizeIp(ip: string): string {
  const octets = ip.split(".");
  return `${octets[0] ?? "0"}.${octets[1] ?? "0"}.${octets[2] ?? "0"}.0`;
}

function normalizeSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer.");
  return seed >>> 0;
}

function normalizeText(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${name} must not be empty.`);
  return trimmed;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number.`);
  return value;
}

function count(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function seededUnit(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
