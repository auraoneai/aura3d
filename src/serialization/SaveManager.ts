import { SaveSlot } from './SaveSlot';
import { Serializer, SerializationFormat } from './Serializer';
import { BinarySerializer } from './BinarySerializer';
import { JSONSerializer } from './JSONSerializer';
import { Compression } from './Compression';
import { Logger } from '../core/Logger';

const logger = Logger.create('SaveManager');

/**
 * Save options
 */
export interface SaveOptions {
  /** Save format */
  format?: SerializationFormat;
  /** Compress save data */
  compress?: boolean;
  /** Include screenshot thumbnail */
  thumbnail?: boolean;
  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Auto-save options
 */
export interface AutoSaveOptions {
  /** Auto-save enabled */
  enabled?: boolean;
  /** Auto-save interval in milliseconds */
  interval?: number;
  /** Maximum number of auto-saves to keep */
  maxAutoSaves?: number;
}

/**
 * Save manager for game state persistence
 * Handles save slots, auto-save, and data migration
 */
export class SaveManager {
  private slots: Map<string, SaveSlot> = new Map();
  private autoSaveTimer: number | null = null;
  private autoSaveOptions: AutoSaveOptions;
  private storageKey: string;

  /**
   * Creates a new save manager
   */
  constructor(storageKey: string = 'g3d_saves', autoSaveOptions: AutoSaveOptions = {}) {
    this.storageKey = storageKey;
    this.autoSaveOptions = {
      enabled: autoSaveOptions.enabled !== false,
      interval: autoSaveOptions.interval || 60000,
      maxAutoSaves: autoSaveOptions.maxAutoSaves || 3
    };

    this.loadSlots();

    if (this.autoSaveOptions.enabled) {
      this.startAutoSave();
    }
  }

  /**
   * Saves game state to a slot
   */
  async save(
    slotId: string,
    data: any,
    options: SaveOptions = {}
  ): Promise<SaveSlot> {
    logger.debug(`Saving to slot: ${slotId}`);

    try {
      const format = options.format || SerializationFormat.JSON;
      let serialized: string | ArrayBuffer;

      if (format === SerializationFormat.BINARY) {
        serialized = BinarySerializer.serialize(data);
      } else {
        serialized = JSONSerializer.stringify(data);
      }

      if (options.compress) {
        serialized = await Compression.compress(
          typeof serialized === 'string'
            ? new TextEncoder().encode(serialized).buffer
            : serialized
        );
      }

      const slot = new SaveSlot(slotId);
      slot.setData(serialized, format);

      if (options.metadata) {
        slot.setMetadata(options.metadata);
      }

      if (options.thumbnail) {
        const thumbnail = await this.captureScreenshot();
        slot.setThumbnail(thumbnail);
      }

      this.slots.set(slotId, slot);
      await this.persistSlots();

      logger.info(`Saved to slot: ${slotId}`);
      return slot;
    } catch (error) {
      logger.error(`Failed to save to slot: ${slotId}`, error);
      throw error;
    }
  }

  /**
   * Loads game state from a slot
   */
  async load(slotId: string): Promise<any> {
    logger.debug(`Loading from slot: ${slotId}`);

    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error(`Save slot not found: ${slotId}`);
    }

    try {
      let data = slot.getData();

      if (slot.isCompressed()) {
        data = await Compression.decompress(data as ArrayBuffer);
      }

      if (slot.getFormat() === SerializationFormat.BINARY) {
        return BinarySerializer.deserialize(data as ArrayBuffer);
      } else {
        const json = typeof data === 'string'
          ? data
          : new TextDecoder().decode(data as ArrayBuffer);
        return JSONSerializer.parse(json);
      }
    } catch (error) {
      logger.error(`Failed to load from slot: ${slotId}`, error);
      throw error;
    }
  }

  /**
   * Deletes a save slot
   */
  async delete(slotId: string): Promise<boolean> {
    const deleted = this.slots.delete(slotId);

    if (deleted) {
      await this.persistSlots();
      logger.info(`Deleted save slot: ${slotId}`);
    }

    return deleted;
  }

  /**
   * Gets all save slots
   */
  getSlots(): SaveSlot[] {
    return Array.from(this.slots.values());
  }

  /**
   * Gets a save slot
   */
  getSlot(slotId: string): SaveSlot | undefined {
    return this.slots.get(slotId);
  }

  /**
   * Checks if a slot exists
   */
  hasSlot(slotId: string): boolean {
    return this.slots.has(slotId);
  }

  /**
   * Auto-saves to a dedicated slot
   */
  async autoSave(data: any): Promise<void> {
    const autoSaveId = `autosave_${Date.now()}`;

    await this.save(autoSaveId, data, {
      format: SerializationFormat.BINARY,
      compress: true,
      metadata: { isAutoSave: true }
    });

    await this.cleanupAutoSaves();
  }

  /**
   * Cleans up old auto-saves
   */
  private async cleanupAutoSaves(): Promise<void> {
    const autoSaves = Array.from(this.slots.values())
      .filter(slot => slot.getMetadata().isAutoSave)
      .sort((a, b) => b.getTimestamp() - a.getTimestamp());

    const maxAutoSaves = this.autoSaveOptions.maxAutoSaves || 3;

    if (autoSaves.length > maxAutoSaves) {
      const toDelete = autoSaves.slice(maxAutoSaves);

      for (const slot of toDelete) {
        await this.delete(slot.getId());
      }
    }
  }

  /**
   * Starts auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      return;
    }

    const interval = this.autoSaveOptions.interval || 60000;

    this.autoSaveTimer = window.setInterval(() => {
      logger.debug('Auto-save triggered');
    }, interval);
  }

  /**
   * Stops auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Loads slots from localStorage
   */
  private loadSlots(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);

      if (stored) {
        const slots = JSON.parse(stored);

        for (const slotData of slots) {
          const slot = SaveSlot.fromJSON(slotData);
          this.slots.set(slot.getId(), slot);
        }

        logger.info(`Loaded ${this.slots.size} save slots`);
      }
    } catch (error) {
      logger.error('Failed to load save slots', error);
    }
  }

  /**
   * Persists slots to localStorage
   */
  private async persistSlots(): Promise<void> {
    try {
      const slots = Array.from(this.slots.values()).map(slot => slot.toJSON());
      localStorage.setItem(this.storageKey, JSON.stringify(slots));
    } catch (error) {
      logger.error('Failed to persist save slots', error);
      throw error;
    }
  }

  /**
   * Captures a screenshot for thumbnail
   */
  private async captureScreenshot(): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 144;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '';
    }

    return canvas.toDataURL('image/jpeg', 0.7);
  }

  /**
   * Disposes the save manager
   */
  dispose(): void {
    this.stopAutoSave();
    this.slots.clear();
  }
}
