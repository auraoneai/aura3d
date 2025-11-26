import { Logger } from '../../core/Logger';

/**
 * Encryption key pair
 */
export interface KeyPair {
  /** Encryption key */
  key: CryptoKey;
  /** Initialization vector */
  iv: Uint8Array;
  /** Key ID for identification */
  keyId: string;
}

/**
 * Encrypted packet
 */
export interface EncryptedPacket {
  /** Encrypted data */
  data: ArrayBuffer;
  /** Initialization vector used */
  iv: Uint8Array;
  /** Authentication tag (for GCM mode) */
  tag?: Uint8Array;
  /** Key ID used for encryption */
  keyId: string;
}

/**
 * Packet encryption configuration
 */
export interface PacketEncryptionConfig {
  /** Encryption algorithm (default: AES-GCM) */
  algorithm?: 'AES-GCM' | 'AES-CBC';
  /** Key length in bits (128, 192, or 256) */
  keyLength?: 128 | 192 | 256;
  /** IV length in bytes (12 for GCM, 16 for CBC) */
  ivLength?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * AES-GCM packet encryption for secure network communication.
 * Provides authenticated encryption with key exchange.
 *
 * @example
 * ```typescript
 * const encryption = new PacketEncryption({
 *   algorithm: 'AES-GCM',
 *   keyLength: 256
 * });
 *
 * // Generate a key
 * const keyPair = await encryption.generateKey();
 *
 * // Encrypt data
 * const packet = { type: 'update', data: [1, 2, 3] };
 * const encrypted = await encryption.encrypt(packet, keyPair);
 *
 * // Decrypt data
 * const decrypted = await encryption.decrypt(encrypted, keyPair);
 * ```
 */
export class PacketEncryption {
  private readonly config: Required<PacketEncryptionConfig>;
  private readonly logger: Logger;
  private readonly keys: Map<string, KeyPair> = new Map();
  private keyIdCounter: number = 0;

  constructor(config: PacketEncryptionConfig = {}) {
    this.config = {
      algorithm: config.algorithm ?? 'AES-GCM',
      keyLength: config.keyLength ?? 256,
      ivLength: config.ivLength ?? (config.algorithm === 'AES-CBC' ? 16 : 12),
      debug: config.debug ?? false
    };
    this.logger = new Logger('PacketEncryption');
  }

  /**
   * Generate a new encryption key
   *
   * @returns Key pair with key, IV, and ID
   */
  public async generateKey(): Promise<KeyPair> {
    const key = await crypto.subtle.generateKey(
      {
        name: this.config.algorithm,
        length: this.config.keyLength
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));
    const keyId = `key_${this.keyIdCounter++}`;

    const keyPair: KeyPair = { key, iv, keyId };
    this.keys.set(keyId, keyPair);

    if (this.config.debug) {
      this.logger.debug(`Generated key ${keyId}`);
    }

    return keyPair;
  }

