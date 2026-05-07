export interface DebugOverlaySection {
  readonly title: string;
  readonly rows: readonly DebugOverlayRow[];
}

export interface DebugOverlayRow {
  readonly label: string;
  readonly value: string | number | boolean | null;
}

export interface DebugOverlaySnapshot {
  readonly sections: readonly DebugOverlaySection[];
}

export class DebugOverlay {
  private readonly sections = new Map<string, DebugOverlayRow[]>();

  setSection(title: string, rows: readonly DebugOverlayRow[]): void {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new Error("Debug overlay section title is required");
    }
    this.sections.set(trimmed, rows.map((row) => ({ ...row })));
  }

  removeSection(title: string): void {
    this.sections.delete(title);
  }

  snapshot(): DebugOverlaySnapshot {
    return {
      sections: [...this.sections.entries()].map(([title, rows]) => ({ title, rows: [...rows] }))
    };
  }
}
