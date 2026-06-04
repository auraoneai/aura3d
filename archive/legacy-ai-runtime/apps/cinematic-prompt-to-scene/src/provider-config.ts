import { providerModeOptions, type ProviderMode, type ProviderModeOption } from "./cinematic-demo-fixtures";

export { providerModeOptions };
export type { ProviderMode, ProviderModeOption };

export function providerRequiresProxy(mode: ProviderMode): boolean {
  return providerModeOptions.find((option) => option.mode === mode)?.requiresProxy ?? false;
}
