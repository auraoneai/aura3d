import { type DrawCommand, type RenderDeviceDiagnostics } from "@galileo3d/rendering";

export interface DrawCallRecord {
  readonly label: string;
  readonly topology: string;
  readonly indexed: boolean;
  readonly count: number;
  readonly shader: string | null;
}

export interface DrawCallSnapshot {
  readonly frame: number;
  readonly total: number;
  readonly records: readonly DrawCallRecord[];
  readonly zeroDrawCallFailure: boolean;
}

export class DrawCallTracker {
  private frame = 0;
  private readonly records: DrawCallRecord[] = [];

  beginFrame(): void {
    this.frame += 1;
    this.records.length = 0;
  }

  record(command: DrawCommand): void {
    this.records.push({
      label: command.label ?? "draw",
      topology: command.topology,
      indexed: command.indexBuffer !== undefined,
      count: command.indexCount ?? command.vertexCount,
      shader: command.shader?.label ?? null
    });
  }

  capture(deviceDiagnostics?: RenderDeviceDiagnostics): DrawCallSnapshot {
    const total = deviceDiagnostics?.drawCalls ?? this.records.length;
    return {
      frame: this.frame,
      total,
      records: [...this.records],
      zeroDrawCallFailure: total === 0
    };
  }
}
