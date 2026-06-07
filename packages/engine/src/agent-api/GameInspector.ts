export interface GameInspectorRuntimeInput {
  readonly runtime?: {
    readonly nodes?: readonly { readonly id: string; readonly kind?: string; readonly tags?: readonly string[] }[];
    readonly frame?: number;
    readonly lifecycle?: string;
  };
  readonly input?: {
    readonly activeBindings?: readonly string[];
    readonly actions?: Record<string, unknown>;
  };
  readonly animation?: {
    readonly activeState?: string;
    readonly graph?: readonly string[];
    readonly clips?: readonly string[];
  };
  readonly combat?: {
    readonly hitboxes?: readonly unknown[];
    readonly hurtboxes?: readonly unknown[];
    readonly events?: readonly unknown[];
  };
  readonly renderer?: {
    readonly backend?: string;
    readonly drawCalls?: number;
    readonly frameTimeMs?: number;
  };
  readonly assets?: readonly { readonly id: string; readonly status?: string; readonly url?: string }[];
  readonly errors?: readonly string[];
}

export interface GameInspectorSnapshot {
  readonly kind: "aura-game-inspector-snapshot";
  readonly hierarchy: readonly { readonly id: string; readonly kind: string; readonly tags: readonly string[] }[];
  readonly components: readonly string[];
  readonly inputTrace: readonly string[];
  readonly animationGraph: readonly string[];
  readonly hitboxes: readonly unknown[];
  readonly renderStats: {
    readonly backend: string;
    readonly drawCalls: number;
    readonly frameTimeMs: number;
  };
  readonly assetLoadStatus: readonly { readonly id: string; readonly status: string; readonly url?: string }[];
  readonly errors: readonly string[];
  readonly normalModeArtifactFree: true;
}

export class GameInspector {
  snapshot(input: GameInspectorRuntimeInput): GameInspectorSnapshot {
    const hierarchy = (input.runtime?.nodes ?? []).map((node) => ({
      id: node.id,
      kind: node.kind ?? "runtime-node",
      tags: node.tags ?? []
    }));
    const components = [
      ...(input.runtime ? ["runtime"] : []),
      ...(input.input ? ["input"] : []),
      ...(input.animation ? ["animation"] : []),
      ...(input.combat ? ["combat"] : []),
      ...(input.renderer ? ["renderer"] : []),
      ...(input.assets ? ["assets"] : []),
      ...(input.errors ? ["errors"] : [])
    ];
    const inputTrace = [
      ...(input.input?.activeBindings ?? []),
      ...Object.keys(input.input?.actions ?? {})
    ];

    return {
      kind: "aura-game-inspector-snapshot",
      hierarchy,
      components,
      inputTrace,
      animationGraph: [
        ...(input.animation?.activeState ? [input.animation.activeState] : []),
        ...(input.animation?.graph ?? []),
        ...(input.animation?.clips ?? [])
      ],
      hitboxes: [
        ...(input.combat?.hitboxes ?? []),
        ...(input.combat?.hurtboxes ?? [])
      ],
      renderStats: {
        backend: input.renderer?.backend ?? "unknown",
        drawCalls: input.renderer?.drawCalls ?? 0,
        frameTimeMs: input.renderer?.frameTimeMs ?? 0
      },
      assetLoadStatus: (input.assets ?? []).map((asset) => ({
        id: asset.id,
        status: asset.status ?? "unknown",
        ...(asset.url ? { url: asset.url } : {})
      })),
      errors: input.errors ?? [],
      normalModeArtifactFree: true
    };
  }
}

export function createGameInspector(): GameInspector {
  return new GameInspector();
}
