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
    readonly category: string;
    readonly priority: string;
    readonly a3dStatus: string;
    readonly constructionTracks: readonly string[];
    readonly sameSceneAvailable: boolean;
    readonly visualStatus: string;
    readonly blockingFeatures: readonly string[];
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

export function listUncheckedChecklist(path = "docs/project/threejs-parity-status.md"): readonly string[] {
  if (!existsSync(path)) return [];
  return readText(path)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- [ ] "))
    .map((line) => line.slice("- [ ] ".length).trim());
}

export function countChecklist(path = "docs/project/threejs-parity-status.md"): { readonly checked: number; readonly unchecked: number } {
  if (!existsSync(path)) return { checked: 0, unchecked: 0 };
  const text = readText(path);
  return {
    checked: (text.match(/- \[x\]/g) ?? []).length,
    unchecked: (text.match(/- \[ \]/g) ?? []).length
  };
}

export function reportIssue(id: string, message: string, severity: "info" | "warning" | "blocker" = "warning") {
  return { id, severity, message };
}
