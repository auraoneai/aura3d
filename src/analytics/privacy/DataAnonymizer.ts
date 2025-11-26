/**
 * G3D Data Anonymizer
 * Anonymizes and redacts sensitive data for privacy compliance
 * @module Analytics/Privacy
 */

import * as crypto from 'crypto';

/**
 * Anonymization configuration
 */
export interface AnonymizationConfig {
  /** Hash algorithm */
  hashAlgorithm: 'sha256' | 'sha512' | 'md5';
  /** Salt for hashing */
  salt: string;
  /** IP anonymization level (0-4 octets to remove) */
  ipAnonymizationLevel: number;
  /** PII patterns to redact */
  piiPatterns: RegExp[];
  /** Fields to always redact */
  redactFields: Set<string>;
  /** Fields to hash */
  hashFields: Set<string>;
}

/**
 * Default PII patterns
 */
const DEFAULT_PII_PATTERNS = [
  // Email
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Phone numbers
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  /\b\(\d{3}\)\s?\d{3}[-.]?\d{4}\b/g,
  // Credit card numbers
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  // Social Security Numbers
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // IP addresses (will be handled separately)
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
];

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AnonymizationConfig = {
  hashAlgorithm: 'sha256',
  salt: 'g3d_analytics_salt',
  ipAnonymizationLevel: 1, // Remove last octet
  piiPatterns: DEFAULT_PII_PATTERNS,
  redactFields: new Set(['password', 'ssn', 'creditCard', 'apiKey', 'token', 'secret']),
  hashFields: new Set(['userId', 'email', 'ip'])
};

/**
 * Data Anonymizer
 * Anonymizes and redacts sensitive data
 */
export class DataAnonymizer {
  private config: AnonymizationConfig;

