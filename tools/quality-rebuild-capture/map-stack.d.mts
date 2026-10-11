export function decodeVlqSegment(segment: string): number[];
export function originalPosition(
  map: { readonly mappings?: string; readonly sources?: readonly string[] },
  line: number,
  column: number
): { readonly source: string; readonly line: number; readonly column: number } | null;
export function mapStack(text: string, buildDir: string): string[];
export function crashTable(report: unknown, buildDir: string): string;
export function crashCount(report: unknown): number;
