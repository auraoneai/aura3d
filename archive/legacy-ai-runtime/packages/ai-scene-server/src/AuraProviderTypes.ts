import type {
  AuraSceneBackendPreference,
  AuraSceneIR,
  AuraSceneQualityTarget,
  AuraSceneValidationIssue
} from "@aura3d/ai-scene";

export type AuraSceneServerProviderId = "mock" | "openai" | "anthropic" | "gemini" | "local";

export interface AuraProviderCapabilityMetadata {
  readonly id: AuraSceneServerProviderId;
  readonly displayName: string;
  readonly defaultModel: string;
  readonly structuredJson: boolean;
  readonly promptToIR: boolean;
  readonly promptToPatch: boolean;
  readonly streaming: boolean;
  readonly serverSideProxy: boolean;
  readonly noNetworkDefault: boolean;
  readonly liveNetwork: boolean;
  readonly configured: boolean;
  readonly requiredEnv: readonly string[];
}

export interface AuraProviderProxyRequest {
  readonly prompt: string;
  readonly provider?: AuraSceneServerProviderId;
  readonly model?: string;
  readonly qualityTarget?: AuraSceneQualityTarget;
  readonly backendPreference?: AuraSceneBackendPreference;
  readonly assetManifestIds?: readonly string[];
  readonly timeoutMs?: number;
  readonly retryCount?: number;
  readonly requestId?: string;
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AuraProviderValidatedRequest extends AuraProviderProxyRequest {
  readonly provider: AuraSceneServerProviderId;
  readonly model: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly requestId: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface AuraProviderTransportSceneRequest extends AuraProviderValidatedRequest {
  readonly system: string;
}

export interface AuraProviderRawResponse {
  readonly provider: AuraSceneServerProviderId;
  readonly model: string;
  readonly requestId: string;
  readonly text: string;
  readonly json?: unknown;
  readonly networkUsed: boolean;
  readonly status?: number;
}

export interface AuraSceneProviderTransport {
  readonly id: AuraSceneServerProviderId;
  readonly capabilities: AuraProviderCapabilityMetadata;
  completeScene(request: AuraProviderTransportSceneRequest): Promise<AuraProviderRawResponse>;
}

export interface AuraProviderProxySuccess {
  readonly ok: true;
  readonly requestId: string;
  readonly provider: AuraSceneServerProviderId;
  readonly model: string;
  readonly scene: AuraSceneIR;
  readonly networkUsed: boolean;
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly warnings: readonly string[];
  readonly capabilities: AuraProviderCapabilityMetadata;
}

export interface AuraProviderProxyFailure {
  readonly ok: false;
  readonly requestId: string;
  readonly provider: AuraSceneServerProviderId;
  readonly model: string;
  readonly networkUsed: boolean;
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly status?: number;
    readonly diagnostics?: readonly AuraSceneValidationIssue[];
  };
}

export type AuraProviderProxyResult = AuraProviderProxySuccess | AuraProviderProxyFailure;

export interface AuraProviderRequestValidationResult {
  readonly ok: boolean;
  readonly request?: AuraProviderValidatedRequest;
  readonly issues: readonly AuraSceneValidationIssue[];
}

export interface AuraProviderProxyOptions {
  readonly router?: import("./AuraProviderRouter.js").AuraProviderRouter;
  readonly defaultProvider?: AuraSceneServerProviderId;
  readonly defaultTimeoutMs?: number;
  readonly defaultRetryCount?: number;
}

export class AuraProviderProxyError extends Error {
  readonly code: string;
  readonly provider?: AuraSceneServerProviderId;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly diagnostics?: readonly AuraSceneValidationIssue[];
  readonly networkUsed: boolean;

  constructor(message: string, options: {
    readonly code: string;
    readonly provider?: AuraSceneServerProviderId;
    readonly requestId?: string;
    readonly retryable?: boolean;
    readonly status?: number;
    readonly diagnostics?: readonly AuraSceneValidationIssue[];
    readonly networkUsed?: boolean;
    readonly cause?: unknown;
  }) {
    super(message, { cause: options.cause });
    this.name = "AuraProviderProxyError";
    this.code = options.code;
    this.provider = options.provider;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.diagnostics = options.diagnostics;
    this.networkUsed = options.networkUsed ?? false;
  }
}