  /**
   * Import a key from raw bytes
   *
   * @param keyData - Raw key data
   * @param keyId - Optional key ID
   * @returns Key pair
   */
  public async importKey(keyData: ArrayBuffer, keyId?: string): Promise<KeyPair> {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: this.config.algorithm,
        length: this.config.keyLength
      },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));
    const id = keyId ?? `key_${this.keyIdCounter++}`;

    const keyPair: KeyPair = { key, iv, keyId: id };
    this.keys.set(id, keyPair);

    if (this.config.debug) {
      this.logger.debug(`Imported key ${id}`);
    }

    return keyPair;
  }

  /**
   * Export a key to raw bytes
   *
   * @param keyPair - Key pair to export
   * @returns Raw key data
   */
  public async exportKey(keyPair: KeyPair): Promise<ArrayBuffer> {
    return await crypto.subtle.exportKey('raw', keyPair.key);
  }

  /**
   * Encrypt a packet
   *
   * @param data - Data to encrypt (will be JSON serialized)
   * @param keyPair - Key pair to use for encryption
   * @returns Encrypted packet
   */
  public async encrypt(data: any, keyPair: KeyPair): Promise<EncryptedPacket> {
    // Serialize data to JSON then to bytes
    const jsonString = JSON.stringify(data);
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(jsonString);

    // Generate new IV for this packet
    const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));

    // Encrypt
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: this.config.algorithm,
        iv
      },
      keyPair.key,
      plaintext
    );

    const encrypted: EncryptedPacket = {
      data: encryptedData,
      iv,
      keyId: keyPair.keyId
    };

    if (this.config.debug) {
      this.logger.debug(
        `Encrypted ${plaintext.length} bytes to ${encryptedData.byteLength} bytes`
      );
    }

    return encrypted;
  }

  /**
   * Decrypt a packet
   *
   * @param packet - Encrypted packet
   * @param keyPair - Key pair to use for decryption
   * @returns Decrypted data (parsed from JSON)
   */
  public async decrypt(packet: EncryptedPacket, keyPair: KeyPair): Promise<any> {
    // Decrypt
    const algorithm = this.config.algorithm === 'AES-GCM'
      ? { name: this.config.algorithm, iv: packet.iv }
      : { name: this.config.algorithm, iv: packet.iv };

    const decryptedData = await crypto.subtle.decrypt(
      algorithm as AesGcmParams | AesCbcParams,
      keyPair.key,
      packet.data
    );

    // Deserialize from bytes to JSON
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decryptedData);
    const data = JSON.parse(jsonString);

    if (this.config.debug) {
      this.logger.debug(
        `Decrypted ${packet.data.byteLength} bytes to ${decryptedData.byteLength} bytes`
      );
    }

    return data;
  }

  /**
   * Encrypt raw binary data
   *
   * @param data - Binary data to encrypt
   * @param keyPair - Key pair to use
   * @returns Encrypted packet
   */
  public async encryptBinary(
    data: ArrayBuffer,
    keyPair: KeyPair
  ): Promise<EncryptedPacket> {
    const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));

    const encryptedData = await crypto.subtle.encrypt(
      {
        name: this.config.algorithm,
        iv
      },
      keyPair.key,
      data
    );

    return {
      data: encryptedData,
      iv,
      keyId: keyPair.keyId
    };
  }

  /**
   * Decrypt raw binary data
   *
   * @param packet - Encrypted packet
   * @param keyPair - Key pair to use
   * @returns Decrypted binary data
   */
  public async decryptBinary(
    packet: EncryptedPacket,
    keyPair: KeyPair
  ): Promise<ArrayBuffer> {
    const algorithm = this.config.algorithm === 'AES-GCM'
      ? { name: this.config.algorithm, iv: packet.iv }
      : { name: this.config.algorithm, iv: packet.iv };

    return await crypto.subtle.decrypt(
      algorithm as AesGcmParams | AesCbcParams,
      keyPair.key,
      packet.data
    );
  }

  /**
   * Get a key by ID
   *
   * @param keyId - Key ID
   * @returns Key pair or undefined
   */
  public getKey(keyId: string): KeyPair | undefined {
    return this.keys.get(keyId);
  }

  /**
   * Remove a key
   *
   * @param keyId - Key ID to remove
   * @returns True if key was removed
   */
  public removeKey(keyId: string): boolean {
    const removed = this.keys.delete(keyId);

    if (removed && this.config.debug) {
      this.logger.debug(`Removed key ${keyId}`);
    }

    return removed;
  }

  /**
   * Serialize encrypted packet for transmission
   *
   * @param packet - Encrypted packet
   * @returns Serialized bytes
   */
  public serializePacket(packet: EncryptedPacket): ArrayBuffer {
    // Format: [keyId length (1 byte)][keyId][iv length (1 byte)][iv][data]
    const keyIdBytes = new TextEncoder().encode(packet.keyId);
    const totalLength = 1 + keyIdBytes.length + 1 + packet.iv.length + packet.data.byteLength;

    const buffer = new ArrayBuffer(totalLength);
    const view = new Uint8Array(buffer);
    let offset = 0;

    // Write keyId
    view[offset++] = keyIdBytes.length;
    view.set(keyIdBytes, offset);
    offset += keyIdBytes.length;

    // Write IV
    view[offset++] = packet.iv.length;
    view.set(packet.iv, offset);
    offset += packet.iv.length;

    // Write encrypted data
    view.set(new Uint8Array(packet.data), offset);

    return buffer;
  }

  /**
   * Deserialize encrypted packet from transmission
   *
   * @param buffer - Serialized bytes
   * @returns Encrypted packet
   */
  public deserializePacket(buffer: ArrayBuffer): EncryptedPacket {
    const view = new Uint8Array(buffer);
    let offset = 0;

    // Read keyId
    const keyIdLength = view[offset++];
    const keyIdBytes = view.slice(offset, offset + keyIdLength);
    const keyId = new TextDecoder().decode(keyIdBytes);
    offset += keyIdLength;

    // Read IV
    const ivLength = view[offset++];
    const iv = view.slice(offset, offset + ivLength);
    offset += ivLength;

    // Read encrypted data
    const data = buffer.slice(offset);

    return { data, iv, keyId };
  }

  /**
   * Generate a shared secret using Diffie-Hellman key exchange
   * Note: This is a simplified implementation
   *
   * @returns Public/private key pair for key exchange
   */
  public async generateKeyExchangePair(): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
  }> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey']
    );

    if (this.config.debug) {
      this.logger.debug('Generated ECDH key pair for key exchange');
    }

    return keyPair;
  }

  /**
   * Derive shared encryption key from key exchange
   *
   * @param privateKey - Own private key
   * @param publicKey - Remote public key
   * @returns Shared encryption key pair
   */
  public async deriveSharedKey(
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ): Promise<KeyPair> {
    const sharedKey = await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: publicKey
      },
      privateKey,
      {
        name: this.config.algorithm,
        length: this.config.keyLength
      },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));
    const keyId = `shared_${this.keyIdCounter++}`;

    const keyPair: KeyPair = { key: sharedKey, iv, keyId };
    this.keys.set(keyId, keyPair);

    if (this.config.debug) {
      this.logger.debug(`Derived shared key ${keyId}`);
    }

    return keyPair;
  }

  /**
   * Export public key for key exchange
   *
   * @param publicKey - Public key to export
   * @returns Raw public key data
   */
  public async exportPublicKey(publicKey: CryptoKey): Promise<ArrayBuffer> {
    return await crypto.subtle.exportKey('raw', publicKey);
  }

  /**
   * Import public key for key exchange
   *
   * @param keyData - Raw public key data
   * @returns Public key
   */
  public async importPublicKey(keyData: ArrayBuffer): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      []
    );
  }

  /**
   * Clear all stored keys
   */
  public clearKeys(): void {
    this.keys.clear();
    if (this.config.debug) {
      this.logger.debug('All keys cleared');
    }
  }

  /**
   * Get encryption statistics
   */
  public getStats(): {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    keyCount: number;
  } {
    return {
      algorithm: this.config.algorithm,
      keyLength: this.config.keyLength,
      ivLength: this.config.ivLength,
      keyCount: this.keys.size
    };
  }
}
