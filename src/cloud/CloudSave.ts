/**
 * G3D Cloud Save
 * Cloud save synchronization with conflict resolution
 * @module Cloud
 */

import { CloudManager, CloudError } from './CloudManager';

/**
 * Save data
 */
export interface SaveData {
  /** Save ID */
  id: string;
  /** User ID */
  userId: string;
  /** Save data */
  data: any;
  /** Version number */
  version: number;
  /** Last modified timestamp */
  lastModified: number;
  /** Checksum */
  checksum?: string;
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolution = 'last-write-wins' | 'merge' | 'manual';

/**
 * Sync status
 */
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'conflict' | 'error';

/**
 * Cloud save configuration
 */
export interface CloudSaveConfig {
  /** Auto-sync interval (ms), 0 to disable */
  autoSyncInterval: number;
  /** Conflict resolution strategy */
  conflictResolution: ConflictResolution;
  /** Enable compression */
  compression: boolean;
  /** Maximum save size (bytes) */
  maxSaveSize: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CloudSaveConfig = {
  autoSyncInterval: 60000, // 1 minute
  conflictResolution: 'last-write-wins',
  compression: true,
  maxSaveSize: 10485760 // 10 MB
};

/**
 * Cloud Save Service
 * Manages cloud save synchronization
 */
export class CloudSave {
  private cloudManager: CloudManager;
  private config: CloudSaveConfig;
  private localSave: SaveData | null = null;
  private syncStatus: SyncStatus = 'synced';
  private offlineQueue: Array<{ data: any; timestamp: number }> = [];
  private syncTimer: number | null = null;
  private readonly STORAGE_KEY = 'g3d_local_save';

  constructor(cloudManager: CloudManager, config?: Partial<CloudSaveConfig>) {
    this.cloudManager = cloudManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadLocalSave();

    if (this.config.autoSyncInterval > 0) {
      this.startAutoSync();
    }
  }

