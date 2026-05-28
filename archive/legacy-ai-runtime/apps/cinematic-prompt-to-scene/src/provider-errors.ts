import { providerLabel, type ProviderMode } from "./cinematic-demo-fixtures";

export function formatProviderFailure(mode: ProviderMode, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${providerLabel(mode)} did not replace the last good scene. ${message}`;
}
