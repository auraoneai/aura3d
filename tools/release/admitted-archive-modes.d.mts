/** File data and execute bits recovered from the same strictly parsed tar. */
export interface InspectedArchiveFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly sha256: string;
  /** Exact owner/group/other executable bits, in the range 0..0o111. */
  readonly executable: number;
}
/** Byte inspection only. This function grants no review or admission authority. */
export function inspectAdmittedArchiveFiles(bytes: Uint8Array): {
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly files: readonly InspectedArchiveFile[];
};
