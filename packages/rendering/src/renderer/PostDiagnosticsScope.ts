/**
 * Per-renderer, per-view post diagnostics. A frame token is explicitly passed
 * to every producer; there is no ambient current renderer or view.
 */
export type PostDiagnosticViewId = string | number;

export interface PostDiagnosticToken {
  readonly scopeId: object;
  readonly viewId: PostDiagnosticViewId;
  readonly frameId: number;
}

export interface PostDiagnosticSnapshot {
  readonly viewId: PostDiagnosticViewId;
  readonly frameId: number;
  /** Reasons persist within one view until explicitly cleared or retired. */
  readonly skipped: readonly string[];
  /** Stage execution order for the most recent authored frame in this view. */
  readonly stagesRan: readonly string[];
  readonly outcome: string | null;
}

interface PostViewState {
  token: PostDiagnosticToken;
  readonly skipped: Set<string>;
  stagesRan: string[];
  outcome: string | null;
}

/**
 * Owns no renderer resources. Scope IDs are weakly held; explicit retirement
 * removes all per-view state even when the renderer remains alive. Late async
 * callbacks cannot recreate a retired view or write into a later frame.
 */
export class PostDiagnosticsStore {
  private readonly scopes = new WeakMap<object, Map<PostDiagnosticViewId, PostViewState>>();

  begin(scopeId: object, viewId: PostDiagnosticViewId, frameId: number): PostDiagnosticToken {
    if (!scopeId || typeof scopeId !== "object") throw new RangeError("POST_DIAGNOSTICS_SCOPE_INVALID");
    if ((typeof viewId !== "string" && typeof viewId !== "number")
        || (typeof viewId === "number" && !Number.isFinite(viewId))) throw new RangeError("POST_DIAGNOSTICS_VIEW_INVALID");
    if (!Number.isSafeInteger(frameId) || frameId < 0) throw new RangeError("POST_DIAGNOSTICS_FRAME_INVALID");
    let views = this.scopes.get(scopeId);
    if (!views) { views = new Map(); this.scopes.set(scopeId, views); }
    const previous = views.get(viewId);
    if (previous?.token.frameId === frameId) return previous.token;
    const token: PostDiagnosticToken = Object.freeze({ scopeId, viewId, frameId });
    if (previous) {
      previous.token = token;
      previous.stagesRan = [];
      previous.outcome = null;
    } else {
      views.set(viewId, { token, skipped: new Set(), stagesRan: [], outcome: null });
    }
    return token;
  }

  /** False means the token has been superseded, retired or forged. */
  recordSkipped(token: PostDiagnosticToken, reason: string): boolean {
    const state = this.current(token);
    if (!state) return false;
    state.skipped.add(reason);
    return true;
  }

  clearSkipped(token: PostDiagnosticToken, reason: string): boolean {
    const state = this.current(token);
    if (!state) return false;
    state.skipped.delete(reason);
    return true;
  }

  recordStage(token: PostDiagnosticToken, stage: string): boolean {
    const state = this.current(token);
    if (!state) return false;
    state.stagesRan.push(stage);
    return true;
  }

  setOutcome(token: PostDiagnosticToken, outcome: string | null): boolean {
    const state = this.current(token);
    if (!state) return false;
    state.outcome = outcome;
    return true;
  }

  snapshot(scopeId: object, viewId: PostDiagnosticViewId): PostDiagnosticSnapshot | null {
    const state = this.scopes.get(scopeId)?.get(viewId);
    return state ? this.copySnapshot(state) : null;
  }

  /** Return data only while the exact frame token is still current. */
  snapshotToken(token: PostDiagnosticToken): PostDiagnosticSnapshot | null {
    const state = this.current(token);
    return state ? this.copySnapshot(state) : null;
  }

  /** A detached snapshot for each live view, in first-seen view order. */
  snapshotScope(scopeId: object): readonly PostDiagnosticSnapshot[] {
    const views = this.scopes.get(scopeId);
    return views ? [...views.values()].map(state => this.copySnapshot(state)) : [];
  }

  resetView(scopeId: object, viewId: PostDiagnosticViewId): void {
    const views = this.scopes.get(scopeId);
    if (!views) return;
    views.delete(viewId);
    if (views.size === 0) this.scopes.delete(scopeId);
  }

  resetScope(scopeId: object): void {
    this.scopes.delete(scopeId);
  }

  private current(token: PostDiagnosticToken): PostViewState | undefined {
    if (!token || typeof token !== "object") return undefined;
    const state = this.scopes.get(token.scopeId)?.get(token.viewId);
    return state?.token === token ? state : undefined;
  }

  private copySnapshot(state: PostViewState): PostDiagnosticSnapshot {
    return { viewId: state.token.viewId, frameId: state.token.frameId,
      skipped: [...state.skipped], stagesRan: [...state.stagesRan], outcome: state.outcome };
  }
}

/** Shared storage is isolated by explicit renderer scope and view identity. */
export const postDiagnostics = new PostDiagnosticsStore();
