/**
 * G3D CSV Locale Loader
 * Loads locale data from CSV files
 * @module Localization/Loaders
 */

import { StringTable } from '../StringTable';

/**
 * CSV column mapping
 */
export interface CSVColumnMapping {
  /** Key column index */
  keyColumn: number;
  /** Locale columns (locale code -> column index) */
  localeColumns: Record<string, number>;
}

/**
 * CSV Locale Loader
 * Loads and parses CSV locale files
 * Format: Key,en-US,es-ES,fr-FR,...
 */
export class CSVLocaleLoader {
  /**
   * Load locales from CSV file
   */
  public static async loadFromFile(
    url: string,
    mapping?: Partial<CSVColumnMapping>
  ): Promise<Record<string, StringTable>> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to load CSV file: ${response.status} ${response.statusText}`);
      }

      const csv = await response.text();
      return this.loadFromString(csv, mapping);
    } catch (error: any) {
      throw new Error(`Failed to load CSV from ${url}: ${error.message}`);
    }
  }

  /**
   * Load locales from CSV string
   */
  public static loadFromString(
    csv: string,
    mapping?: Partial<CSVColumnMapping>
  ): Record<string, StringTable> {
    const lines = csv.split('\n').filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Parse header
    const header = this.parseCSVLine(lines[0]);
    const columnMapping = this.createColumnMapping(header, mapping);

    // Initialize string tables for each locale
    const tables: Record<string, StringTable> = {};
    for (const locale of Object.keys(columnMapping.localeColumns)) {
      tables[locale] = new StringTable();
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) {
        continue; // Skip empty lines and comments
      }

      const columns = this.parseCSVLine(line);
      const key = columns[columnMapping.keyColumn]?.trim();

      if (!key) {
        console.warn(`Row ${i + 1}: Missing key`);
        continue;
      }

      // Add translations to each locale
      for (const [locale, columnIndex] of Object.entries(columnMapping.localeColumns)) {
        const value = columns[columnIndex]?.trim();
        if (value) {
          tables[locale].set(key, value);
        }
      }
    }

    return tables;
  }

  /**
   * Load single locale from CSV
   */
  public static async loadSingleLocale(
    url: string,
    locale: string,
    keyColumn: number = 0,
    valueColumn: number = 1
  ): Promise<StringTable> {
    const response = await fetch(url);
    const csv = await response.text();

    const table = new StringTable();
    const lines = csv.split('\n');

    // Skip header (first line)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const columns = this.parseCSVLine(line);
      const key = columns[keyColumn]?.trim();
      const value = columns[valueColumn]?.trim();

      if (key && value) {
        table.set(key, value);
      }
    }

    return table;
  }

  /**
   * Export string tables to CSV
   */
  public static exportToCSV(
    tables: Record<string, StringTable>,
    includeHeader: boolean = true
  ): string {
    const locales = Object.keys(tables);

    if (locales.length === 0) {
      throw new Error('No locales to export');
    }

    // Collect all unique keys
    const allKeys = new Set<string>();
    for (const table of Object.values(tables)) {
      for (const key of table.getKeys()) {
        allKeys.add(key);
      }
    }

    const sortedKeys = Array.from(allKeys).sort();

    // Build CSV
    const lines: string[] = [];

    // Header
    if (includeHeader) {
      const header = ['Key', ...locales];
      lines.push(this.escapeCSVLine(header));
    }

    // Data rows
    for (const key of sortedKeys) {
      const row = [key];

      for (const locale of locales) {
        const value = tables[locale].get(key) || '';
        row.push(value);
      }

      lines.push(this.escapeCSVLine(row));
    }

    return lines.join('\n');
  }

  /**
   * Export string tables to CSV file (browser download)
   */
  public static exportToFile(
    tables: Record<string, StringTable>,
    filename: string,
    includeHeader: boolean = true
  ): void {
    const csv = this.exportToCSV(tables, includeHeader);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Parse CSV line (handles quotes and escapes)
   */
  private static parseCSVLine(line: string): string[] {
    const columns: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Column separator
        columns.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add last column
    columns.push(current);

    return columns;
  }

  /**
   * Escape CSV line (add quotes and escape special characters)
   */
  private static escapeCSVLine(columns: string[]): string {
    return columns
      .map(col => {
        // Check if escaping is needed
        if (col.includes(',') || col.includes('"') || col.includes('\n')) {
          // Escape quotes and wrap in quotes
          return `"${col.replace(/"/g, '""')}"`;
        }
        return col;
      })
      .join(',');
  }

  /**
   * Create column mapping from header
   */
  private static createColumnMapping(
    header: string[],
    custom?: Partial<CSVColumnMapping>
  ): CSVColumnMapping {
    if (custom?.localeColumns) {
      return {
        keyColumn: custom.keyColumn ?? 0,
        localeColumns: custom.localeColumns
      };
    }

    // Auto-detect from header
    const localeColumns: Record<string, number> = {};

    for (let i = 1; i < header.length; i++) {
      const locale = header[i].trim();
      if (locale) {
        localeColumns[locale] = i;
      }
    }

    return {
      keyColumn: 0,
      localeColumns
    };
  }

  /**
   * Validate CSV structure
   */
  public static validate(csv: string): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = csv.split('\n').filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      errors.push('CSV file is empty');
      return { valid: false, errors, warnings };
    }

    // Parse header
    const header = this.parseCSVLine(lines[0]);

    if (header.length < 2) {
      errors.push('CSV must have at least 2 columns (Key and one locale)');
    }

    // Check for duplicate locale columns
    const locales = new Set<string>();
    for (let i = 1; i < header.length; i++) {
      const locale = header[i].trim();
      if (locales.has(locale)) {
        warnings.push(`Duplicate locale column: ${locale}`);
      }
      locales.add(locale);
    }

    // Check data rows
    const keys = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const columns = this.parseCSVLine(line);
      const key = columns[0]?.trim();

      if (!key) {
        warnings.push(`Row ${i + 1}: Missing key`);
        continue;
      }

      if (keys.has(key)) {
        warnings.push(`Row ${i + 1}: Duplicate key "${key}"`);
      }
      keys.add(key);

      if (columns.length !== header.length) {
        warnings.push(
          `Row ${i + 1}: Column count mismatch (expected ${header.length}, got ${columns.length})`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}
