export type RenderStateValue = string | number | boolean | null;
export type RenderStateSnapshot = ReadonlyMap<string, RenderStateValue>;

export interface RenderStateDiff {
  readonly key: string;
  readonly before: RenderStateValue | undefined;
  readonly after: RenderStateValue | undefined;
}

export class RenderStateInspector {
  capture(source: { captureState(): RenderStateSnapshot }): RenderStateSnapshot {
    return new Map(source.captureState());
  }

  diff(before: RenderStateSnapshot, after: RenderStateSnapshot): readonly RenderStateDiff[] {
    const keys = new Set([...before.keys(), ...after.keys()]);
    const diffs: RenderStateDiff[] = [];
    for (const key of keys) {
      const beforeValue = before.get(key);
      const afterValue = after.get(key);
      if (beforeValue !== afterValue) {
        diffs.push({ key, before: beforeValue, after: afterValue });
      }
    }
    return diffs;
  }

  assertNoLeak(before: RenderStateSnapshot, after: RenderStateSnapshot, ignoredKeys: readonly string[] = []): void {
    const ignored = new Set(ignoredKeys);
    const leaks = this.diff(before, after).filter((diff) => !ignored.has(diff.key));
    if (leaks.length > 0) {
      throw new RenderStateLeakError("Render state leak detected", leaks);
    }
  }
}

export class RenderStateLeakError extends Error {
  constructor(
    message: string,
    public readonly leaks: readonly RenderStateDiff[]
  ) {
    super(message);
    this.name = "RenderStateLeakError";
  }
}
