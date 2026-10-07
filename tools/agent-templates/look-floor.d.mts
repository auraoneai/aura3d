export interface TemplateLookFloorEntry {
  readonly look: string;
  readonly anchor: "preset" | "plan" | "set";
}
export declare const TEMPLATE_LOOK_FLOOR: Readonly<Record<string, TemplateLookFloorEntry>>;
export declare function lookFloorStaticFindings(template: string): string[];
export declare function lookFloorStaticScan(templates?: string[]): string[];
