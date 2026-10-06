/** Type declarations for contracts.mjs (C-33). */
export interface CaptureStepPlugin {
  readonly name: string;
  readonly owner: string;
  run(page: unknown, step: Readonly<Record<string, unknown>>, ctx: { readonly outDir: string; readonly route: string; readonly log: (m: string) => void }): Promise<{ readonly files: readonly string[]; readonly data?: unknown }>;
}
export function registerCaptureStepPlugin(plugin: CaptureStepPlugin): void;
export function captureStepPluginFor(name: string): CaptureStepPlugin | undefined;
export function captureStepPluginNames(): readonly string[];
