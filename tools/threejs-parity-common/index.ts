import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ThreeJsParityInventoryReport {
  readonly totals: {
    readonly examples: number;
    readonly highPriorityOpen: number;
    readonly byStatus: Record<string, number>;
  };
  readonly items: readonly {
    readonly threeExampleId: string;
    readonly a3dRoute?: string;
    readonly category: string;
    readonly priority: string;
    readonly a3dStatus: string;
    readonly constructionTracks: readonly string[];
    readonly sameSceneAvailable: boolean;
    readonly visualStatus: string;
    readonly blockingFeatures: readonly string[];
    readonly tests: readonly string[];
    readonly screenshots: readonly string[];
  }[];
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function readInventory(path = "tests/reports/threejs-parity/threejs-inventory.json"): ThreeJsParityInventoryReport {
  if (!existsSync(path)) {
    throw new Error(`Missing Three.js parity inventory report: ${path}. Run pnpm threejs-parity:inventory first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as ThreeJsParityInventoryReport;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function listUncheckedChecklist(path = "docs/project/parity/threejs/status.md"): readonly string[] {
  if (!existsSync(path)) return [];
  return readText(path)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- [ ] "))
    .map((line) => line.slice("- [ ] ".length).trim());
}

export function countChecklist(path = "docs/project/parity/threejs/status.md"): { readonly checked: number; readonly unchecked: number } {
  if (!existsSync(path)) return { checked: 0, unchecked: 0 };
  const text = readText(path);
  return {
    checked: (text.match(/- \[x\]/g) ?? []).length,
    unchecked: (text.match(/- \[ \]/g) ?? []).length
  };
}

export interface ChecklistScope {
  readonly path: string;
  readonly startHeading: string;
  readonly endHeading: string;
}

/**
 * Count a bounded checklist and fail closed when either boundary disappears.
 *
 * The historical Three.js status page intentionally contains prose rather than
 * checkboxes. Treating its zero/zero result as completion allowed the old parity
 * pipeline to certify itself without reading a single current acceptance item.
 * Current competitive gates use this bounded reader against the final PRD.
 */
export function readChecklistScope(scope: ChecklistScope): {
  readonly checked: number;
  readonly unchecked: number;
  readonly total: number;
  readonly items: readonly { readonly checked: boolean; readonly text: string }[];
} {
  if (!existsSync(scope.path)) {
    throw new Error(`Missing checklist source: ${scope.path}`);
  }
  const source = readText(scope.path);
  const start = source.indexOf(scope.startHeading);
  const end = source.indexOf(scope.endHeading, start + scope.startHeading.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Checklist boundaries not found in ${scope.path}: ${scope.startHeading} -> ${scope.endHeading}`);
  }
  const items = source.slice(start, end)
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^\s*- \[([ xX])\]\s+(.+)$/.exec(line);
      return match ? [{ checked: match[1]!.toLowerCase() === "x", text: match[2]!.trim() }] : [];
    });
  if (items.length === 0) {
    throw new Error(`Checklist scope contains zero acceptance items: ${scope.path} (${scope.startHeading})`);
  }
  const checked = items.filter((item) => item.checked).length;
  return { checked, unchecked: items.length - checked, total: items.length, items };
}

export function reportIssue(id: string, message: string, severity: "info" | "warning" | "blocker" = "warning") {
  return { id, severity, message };
}