  constructor(config?: Partial<AnonymizationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Anonymize user ID
   */
  public anonymizeUserId(userId: string): string {
    return this.hash(userId);
  }

  /**
   * Anonymize email address
   */
  public anonymizeEmail(email: string): string {
    // Hash the entire email
    return this.hash(email);
  }

  /**
   * Anonymize IP address
   */
  public anonymizeIP(ip: string): string {
    // Validate IP
    if (!this.isValidIP(ip)) {
      return '[INVALID_IP]';
    }

    // Split into octets
    const octets = ip.split('.');

    // Remove octets based on anonymization level
    const anonymized = octets.slice(0, 4 - this.config.ipAnonymizationLevel);

    // Pad with zeros
    while (anonymized.length < 4) {
      anonymized.push('0');
    }

    return anonymized.join('.');
  }

  /**
   * Anonymize data object
   */
  public anonymizeData<T extends Record<string, any>>(data: T): T {
    const anonymized = { ...data };

    for (const [key, value] of Object.entries(anonymized)) {
      // Check if field should be redacted
      if (this.config.redactFields.has(key)) {
        anonymized[key] = '[REDACTED]';
        continue;
      }

      // Check if field should be hashed
      if (this.config.hashFields.has(key)) {
        if (typeof value === 'string') {
          anonymized[key] = this.hash(value);
        }
        continue;
      }

      // Anonymize based on field name
      if (typeof value === 'string') {
        if (key.toLowerCase().includes('email')) {
          anonymized[key] = this.anonymizeEmail(value);
        } else if (key.toLowerCase().includes('ip')) {
          anonymized[key] = this.anonymizeIP(value);
        } else {
          // Check for PII patterns
          anonymized[key] = this.redactPII(value);
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively anonymize nested objects
        anonymized[key] = this.anonymizeData(value);
      } else if (Array.isArray(value)) {
        // Anonymize array items
        anonymized[key] = value.map(item =>
          typeof item === 'object' && item !== null
            ? this.anonymizeData(item)
            : this.redactPII(String(item))
        );
      }
    }

    return anonymized;
  }

  /**
   * Redact PII from text
   */
  public redactPII(text: string): string {
    let redacted = text;

    for (const pattern of this.config.piiPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }

    return redacted;
  }

  /**
   * Hash a value
   */
  public hash(value: string): string {
    if (typeof crypto.createHash === 'function') {
      // Node.js environment
      return crypto
        .createHash(this.config.hashAlgorithm)
        .update(value + this.config.salt)
        .digest('hex');
    } else {
      // Browser environment - use Web Crypto API or fallback
      return this.browserHash(value);
    }
  }

  /**
   * Browser-compatible hash (simple hash for demonstration)
   */
  private browserHash(value: string): string {
    const str = value + this.config.salt;
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Validate IP address
   */
  private isValidIP(ip: string): boolean {
    const pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return pattern.test(ip);
  }

  /**
   * Add PII pattern
   */
  public addPIIPattern(pattern: RegExp): void {
    this.config.piiPatterns.push(pattern);
  }

  /**
   * Add field to redact
   */
  public addRedactField(field: string): void {
    this.config.redactFields.add(field);
  }

  /**
   * Add field to hash
   */
  public addHashField(field: string): void {
    this.config.hashFields.add(field);
  }

  /**
   * Remove field from redaction
   */
  public removeRedactField(field: string): void {
    this.config.redactFields.delete(field);
  }

  /**
   * Remove field from hashing
   */
  public removeHashField(field: string): void {
    this.config.hashFields.delete(field);
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AnonymizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<AnonymizationConfig> {
    return {
      ...this.config,
      redactFields: new Set(this.config.redactFields),
      hashFields: new Set(this.config.hashFields)
    };
  }

  /**
   * Pseudonymize data (reversible with key)
   */
  public pseudonymize(value: string, key: string): string {
    // Simple XOR-based pseudonymization (for demonstration)
    let result = '';
    for (let i = 0; i < value.length; i++) {
      const charCode = value.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return Buffer.from(result).toString('base64');
  }

  /**
   * Depseudonymize data
   */
  public depseudonymize(pseudonymized: string, key: string): string {
    const decoded = Buffer.from(pseudonymized, 'base64').toString();
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  }

  /**
   * Mask sensitive data (show partial)
   */
  public mask(value: string, showFirst: number = 2, showLast: number = 2, maskChar: string = '*'): string {
    if (value.length <= showFirst + showLast) {
      return maskChar.repeat(value.length);
    }

    const first = value.substring(0, showFirst);
    const last = value.substring(value.length - showLast);
    const middle = maskChar.repeat(value.length - showFirst - showLast);

    return first + middle + last;
  }

  /**
   * Tokenize sensitive data
   */
  public tokenize(value: string): { token: string; original: string } {
    const token = this.hash(value + Date.now());
    return { token, original: value };
  }

  /**
   * Remove direct identifiers
   */
  public removeIdentifiers<T extends Record<string, any>>(data: T): Partial<T> {
    const identifierFields = [
      'id',
      'userId',
      'user_id',
      'email',
      'phone',
      'name',
      'firstName',
      'lastName',
      'address',
      'ssn',
      'ip',
      'ipAddress'
    ];

    const cleaned = { ...data };

    for (const field of identifierFields) {
      if (field in cleaned) {
        delete cleaned[field];
      }
    }

    return cleaned;
  }

  /**
   * K-anonymity check (simplified)
   */
  public checkKAnonymity<T extends Record<string, any>>(
    dataset: T[],
    quasiIdentifiers: string[],
    k: number = 5
  ): boolean {
    const groups = new Map<string, number>();

    for (const record of dataset) {
      // Create key from quasi-identifiers
      const key = quasiIdentifiers
        .map(field => record[field])
        .join('|');

      groups.set(key, (groups.get(key) || 0) + 1);
    }

    // Check if all groups have at least k records
    for (const count of groups.values()) {
      if (count < k) {
        return false;
      }
    }

    return true;
  }
}
