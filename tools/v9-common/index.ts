import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface V9InventoryReport {
  readonly totals: {
    readonly examples: number;
    readonly highPriorityOpen: number;
    readonly byStatus: Record<string, number>;
  };
  readonly items: readonly {
    readonly threeExampleId: string;
    readonly category: string;
    readonly priority: string;
    readonly g3dStatus: string;
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

export function readInventory(path = "tests/reports/v9/threejs-inventory.json"): V9InventoryReport {
  if (!existsSync(path)) {
    throw new Error(`Missing V9 inventory report: ${path}. Run pnpm v9:inventory first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as V9InventoryReport;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function listUncheckedChecklist(path = "docs/project/v9-roadmap-three-js-parity-plan.md"): readonly string[] {
  return readText(path)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- [ ] "))
    .map((line) => line.slice("- [ ] ".length).trim());
}

export function countChecklist(path = "docs/project/v9-roadmap-three-js-parity-plan.md"): { readonly checked: number; readonly unchecked: number } {
  const text = readText(path);
  return {
    checked: (text.match(/- \[x\]/g) ?? []).length,
    unchecked: (text.match(/- \[ \]/g) ?? []).length
  };
}

export function reportIssue(id: string, message: string, severity: "info" | "warning" | "blocker" = "warning") {
  return { id, severity, message };
}
