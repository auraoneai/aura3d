import { RenderDeviceError } from "./RenderDevice";

export type RenderDebugIssueKind = "render-pass-error" | "shader-error";

export interface RenderDebugIssue {
  readonly kind: RenderDebugIssueKind;
  readonly label: string;
  readonly message: string;
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface RenderDebugOverlaySnapshot {
  readonly visible: boolean;
  readonly issueCount: number;
  readonly renderPassErrors: number;
  readonly shaderErrors: number;
  readonly issues: readonly RenderDebugIssue[];
  readonly lines: readonly string[];
}

export function captureRenderDebugIssue(
  kind: RenderDebugIssueKind,
  label: string,
  error: unknown
): RenderDebugIssue {
  const trimmedLabel = requireNonEmptyLabel(label);
  if (error instanceof RenderDeviceError) {
    return {
      kind,
      label: trimmedLabel,
      message: error.message,
      code: error.code,
      details: error.details
    };
  }
  if (error instanceof Error) {
    return {
      kind,
      label: trimmedLabel,
      message: error.message
    };
  }
  return {
    kind,
    label: trimmedLabel,
    message: String(error)
  };
}

export function buildRenderDebugOverlaySnapshot(issues: readonly RenderDebugIssue[]): RenderDebugOverlaySnapshot {
  const normalized = issues.map((issue) => ({
    ...issue,
    label: requireNonEmptyLabel(issue.label),
    message: issue.message.trim() || "Unknown render debug issue"
  }));
  const renderPassErrors = normalized.filter((issue) => issue.kind === "render-pass-error").length;
  const shaderErrors = normalized.filter((issue) => issue.kind === "shader-error").length;
  return {
    visible: normalized.length > 0,
    issueCount: normalized.length,
    renderPassErrors,
    shaderErrors,
    issues: normalized,
    lines: normalized.map(formatRenderDebugIssue)
  };
}

export function formatRenderDebugIssue(issue: RenderDebugIssue): string {
  const code = issue.code ? ` ${issue.code}` : "";
  return `[${issue.kind}${code}] ${issue.label}: ${issue.message}`;
}

function requireNonEmptyLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("Render debug issue label is required");
  }
  return trimmed;
}
