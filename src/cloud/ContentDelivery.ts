/**
 * G3D Content Delivery Network Integration
 * CDN integration for asset delivery
 * @module Cloud
 */

import { CloudManager, CloudError } from './CloudManager';

/**
 * Asset metadata
 */
export interface AssetMetadata {
  /** Asset ID */
  id: string;
  /** Asset name */
  name: string;
  /** File path */
  path: string;
  /** File size (bytes) */
  size: number;
  /** Content type */
  contentType: string;
  /** Version/hash */
  version: string;
  /** CDN URL */
  url: string;
  /** Last modified */
  lastModified: number;
}

/**
 * Download progress callback
 */
export type DownloadProgressCallback = (progress: {
  loaded: number;
  total: number;
  percentage: number;
}) => void;

/**
 * CDN configuration
 */
export interface CDNConfig {
  /** CDN base URL */
  baseUrl: string;
  /** Use versioned URLs */
  versionedUrls: boolean;
  /** Cache control */
  cacheControl: string;
  /** Enable fallback to origin */
  enableFallback: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<CDNConfig> = {
  versionedUrls: true,
  cacheControl: 'public, max-age=31536000',
  enableFallback: true
};

/**
 * Content Delivery Service
 * Manages CDN integration for asset delivery
 */
export class ContentDelivery {
  private cloudManager: CloudManager;
  private config: CDNConfig;
  private assetCache: Map<string, AssetMetadata> = new Map();
  private downloadCache: Map<string, ArrayBuffer> = new Map();

  constructor(cloudManager: CloudManager, config?: Partial<CDNConfig>) {
    this.cloudManager = cloudManager;
    this.config = {
      ...DEFAULT_CONFIG,
      baseUrl: cloudManager.getConfig().apiEndpoint.replace('/api', '/cdn'),
      ...config
    } as CDNConfig;
  }

  /**
   * Get asset metadata
   */
  public async getAssetMetadata(assetId: string): Promise<AssetMetadata> {
    // Check cache
    const cached = this.assetCache.get(assetId);
    if (cached) {
      return cached;
    }

    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot get asset metadata while offline', 'OFFLINE');
    }

