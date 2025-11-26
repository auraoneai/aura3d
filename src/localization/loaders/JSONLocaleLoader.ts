/**
 * G3D JSON Locale Loader
 * Loads locale data from JSON files
 * @module Localization/Loaders
 */

import { StringTable, StringTableData } from '../StringTable';

/**
 * JSON Locale Loader
 * Loads and parses JSON locale files
 */
export class JSONLocaleLoader {
  /**
   * Load locale from JSON file
   */
  public static async loadFromFile(url: string): Promise<StringTable> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to load locale file: ${response.status} ${response.statusText}`);
      }

      const data: StringTableData = await response.json();
      return new StringTable(data);
    } catch (error: any) {
      throw new Error(`Failed to load locale from ${url}: ${error.message}`);
    }
  }

  /**
   * Load locale from JSON string
   */
  public static loadFromString(json: string): StringTable {
    try {
      const data: StringTableData = JSON.parse(json);
      return new StringTable(data);
    } catch (error: any) {
      throw new Error(`Failed to parse locale JSON: ${error.message}`);
    }
  }

  /**
   * Load locale from object
   */
  public static loadFromObject(data: StringTableData): StringTable {
    return new StringTable(data);
  }

  /**
   * Load multiple locales
   */
  public static async loadMultiple(
    urls: Record<string, string>
  ): Promise<Record<string, StringTable>> {
    const results: Record<string, StringTable> = {};

    const promises = Object.entries(urls).map(async ([locale, url]) => {
      try {
        results[locale] = await this.loadFromFile(url);
      } catch (error) {
        console.error(`Failed to load locale ${locale}:`, error);
      }
    });

    await Promise.all(promises);

    return results;
  }

  /**
   * Merge multiple locale files
   */
  public static merge(...tables: StringTable[]): StringTable {
    const merged = new StringTable();

    for (const table of tables) {
      merged.merge(table);
    }

    return merged;
  }

  /**
   * Validate locale structure
   */
  public static validate(data: any): boolean {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    // Check if all leaf values are strings
    const validateNode = (node: any): boolean => {
      if (typeof node === 'string') {
        return true;
      }

      if (typeof node !== 'object' || node === null) {
        return false;
      }

      for (const value of Object.values(node)) {
        if (!validateNode(value)) {
          return false;
        }
      }

      return true;
    };

    return validateNode(data);
  }

  /**
   * Extract keys from locale data
   */
  public static extractKeys(data: StringTableData): string[] {
    const keys: string[] = [];

    const extract = (obj: StringTableData, prefix: string = ''): void => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === 'string') {
          keys.push(fullKey);
        } else if (typeof value === 'object' && value !== null) {
          extract(value, fullKey);
        }
      }
    };

    extract(data);
    return keys;
  }

  /**
   * Compare two locales and find missing keys
   */
  public static findMissingKeys(
    reference: StringTable,
    target: StringTable
  ): string[] {
    const referenceKeys = new Set(reference.getKeys());
    const targetKeys = new Set(target.getKeys());
    const missing: string[] = [];

    for (const key of referenceKeys) {
      if (!targetKeys.has(key)) {
        missing.push(key);
      }
    }

    return missing;
  }

  /**
   * Compare two locales and find extra keys
   */
  public static findExtraKeys(
    reference: StringTable,
    target: StringTable
  ): string[] {
    const referenceKeys = new Set(reference.getKeys());
    const targetKeys = new Set(target.getKeys());
    const extra: string[] = [];

    for (const key of targetKeys) {
      if (!referenceKeys.has(key)) {
        extra.push(key);
      }
    }

    return extra;
  }

  /**
   * Export string table to JSON string
   */
  public static exportToString(table: StringTable, pretty: boolean = false): string {
    const data = table.toJSON();
    return JSON.stringify(data, null, pretty ? 2 : 0);
  }

  /**
   * Export string table to file (browser download)
   */
  public static exportToFile(
    table: StringTable,
    filename: string,
    pretty: boolean = true
  ): void {
    const json = this.exportToString(table, pretty);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }
}
