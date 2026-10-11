export declare const DEFAULT_S_ROWS_DIR: string;
export declare function validateAgainstSchema(schema: object, value: unknown, root?: object, at?: string): string[];
export declare function validateRecord(record: unknown, schemasDir: string): string[];
export interface SRecordResult {
  readonly file: string;
  readonly errors: string[];
}
export declare function validateRecordsDir(sRowsDir?: string): { records: number; invalid: number; results: SRecordResult[] };