    try {
      const response = await this.cloudManager.requestWithRetry<AssetMetadata>(
        `/cdn/assets/${assetId}/metadata`,
        { method: 'GET' }
      );

      this.assetCache.set(assetId, response);
      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to get asset metadata',
        'CDN_METADATA_FAILED'
      );
    }
  }

  /**
   * Get asset URL
   */
  public async getAssetURL(assetId: string): Promise<string> {
    const metadata = await this.getAssetMetadata(assetId);
    return this.buildURL(metadata);
  }

  /**
   * Get asset URL by path
   */
  public getAssetURLByPath(path: string, version?: string): string {
    let url = `${this.config.baseUrl}/${path}`;

    if (this.config.versionedUrls && version) {
      url += `?v=${version}`;
    }

    return url;
  }

  /**
   * Download asset
   */
  public async downloadAsset(
    assetId: string,
    onProgress?: DownloadProgressCallback
  ): Promise<ArrayBuffer> {
    // Check download cache
    const cached = this.downloadCache.get(assetId);
    if (cached) {
      return cached;
    }

    const url = await this.getAssetURL(assetId);

    try {
      const response = await this.fetchWithProgress(url, onProgress);
      const buffer = await response.arrayBuffer();

      // Cache the download
      this.downloadCache.set(assetId, buffer);

      console.log('[CDN] Downloaded asset:', assetId);
      return buffer;
    } catch (error: any) {
      // Try fallback if enabled
      if (this.config.enableFallback) {
        return await this.downloadFromFallback(assetId, onProgress);
      }

      throw new CloudError(
        error.message || 'Failed to download asset',
        'CDN_DOWNLOAD_FAILED'
      );
    }
  }

  /**
   * Download asset as blob
   */
  public async downloadAssetAsBlob(
    assetId: string,
    onProgress?: DownloadProgressCallback
  ): Promise<Blob> {
    const buffer = await this.downloadAsset(assetId, onProgress);
    const metadata = await this.getAssetMetadata(assetId);

    return new Blob([buffer], { type: metadata.contentType });
  }

  /**
   * Download asset as text
   */
  public async downloadAssetAsText(
    assetId: string,
    onProgress?: DownloadProgressCallback
  ): Promise<string> {
    const buffer = await this.downloadAsset(assetId, onProgress);
    return new TextDecoder().decode(buffer);
  }

  /**
   * Download asset as JSON
   */
  public async downloadAssetAsJSON<T = any>(
    assetId: string,
    onProgress?: DownloadProgressCallback
  ): Promise<T> {
    const text = await this.downloadAssetAsText(assetId, onProgress);
    return JSON.parse(text) as T;
  }

  /**
   * Download asset as data URL
   */
  public async downloadAssetAsDataURL(
    assetId: string,
    onProgress?: DownloadProgressCallback
  ): Promise<string> {
    const blob = await this.downloadAssetAsBlob(assetId, onProgress);
    return await this.blobToDataURL(blob);
  }

  /**
   * Preload assets
   */
  public async preloadAssets(
    assetIds: string[],
    onProgress?: (assetId: string, progress: number) => void
  ): Promise<void> {
    console.log(`[CDN] Preloading ${assetIds.length} assets`);

    const promises = assetIds.map(async (assetId, index) => {
      try {
        await this.downloadAsset(assetId, progress => {
          if (onProgress) {
            onProgress(assetId, progress.percentage);
          }
        });
      } catch (error) {
        console.warn(`[CDN] Failed to preload asset ${assetId}:`, error);
      }
    });

    await Promise.all(promises);
    console.log('[CDN] Preload complete');
  }

  /**
   * Upload asset (admin)
   */
  public async uploadAsset(
    file: File | Blob,
    path: string,
    onProgress?: DownloadProgressCallback
  ): Promise<AssetMetadata> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot upload asset while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);

      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable && onProgress) {
            onProgress({
              loaded: e.loaded,
              total: e.total,
              percentage: (e.loaded / e.total) * 100
            });
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            this.assetCache.set(response.id, response);
            console.log('[CDN] Upload complete:', response.id);
            resolve(response);
          } else {
            reject(new CloudError('Upload failed', 'CDN_UPLOAD_FAILED', xhr.status));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new CloudError('Upload error', 'CDN_UPLOAD_ERROR'));
        });

        const token = this.cloudManager.auth.getToken();
        const cloudConfig = this.cloudManager.getConfig();

        xhr.open('POST', `${cloudConfig.apiEndpoint}/cdn/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('X-API-Key', cloudConfig.apiKey);
        xhr.send(formData);
      });
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to upload asset',
        'CDN_UPLOAD_FAILED'
      );
    }
  }

  /**
   * Delete asset (admin)
   */
  public async deleteAsset(assetId: string): Promise<void> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot delete asset while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    try {
      await this.cloudManager.requestWithRetry(`/cdn/assets/${assetId}`, {
        method: 'DELETE'
      });

      this.assetCache.delete(assetId);
      this.downloadCache.delete(assetId);

      console.log('[CDN] Asset deleted:', assetId);
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to delete asset',
        'CDN_DELETE_FAILED'
      );
    }
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.assetCache.clear();
    this.downloadCache.clear();
    console.log('[CDN] Cache cleared');
  }

  /**
   * Clear download cache only
   */
  public clearDownloadCache(): void {
    this.downloadCache.clear();
    console.log('[CDN] Download cache cleared');
  }

  /**
   * Get cache size (approximate)
   */
  public getCacheSize(): number {
    let size = 0;
    for (const buffer of this.downloadCache.values()) {
      size += buffer.byteLength;
    }
    return size;
  }

  /**
   * Build CDN URL
   */
  private buildURL(metadata: AssetMetadata): string {
    let url = `${this.config.baseUrl}/${metadata.path}`;

    if (this.config.versionedUrls) {
      url += `?v=${metadata.version}`;
    }

    return url;
  }

  /**
   * Fetch with progress tracking
   */
  private async fetchWithProgress(
    url: string,
    onProgress?: DownloadProgressCallback
  ): Promise<Response> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!onProgress || !response.body) {
      return response;
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      loaded += value.length;

      onProgress({
        loaded,
        total: contentLength,
        percentage: contentLength > 0 ? (loaded / contentLength) * 100 : 0
      });
    }

    // Reconstruct response
    const allChunks = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return new Response(allChunks, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  /**
   * Download from fallback (origin)
   */
  private async downloadFromFallback(
    assetId: string,
    onProgress?: DownloadProgressCallback
  ): Promise<ArrayBuffer> {
    console.warn('[CDN] Using fallback for asset:', assetId);

    try {
      const response = await this.cloudManager.requestWithRetry<{ data: string }>(
        `/cdn/assets/${assetId}/download`,
        { method: 'GET' }
      );

      // Decode base64 data
      const binaryString = atob(response.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes.buffer;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Fallback download failed',
        'CDN_FALLBACK_FAILED'
      );
    }
  }

  /**
   * Convert blob to data URL
   */
  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
