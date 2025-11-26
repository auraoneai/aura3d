/**
 * CaptureManager - High-resolution screenshot and video capture for product visualization
 *
 * @example
 * ```typescript
 * const capture = new CaptureManager(renderer, canvas);
 *
 * // Take screenshot
 * const screenshot = await capture.takeScreenshot({
 *   width: 2048,
 *   height: 2048,
 *   format: 'png',
 *   transparentBackground: false
 * });
 *
 * // Download screenshot
 * capture.downloadImage(screenshot, 'product.png');
 *
 * // Record 360° spin
 * const frames = await capture.record360Spin({
 *   duration: 4,
 *   frameRate: 30,
 *   width: 1920,
 *   height: 1080
 * });
 *
 * // Start video recording
 * await capture.startVideoRecording();
 * // ... user interaction ...
 * const video = await capture.stopVideoRecording();
 * ```
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export interface ScreenshotConfig {
  /** Output width in pixels */
  width?: number;
  /** Output height in pixels */
  height?: number;
  /** Image format */
  format?: ImageFormat;
  /** JPEG/WebP quality (0-1) */
  quality?: number;
  /** Transparent background (PNG only) */
  transparentBackground?: boolean;
  /** Pixel ratio multiplier */
  pixelRatio?: number;
}

export interface VideoRecordingConfig {
  /** Video width in pixels */
  width?: number;
  /** Video height in pixels */
  height?: number;
  /** Frame rate */
  frameRate?: number;
  /** Video bitrate */
  bitrate?: number;
  /** MIME type */
  mimeType?: string;
}

export interface Spin360Config {
  /** Total duration in seconds */
  duration?: number;
  /** Frame rate */
  frameRate?: number;
  /** Output width */
  width?: number;
  /** Output height */
  height?: number;
  /** Image format for frames */
  format?: ImageFormat;
  /** Quality for JPEG/WebP */
  quality?: number;
  /** Number of rotations */
  rotations?: number;
  /** Direction */
  direction?: 'cw' | 'ccw';
}

export interface CaptureFrame {
  /** Frame number */
  index: number;
  /** Frame data URL */
  dataURL: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * CaptureManager handles screenshot and video capture
 */
export class CaptureManager {
  private _canvas: HTMLCanvasElement | null;
  private _renderer: any; // Renderer instance
  private _isRecording: boolean;
  private _mediaRecorder: MediaRecorder | null;
  private _recordedChunks: Blob[];
  private _videoStream: MediaStream | null;

  constructor(renderer?: any, canvas?: HTMLCanvasElement) {
    this._canvas = canvas || null;
    this._renderer = renderer || null;
    this._isRecording = false;
    this._mediaRecorder = null;
    this._recordedChunks = [];
    this._videoStream = null;
  }

  /**
   * Set canvas
   */
  public setCanvas(canvas: HTMLCanvasElement): void {
    this._canvas = canvas;
  }

  /**
   * Set renderer
   */
  public setRenderer(renderer: any): void {
    this._renderer = renderer;
  }

  /**
   * Take a screenshot
   * @returns Promise that resolves to data URL
   */
  public async takeScreenshot(config: ScreenshotConfig = {}): Promise<string> {
    if (!this._canvas) {
      throw new Error('Canvas not set');
    }

    const {
      width,
      height,
      format = 'png',
      quality = 0.92,
      transparentBackground = false,
      pixelRatio = 1
    } = config;

    // Use current canvas size if not specified
    const targetWidth = width || this._canvas.width;
    const targetHeight = height || this._canvas.height;

    // For higher resolution, need to render at larger size
    if (
      targetWidth !== this._canvas.width ||
      targetHeight !== this._canvas.height ||
      pixelRatio !== 1
    ) {
      return this._takeHighResScreenshot(config);
    }

    // Simple case: capture current canvas
    const mimeType = this._getMimeType(format);
    const dataURL = this._canvas.toDataURL(mimeType, quality);

    return dataURL;
  }

  /**
   * Take high-resolution screenshot by rendering at larger size
   */
  private async _takeHighResScreenshot(config: ScreenshotConfig): Promise<string> {
    if (!this._canvas || !this._renderer) {
      throw new Error('Canvas and renderer required for high-res capture');
    }

    const {
      width = 2048,
      height = 2048,
      format = 'png',
      quality = 0.92,
      transparentBackground = false,
      pixelRatio = 1
    } = config;

    // Store original size
    const originalWidth = this._canvas.width;
    const originalHeight = this._canvas.height;

    // Create temporary canvas for high-res rendering
    const tempCanvas = document.createElement('canvas');
    const actualWidth = width * pixelRatio;
    const actualHeight = height * pixelRatio;
    tempCanvas.width = actualWidth;
    tempCanvas.height = actualHeight;

    // Temporarily resize renderer
    if (this._renderer.setSize) {
      this._renderer.setSize(actualWidth, actualHeight);
    }

    // Render frame
    if (this._renderer.render) {
      this._renderer.render();
    }

    // Copy to temp canvas
    const ctx = tempCanvas.getContext('2d');
    if (ctx) {
      if (transparentBackground) {
        ctx.clearRect(0, 0, actualWidth, actualHeight);
      }
      ctx.drawImage(this._canvas, 0, 0, actualWidth, actualHeight);
    }

    // Restore original size
    if (this._renderer.setSize) {
      this._renderer.setSize(originalWidth, originalHeight);
    }

    // Get data URL
    const mimeType = this._getMimeType(format);
    const dataURL = tempCanvas.toDataURL(mimeType, quality);

    return dataURL;
  }

  /**
   * Download image from data URL
   */
  public downloadImage(dataURL: string, filename: string = 'capture.png'): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    link.click();
  }

