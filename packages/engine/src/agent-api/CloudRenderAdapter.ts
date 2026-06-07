import type { CartoonEpisodePackageManifest } from "./CartoonEpisodePackage.js";
import type { CartoonRenderQueueArtifact } from "./CartoonRenderQueue.js";
import {
  createPromptAnimationIssue,
  type PromptAnimationId,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";

export type CloudRenderProvider = "local" | "github-actions" | "render-farm" | "custom";
export type CloudRenderJobStatus = "queued" | "running" | "completed" | "failed" | "unsupported";
export type CloudRenderCapabilityStatus = "ready" | "unsupported" | "missing-credentials";

export interface CloudRenderCapability {
  readonly supported: boolean;
  readonly status: CloudRenderCapabilityStatus;
  readonly provider: CloudRenderProvider;
  readonly requiresCredentials: boolean;
  readonly diagnostics: readonly PromptAnimationValidationIssue[];
}

export interface CloudRenderJobRequest {
  readonly kind: "cloud-render-job-request";
  readonly provider: CloudRenderProvider;
  readonly episodeId: PromptAnimationId;
  readonly packageId: PromptAnimationId;
  readonly renderQueuePath: string;
  readonly outputDirectory: string;
  readonly requiredArtifacts: readonly string[];
}

export interface CloudRenderJobResult {
  readonly kind: "cloud-render-job-result";
  readonly provider: CloudRenderProvider;
  readonly jobId?: string | undefined;
  readonly status: CloudRenderJobStatus;
  readonly outputUrl?: string | undefined;
  readonly diagnostics: readonly PromptAnimationValidationIssue[];
}

export interface CloudRenderAdapter {
  readonly provider: CloudRenderProvider;
  readonly available: boolean;
  readonly capability: CloudRenderCapability;
  readonly reason?: string | undefined;
  submit(request: CloudRenderJobRequest): Promise<CloudRenderJobResult> | CloudRenderJobResult;
}

export interface CreateCloudRenderAdapterOptions {
  readonly provider?: CloudRenderProvider | undefined;
  readonly available?: boolean | undefined;
  readonly endpoint?: string | undefined;
  readonly token?: string | undefined;
  readonly requiresCredentials?: boolean | undefined;
  readonly credentialsAvailable?: boolean | undefined;
  readonly submit?: ((request: CloudRenderJobRequest) => Promise<CloudRenderJobResult> | CloudRenderJobResult) | undefined;
}

export function createCloudRenderJobRequest(input: {
  readonly provider?: CloudRenderProvider | undefined;
  readonly packageManifest: CartoonEpisodePackageManifest;
  readonly renderQueue: CartoonRenderQueueArtifact;
  readonly outputDirectory?: string | undefined;
}): CloudRenderJobRequest {
  return {
    kind: "cloud-render-job-request",
    provider: input.provider ?? "custom",
    episodeId: input.renderQueue.episodeId,
    packageId: input.packageManifest.packageId,
    renderQueuePath: "render-manifest.json",
    outputDirectory: input.outputDirectory ?? "dist/episodes",
    requiredArtifacts: input.packageManifest.files.map((file) => file.path)
  };
}

export function probeCloudRenderAdapter(options: CreateCloudRenderAdapterOptions = {}): CloudRenderCapability {
  const provider = options.provider ?? "custom";
  const requiresCredentials = options.requiresCredentials ?? provider !== "local";
  const credentialsAvailable = options.credentialsAvailable ?? Boolean(options.token);
  const configured = options.available ?? Boolean(options.submit || (options.endpoint && (!requiresCredentials || credentialsAvailable)));

  if (!configured) {
    return {
      supported: false,
      status: "unsupported",
      provider,
      requiresCredentials,
      diagnostics: [
        createPromptAnimationIssue(
          "warning",
          "cloud-render-unconfigured",
          "Cloud render submission was skipped because no configured provider endpoint/client is available."
        )
      ]
    };
  }

  if (requiresCredentials && !credentialsAvailable) {
    return {
      supported: false,
      status: "missing-credentials",
      provider,
      requiresCredentials,
      diagnostics: [
        createPromptAnimationIssue(
          "error",
          "cloud-render-credentials-missing",
          "Cloud render submission requires provider credentials before jobs can be submitted."
        )
      ]
    };
  }

  return {
    supported: true,
    status: "ready",
    provider,
    requiresCredentials,
    diagnostics: []
  };
}

export function createCloudRenderAdapter(options: CreateCloudRenderAdapterOptions = {}): CloudRenderAdapter {
  const provider = options.provider ?? "custom";
  const capability = probeCloudRenderAdapter(options);
  return {
    provider,
    available: capability.supported,
    capability,
    reason: capability.supported ? undefined : capability.diagnostics[0]?.message,
    submit(request) {
      if (!capability.supported) {
        return {
          kind: "cloud-render-job-result",
          provider,
          status: "unsupported",
          diagnostics: capability.diagnostics
        };
      }
      return options.submit?.(request) ?? {
        kind: "cloud-render-job-result",
        provider,
        jobId: `${request.episodeId}:cloud-render`,
        status: "queued",
        diagnostics: []
      };
    }
  };
}
