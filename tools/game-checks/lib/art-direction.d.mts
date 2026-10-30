// Types for tools/game-checks/lib/art-direction.mjs (imported by each game's art-direction unit test).

export declare const ART_DIRECTION_AUDIT_SCHEMA: "aura3d.art-direction-audit/1";
export declare const ART_DIRECTION_AUDIT_FILE: "direction.audit.json";

export interface ArtDirectionAuditInput {
  /** The `defineArtDirection(...)` result (the default export of art/direction.ts). */
  readonly direction: object;
  /** The `ArtDirectionSnapshot` the audit ran against. */
  readonly snapshot?: object;
  /** The `auditArtDirection(...)` result; an empty array is a pass. */
  readonly violations: readonly object[];
  readonly drawCallsBudget?: number;
}

export interface ArtDirectionAuditRecord {
  readonly schema: "aura3d.art-direction-audit/1";
  /** Repo-relative path of art/direction.ts. */
  readonly source: string;
  readonly sourceSha256: string;
  readonly id: string | null;
  readonly genre: string | null;
  readonly signatureEffect: string | null;
  readonly palette: { readonly primary: readonly string[]; readonly accent: string; readonly reservedObjective?: string } | null;
  readonly environment: { readonly hdri?: string; readonly preset?: string; readonly background: "hdri" | "sky" | "enclosed" } | null;
  readonly drawCallsBudget?: number;
  readonly violations: readonly object[];
  readonly snapshot: object | null;
  readonly direction: object;
}

export interface ArtDirectionAuditRead {
  readonly ok: boolean;
  readonly record: ArtDirectionAuditRecord | null;
  /** missing | invalid-json | schema | stale | no-violations-array | violations | no-id | no-signature-effect | no-palette */
  readonly problems: readonly string[];
  readonly path: string;
}

/** Path of the audit record that belongs to an `art/direction.ts`. */
export declare function artDirectionAuditPath(directionFile: string | URL, root?: string): string;
export declare function sha256File(file: string): string;
export declare function artDirectionAuditRecord(directionFile: string | URL, input: ArtDirectionAuditInput, root?: string): ArtDirectionAuditRecord;
/** Writes `art/direction.audit.json` beside art/direction.ts when its content changed; returns the record. */
export declare function writeArtDirectionAudit(directionFile: string | URL, input: ArtDirectionAuditInput, root?: string): ArtDirectionAuditRecord;
export declare function readArtDirectionAudit(directionFile: string | URL, root?: string): ArtDirectionAuditRead;
