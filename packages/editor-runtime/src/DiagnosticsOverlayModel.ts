export interface EditorDiagnosticsResource {
  readonly id: string;
  readonly label: string;
  readonly kind: "scene-node" | "asset" | "material" | "shader" | "script";
  readonly status: "ok" | "warning" | "error";
  readonly detail?: string;
}

export interface EditorDiagnosticsInput {
  readonly frameTimeMs: number;
  /**
   * Whether frameTimeMs is an observed sample. Existing update callers that
   * omit this field still supply a sample. On snapshots, false or absent means
   * unavailable: the numeric value may be a placeholder or a stale sample.
   */
  readonly hasFrameTimeSample?: boolean;
  readonly drawCalls: number;
  readonly triangleCount?: number;
  readonly nodeCount: number;
  readonly assetCount: number;
  readonly physicsBodies: number;
  readonly resources?: readonly EditorDiagnosticsResource[];
}

export interface EditorDiagnosticsSnapshot extends EditorDiagnosticsInput {
  readonly warnings: number;
  readonly errors: number;
  readonly shaderWarnings: readonly EditorDiagnosticsResource[];
  readonly resourceWarnings: readonly EditorDiagnosticsResource[];
}

export class DiagnosticsOverlayModel {
  private snapshotRef: EditorDiagnosticsSnapshot = this.createSnapshot({
    frameTimeMs: 0,
    hasFrameTimeSample: false,
    drawCalls: 0,
    nodeCount: 0,
    assetCount: 0,
    physicsBodies: 0,
    resources: []
  });

  update(input: EditorDiagnosticsInput): EditorDiagnosticsSnapshot {
    if (!Number.isFinite(input.frameTimeMs) || input.frameTimeMs < 0) {
      throw new Error("Editor diagnostics frame time must be a non-negative finite number.");
    }
    if (input.hasFrameTimeSample !== undefined && typeof input.hasFrameTimeSample !== "boolean") {
      throw new Error("Editor diagnostics frame time sample status must be a boolean.");
    }
    if (!Number.isInteger(input.drawCalls) || input.drawCalls < 0) {
      throw new Error("Editor diagnostics draw calls must be a non-negative integer.");
    }
    if (!Number.isInteger(input.nodeCount) || input.nodeCount < 0) {
      throw new Error("Editor diagnostics node count must be a non-negative integer.");
    }
    if (!Number.isInteger(input.assetCount) || input.assetCount < 0) {
      throw new Error("Editor diagnostics asset count must be a non-negative integer.");
    }
    if (!Number.isInteger(input.physicsBodies) || input.physicsBodies < 0) {
      throw new Error("Editor diagnostics physics body count must be a non-negative integer.");
    }
    this.snapshotRef = this.createSnapshot(input);
    return this.snapshotRef;
  }

  snapshot(): EditorDiagnosticsSnapshot {
    return this.snapshotRef;
  }

  /** Invalidate an earlier timing before attempting another frame. */
  invalidateFrameTimeSample(): void {
    if (this.snapshotRef.hasFrameTimeSample !== false) {
      this.snapshotRef = { ...this.snapshotRef, hasFrameTimeSample: false };
    }
  }

  clear(): void {
    this.snapshotRef = this.createSnapshot({
      frameTimeMs: 0,
      hasFrameTimeSample: false,
      drawCalls: 0,
      nodeCount: 0,
      assetCount: 0,
      physicsBodies: 0,
      resources: []
    });
  }

  private createSnapshot(input: EditorDiagnosticsInput): EditorDiagnosticsSnapshot {
    const resources = [...(input.resources ?? [])];
    const warnings = resources.filter((resource) => resource.status === "warning").length;
    const errors = resources.filter((resource) => resource.status === "error").length;
    return {
      ...input,
      hasFrameTimeSample: input.hasFrameTimeSample ?? true,
      triangleCount: input.triangleCount ?? 0,
      resources,
      warnings,
      errors,
      shaderWarnings: resources.filter((resource) => resource.kind === "shader" && resource.status !== "ok"),
      resourceWarnings: resources.filter((resource) => resource.kind !== "shader" && resource.status !== "ok")
    };
  }
}
