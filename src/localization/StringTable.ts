/**
 * G3D String Table
 * String storage with nested keys and parameter substitution
 * @module Localization
 */

/**
 * String table data (nested structure)
 */
export type StringTableData = {
  [key: string]: string | StringTableData;
};

/**
 * String Table
 * Stores and retrieves localized strings
 */
export class StringTable {
  private strings: Map<string, string> = new Map();
  private nestedData: StringTableData = {};

  constructor(data?: StringTableData) {
    if (data) {
      this.loadData(data);
    }
  }

  /**
   * Load string data
   */
  public loadData(data: StringTableData): void {
    this.nestedData = data;
    this.flattenData(data);
  }

  /**
   * Get string by key
   */
  public get(key: string, params?: Record<string, any>): string | undefined {
    let value = this.strings.get(key);

    if (value === undefined) {
      return undefined;
    }

    // Substitute parameters if provided
    if (params) {
      value = this.substituteParams(value, params);
    }

    return value;
  }

  /**
   * Set string value
   */
  public set(key: string, value: string): void {
    this.strings.set(key, value);
  }

  /**
   * Check if key exists
   */
  public has(key: string): boolean {
    return this.strings.has(key);
  }

  /**
   * Delete key
   */
  public delete(key: string): void {
    this.strings.delete(key);
  }

  /**
   * Get all keys
   */
  public getKeys(): string[] {
    return Array.from(this.strings.keys());
  }

  /**
   * Get all entries
   */
  public getEntries(): Array<[string, string]> {
    return Array.from(this.strings.entries());
  }

  /**
   * Get size
   */
  public size(): number {
    return this.strings.size;
  }

  /**
   * Clear all strings
   */
  public clear(): void {
    this.strings.clear();
    this.nestedData = {};
  }

  /**
   * Merge with another string table
   */
  public merge(other: StringTable): void {
    for (const [key, value] of other.getEntries()) {
      this.strings.set(key, value);
    }
  }

  /**
   * Get nested value by path (dot notation)
   */
  public getByPath(path: string, params?: Record<string, any>): string | undefined {
    return this.get(path, params);
  }

  /**
   * Export as JSON
   */
  public toJSON(): StringTableData {
    return this.nestedData;
  }

  /**
   * Export as flat object
   */
  public toFlat(): Record<string, string> {
    const flat: Record<string, string> = {};
    for (const [key, value] of this.strings.entries()) {
      flat[key] = value;
    }
    return flat;
  }

  /**
   * Flatten nested data structure
   */
  private flattenData(data: StringTableData, prefix: string = ''): void {
    for (const [key, value] of Object.entries(data)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'string') {
        this.strings.set(fullKey, value);
      } else if (typeof value === 'object' && value !== null) {
        this.flattenData(value, fullKey);
      }
    }
  }

  /**
   * Substitute parameters in string
   * Supports: "Hello, {name}!" with params: { name: "World" }
   */
  private substituteParams(template: string, params: Record<string, any>): string {
    return template.replace(/\{([^}]+)\}/g, (match, key) => {
      const value = params[key];

      if (value === undefined || value === null) {
        return match; // Keep placeholder if no value
      }

      return String(value);
    });
  }

  /**
   * Create from flat object
   */
  public static fromFlat(data: Record<string, string>): StringTable {
    const table = new StringTable();
    for (const [key, value] of Object.entries(data)) {
      table.set(key, value);
    }
    return table;
  }

  /**
   * Create from nested object
   */
  public static fromNested(data: StringTableData): StringTable {
    return new StringTable(data);
  }
}
