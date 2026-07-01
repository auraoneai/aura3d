import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function readJson(path: string): unknown | undefined {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return undefined;
  const source = readFileSync(absolute, "utf8");
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Failed to parse JSON evidence "${path}": ${reason}`);
  }
}

export function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function arrayValue(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function vectorValue(value: unknown): readonly [number, number, number] | undefined {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0], value[1], value[2]]
    : undefined;
}

export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