  /**
   * Start video recording
   */
  public async startVideoRecording(config: VideoRecordingConfig = {}): Promise<void> {
    if (!this._canvas) {
      throw new Error('Canvas not set');
    }

    if (this._isRecording) {
      throw new Error('Already recording');
    }

    const {
      frameRate = 30,
      bitrate = 2500000,
      mimeType = 'video/webm'
    } = config;

    // Create stream from canvas
    this._videoStream = this._canvas.captureStream(frameRate);

    // Check if mimeType is supported
    let actualMimeType = mimeType;
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      // Try alternatives
      const alternatives = ['video/webm', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
      actualMimeType = alternatives.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';
    }

    // Create media recorder
    this._mediaRecorder = new MediaRecorder(this._videoStream, {
      mimeType: actualMimeType,
      videoBitsPerSecond: bitrate
    });

    this._recordedChunks = [];

    // Handle data
    this._mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this._recordedChunks.push(event.data);
      }
    };

    // Start recording
    this._mediaRecorder.start();
    this._isRecording = true;
  }

  /**
   * Stop video recording
   * @returns Promise that resolves to Blob
   */
  public async stopVideoRecording(): Promise<Blob> {
    if (!this._isRecording || !this._mediaRecorder) {
      throw new Error('Not recording');
    }

    return new Promise((resolve, reject) => {
      if (!this._mediaRecorder) {
        reject(new Error('MediaRecorder not initialized'));
        return;
      }

      this._mediaRecorder.onstop = () => {
        const blob = new Blob(this._recordedChunks, {
          type: this._mediaRecorder?.mimeType || 'video/webm'
        });

        this._isRecording = false;
        this._recordedChunks = [];

        // Stop stream tracks
        if (this._videoStream) {
          this._videoStream.getTracks().forEach((track) => track.stop());
          this._videoStream = null;
        }

        resolve(blob);
      };

      this._mediaRecorder.stop();
    });
  }

  /**
   * Download video blob
   */
  public downloadVideo(blob: Blob, filename: string = 'video.webm'): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * Record 360° spin
   * @param onProgress - Progress callback (current frame, total frames)
   * @returns Promise that resolves to array of capture frames
   */
  public async record360Spin(
    config: Spin360Config = {},
    onProgress?: (current: number, total: number) => void
  ): Promise<CaptureFrame[]> {
    if (!this._renderer) {
      throw new Error('Renderer required for 360 spin capture');
    }

    const {
      duration = 4,
      frameRate = 30,
      width = 1920,
      height = 1080,
      format = 'jpeg',
      quality = 0.85,
      rotations = 1,
      direction = 'cw'
    } = config;

    const totalFrames = Math.ceil(duration * frameRate);
    const frames: CaptureFrame[] = [];
    const anglePerFrame = (Math.PI * 2 * rotations) / totalFrames;
    const directionMultiplier = direction === 'cw' ? 1 : -1;

    // Get camera if available
    let camera: any = null;
    if (this._renderer.camera) {
      camera = this._renderer.camera;
    }

    for (let i = 0; i < totalFrames; i++) {
      // Rotate camera
      if (camera && camera.rotate) {
        camera.rotate(anglePerFrame * directionMultiplier, 0);
      }

      // Render frame
      if (this._renderer.render) {
        this._renderer.render();
      }

      // Capture frame
      const dataURL = await this.takeScreenshot({
        width,
        height,
        format,
        quality
      });

      frames.push({
        index: i,
        dataURL,
        timestamp: (i / frameRate) * 1000
      });

      // Progress callback
      if (onProgress) {
        onProgress(i + 1, totalFrames);
      }

      // Small delay to allow rendering
      await this._delay(1);
    }

    return frames;
  }

  /**
   * Create video from frames
   */
  public async createVideoFromFrames(
    frames: CaptureFrame[],
    frameRate: number = 30
  ): Promise<Blob> {
    // This would require a video encoder library
    // For now, throw an error indicating this needs implementation
    throw new Error('Video encoding from frames requires additional library (e.g., ffmpeg.wasm)');
  }

  /**
   * Download 360 spin as image sequence (ZIP)
   */
  public async download360SpinAsZip(
    frames: CaptureFrame[],
    filename: string = '360-spin.zip'
  ): Promise<void> {
    // This would require a ZIP library like JSZip
    // For now, download frames individually
    console.warn('ZIP export requires JSZip library. Downloading frames individually...');

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const frameName = `frame_${String(i).padStart(4, '0')}.${this._getExtension(frame.dataURL)}`;
      this.downloadImage(frame.dataURL, frameName);

      // Small delay between downloads
      await this._delay(100);
    }
  }

  /**
   * Get MIME type from format
   */
  private _getMimeType(format: ImageFormat): string {
    switch (format) {
      case 'png':
        return 'image/png';
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/png';
    }
  }

  /**
   * Get file extension from data URL
   */
  private _getExtension(dataURL: string): string {
    if (dataURL.startsWith('data:image/png')) return 'png';
    if (dataURL.startsWith('data:image/jpeg')) return 'jpg';
    if (dataURL.startsWith('data:image/webp')) return 'webp';
    return 'png';
  }

  /**
   * Delay helper
   */
  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if recording
   */
  public get isRecording(): boolean {
    return this._isRecording;
  }

  /**
   * Dispose manager
   */
  public dispose(): void {
    if (this._isRecording && this._mediaRecorder) {
      this._mediaRecorder.stop();
    }

    if (this._videoStream) {
      this._videoStream.getTracks().forEach((track) => track.stop());
      this._videoStream = null;
    }

    this._recordedChunks = [];
    this._mediaRecorder = null;
    this._isRecording = false;
  }
}
