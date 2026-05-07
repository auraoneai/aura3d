export interface DebugReport {
  readonly generatedAt: string;
  readonly name: string;
  readonly data: unknown;
}

export class ReportExporter {
  constructor(private readonly now: () => Date = () => new Date()) {}

  create(name: string, data: unknown): DebugReport {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("Report name is required");
    }
    return {
      generatedAt: this.now().toISOString(),
      name: trimmed,
      data
    };
  }

  toJson(report: DebugReport): string {
    return `${JSON.stringify(report, sortKeys, 2)}\n`;
  }
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
}