  /**
   * Upload save data
   */
  public async upload(data: any, saveId: string = 'default'): Promise<SaveData> {
    if (!this.cloudManager.isConnected()) {
      return this.queueForUpload(data);
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    // Validate size
    const size = new Blob([JSON.stringify(data)]).size;
    if (size > this.config.maxSaveSize) {
      throw new CloudError(
        `Save data too large: ${size} bytes (max: ${this.config.maxSaveSize})`,
        'SAVE_TOO_LARGE'
      );
    }

    this.syncStatus = 'syncing';

    try {
      const payload = this.config.compression ? this.compressData(data) : data;

      const response = await this.cloudManager.requestWithRetry<SaveData>(
        `/save/${saveId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            data: payload,
            version: (this.localSave?.version || 0) + 1,
            checksum: this.calculateChecksum(data)
          })
        }
      );

      this.localSave = response;
      this.saveLocal();
      this.syncStatus = 'synced';

      console.log('[CloudSave] Upload successful:', saveId);
      return response;
    } catch (error: any) {
      this.syncStatus = 'error';
      throw new CloudError(
        error.message || 'Failed to upload save',
        'SAVE_UPLOAD_FAILED'
      );
    }
  }

  /**
   * Download save data
   */
  public async download(saveId: string = 'default'): Promise<SaveData> {
    if (!this.cloudManager.isConnected()) {
      if (this.localSave) {
        return this.localSave;
      }
      throw new CloudError('Offline and no local save available', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    this.syncStatus = 'syncing';

    try {
      const response = await this.cloudManager.requestWithRetry<SaveData>(
        `/save/${saveId}`,
        { method: 'GET' }
      );

      // Decompress if needed
      if (this.config.compression && response.data) {
        response.data = this.decompressData(response.data);
      }

      // Check for conflicts
      if (this.localSave && this.localSave.version > response.version) {
        this.syncStatus = 'conflict';
        return this.resolveConflict(this.localSave, response);
      }

      this.localSave = response;
      this.saveLocal();
      this.syncStatus = 'synced';

      console.log('[CloudSave] Download successful:', saveId);
      return response;
    } catch (error: any) {
      this.syncStatus = 'error';

      // Return local save if available
      if (this.localSave) {
        console.warn('[CloudSave] Using local save due to error');
        return this.localSave;
      }

      throw new CloudError(
        error.message || 'Failed to download save',
        'SAVE_DOWNLOAD_FAILED'
      );
    }
  }

  /**
   * Synchronize save data
   */
  public async sync(saveId: string = 'default'): Promise<SaveData> {
    if (!this.cloudManager.isConnected()) {
      this.syncStatus = 'pending';
      throw new CloudError('Cannot sync while offline', 'OFFLINE');
    }

    this.syncStatus = 'syncing';

    try {
      // Download latest version
      const cloudSave = await this.download(saveId);

      // Upload if local is newer
      if (this.localSave && this.localSave.version > cloudSave.version) {
        return await this.upload(this.localSave.data, saveId);
      }

      this.syncStatus = 'synced';
      return cloudSave;
    } catch (error: any) {
      this.syncStatus = 'error';
      throw error;
    }
  }

  /**
   * Delete save data
   */
  public async delete(saveId: string = 'default'): Promise<void> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot delete while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    try {
      await this.cloudManager.requestWithRetry(`/save/${saveId}`, {
        method: 'DELETE'
      });

      this.localSave = null;
      this.clearLocal();

      console.log('[CloudSave] Delete successful:', saveId);
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to delete save',
        'SAVE_DELETE_FAILED'
      );
    }
  }

  /**
   * Get sync status
   */
  public getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  /**
   * Get local save
   */
  public getLocalSave(): SaveData | null {
    return this.localSave;
  }

  /**
   * Process offline queue
   */
  public async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) {
      return;
    }

    console.log(`[CloudSave] Processing ${this.offlineQueue.length} queued saves`);

    // Get latest queued save
    const latest = this.offlineQueue[this.offlineQueue.length - 1];
    this.offlineQueue = [];

    try {
      await this.upload(latest.data);
    } catch (error) {
      console.error('[CloudSave] Failed to process offline queue:', error);
    }
  }

  /**
   * Queue save for upload when online
   */
  private queueForUpload(data: any): SaveData {
    this.offlineQueue.push({
      data,
      timestamp: Date.now()
    });

    this.syncStatus = 'pending';

    // Update local save
    const saveData: SaveData = {
      id: 'local',
      userId: this.cloudManager.auth.getCurrentUser()?.id || 'offline',
      data,
      version: (this.localSave?.version || 0) + 1,
      lastModified: Date.now()
    };

    this.localSave = saveData;
    this.saveLocal();

    console.log('[CloudSave] Queued for upload (offline)');
    return saveData;
  }

  /**
   * Resolve conflict between local and cloud saves
   */
  private async resolveConflict(local: SaveData, cloud: SaveData): Promise<SaveData> {
    console.warn('[CloudSave] Conflict detected, applying resolution strategy:', this.config.conflictResolution);

    switch (this.config.conflictResolution) {
      case 'last-write-wins':
        return local.lastModified > cloud.lastModified ? local : cloud;

      case 'merge':
        return this.mergeSaves(local, cloud);

      case 'manual':
        throw new CloudError(
          'Manual conflict resolution required',
          'SAVE_CONFLICT',
          409
        );

      default:
        return local;
    }
  }

  /**
   * Merge two save files (deep merge)
   */
  private mergeSaves(local: SaveData, cloud: SaveData): SaveData {
    const merged = {
      ...local,
      data: this.deepMerge(local.data, cloud.data),
      version: Math.max(local.version, cloud.version) + 1,
      lastModified: Date.now()
    };

    this.localSave = merged;
    this.saveLocal();

    return merged;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    if (typeof target !== 'object' || typeof source !== 'object') {
      return source;
    }

    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Compress data (simplified)
   */
  private compressData(data: any): string {
    // In production, use pako or similar compression library
    return JSON.stringify(data);
  }

  /**
   * Decompress data (simplified)
   */
  private decompressData(data: string): any {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  /**
   * Calculate checksum
   */
  private calculateChecksum(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Start auto-sync
   */
  private startAutoSync(): void {
    this.syncTimer = window.setInterval(() => {
      if (this.cloudManager.isConnected() && this.syncStatus !== 'syncing') {
        this.sync().catch(error => {
          console.warn('[CloudSave] Auto-sync failed:', error);
        });
      }
    }, this.config.autoSyncInterval);
  }

  /**
   * Stop auto-sync
   */
  private stopAutoSync(): void {
    if (this.syncTimer !== null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Save to local storage
   */
  private saveLocal(): void {
    if (typeof localStorage === 'undefined' || !this.localSave) {
      return;
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.localSave));
    } catch (error) {
      console.warn('[CloudSave] Failed to save locally:', error);
    }
  }

  /**
   * Load from local storage
   */
  private loadLocalSave(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        this.localSave = JSON.parse(data);
      }
    } catch (error) {
      console.warn('[CloudSave] Failed to load local save:', error);
    }
  }

  /**
   * Clear local storage
   */
  private clearLocal(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('[CloudSave] Failed to clear local save:', error);
    }
  }

  /**
   * Dispose cloud save
   */
  public dispose(): void {
    this.stopAutoSync();
    this.offlineQueue = [];
  }
}
