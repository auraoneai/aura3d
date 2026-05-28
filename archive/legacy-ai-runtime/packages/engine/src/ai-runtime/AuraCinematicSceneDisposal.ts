export interface AuraCinematicDisposable {
  dispose(): void;
}

export interface AuraCinematicSceneDisposalReport {
  readonly disposed: boolean;
  readonly disposedCount: number;
  readonly diagnostics: readonly string[];
}

export function disposeAuraCinematicScene(resources: readonly Partial<AuraCinematicDisposable>[]): AuraCinematicSceneDisposalReport {
  let disposedCount = 0;
  const diagnostics: string[] = [];
  for (const resource of resources) {
    if (typeof resource.dispose === "function") {
      resource.dispose();
      disposedCount += 1;
    }
  }
  diagnostics.push(`Disposed ${disposedCount} cinematic runtime resources.`);
  diagnostics.push("Animation loops, renderer-owned materials, route state, and compiled runtime handles must be released by the owning route.");
  return {
    disposed: true,
    disposedCount,
    diagnostics
  };
}
