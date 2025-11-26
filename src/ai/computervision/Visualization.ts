import { DetectionResult, BoundingBox } from './ObjectDetector';
import { Pose, Keypoint } from './PoseEstimator';
import { TrackedObject } from './ObjectTracker';
import { SceneAnalysisResult } from './SceneAnalyzer';

/**
 * Visualization style configuration
 */
export interface VisualizationStyle {
  /** Line color */
  color?: string;
  /** Line width */
  lineWidth?: number;
  /** Font size for labels */
  fontSize?: number;
  /** Font family */
  fontFamily?: string;
  /** Fill alpha for boxes */
  fillAlpha?: number;
  /** Show confidence scores */
  showConfidence?: boolean;
  /** Show labels */
  showLabels?: boolean;
}

/**
 * Computer Vision Visualization
 *
 * Renders computer vision results including bounding boxes, keypoints,
 * segmentation masks, and tracking information on canvas.
 *
 * @example
 * ```typescript
 * const viz = new CVVisualization();
 *
 * // Draw detections
 * viz.drawDetections(ctx, detections, {
 *   color: '#00ff00',
 *   lineWidth: 3,
 *   showConfidence: true
 * });
 *
 * // Draw poses
 * viz.drawPoses(ctx, poses, {
 *   color: '#ff0000',
 *   lineWidth: 2
 * });
 * ```
 */
export class CVVisualization {
  private defaultStyle: Required<VisualizationStyle>;

  /**
   * Creates a new CV visualization instance
   */
  constructor() {
    this.defaultStyle = {
      color: '#00ff00',
      lineWidth: 2,
      fontSize: 14,
      fontFamily: 'Arial',
      fillAlpha: 0.2,
      showConfidence: true,
      showLabels: true
    };
  }

  /**
   * Draws detection bounding boxes on canvas
   *
   * @param ctx - Canvas 2D context
   * @param detections - Detection results
   * @param style - Visualization style
   * @param canvasWidth - Canvas width in pixels
   * @param canvasHeight - Canvas height in pixels
   */
  drawDetections(
    ctx: CanvasRenderingContext2D,
    detections: DetectionResult[],
    style: VisualizationStyle = {},
    canvasWidth?: number,
    canvasHeight?: number
  ): void {
    const s = { ...this.defaultStyle, ...style };
    const width = canvasWidth || ctx.canvas.width;
    const height = canvasHeight || ctx.canvas.height;

    detections.forEach((detection, index) => {
      const color = style.color || this.getColorForIndex(index);
      const [x, y, w, h] = this.toPixels(detection.bbox, width, height);

      ctx.strokeStyle = color;
      ctx.lineWidth = s.lineWidth;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = color + Math.floor(s.fillAlpha * 255).toString(16).padStart(2, '0');
      ctx.fillRect(x, y, w, h);

      if (s.showLabels || s.showConfidence) {
        const label = this.formatDetectionLabel(detection, s.showLabels, s.showConfidence);
        this.drawLabel(ctx, label, x, y - 5, color, s);
      }
    });
  }

  /**
   * Draws pose keypoints and skeleton on canvas
   *
   * @param ctx - Canvas 2D context
   * @param poses - Pose results
   * @param style - Visualization style
   * @param canvasWidth - Canvas width in pixels
   * @param canvasHeight - Canvas height in pixels
   */
  drawPoses(
    ctx: CanvasRenderingContext2D,
    poses: Pose[],
    style: VisualizationStyle = {},
    canvasWidth?: number,
    canvasHeight?: number
  ): void {
    const s = { ...this.defaultStyle, ...style };
    const width = canvasWidth || ctx.canvas.width;
    const height = canvasHeight || ctx.canvas.height;

    const connections = this.getSkeletonConnections();

    poses.forEach((pose, poseIndex) => {
      const color = style.color || this.getColorForIndex(poseIndex);

      connections.forEach(([startIdx, endIdx]) => {
        const start = pose.keypoints[startIdx];
        const end = pose.keypoints[endIdx];

        if (start && end && start.confidence > 0.3 && end.confidence > 0.3) {
          const startX = start.x * width;
          const startY = start.y * height;
          const endX = end.x * width;
          const endY = end.y * height;

          ctx.strokeStyle = color;
          ctx.lineWidth = s.lineWidth;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
      });

      pose.keypoints.forEach((keypoint) => {
        if (keypoint.confidence > 0.3) {
          const x = keypoint.x * width;
          const y = keypoint.y * height;

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      if (pose.bbox && s.showConfidence) {
        const [bx, by, bw, bh] = this.toPixels(pose.bbox, width, height);
        const label = `Pose ${(pose.confidence * 100).toFixed(0)}%`;
        this.drawLabel(ctx, label, bx, by - 5, color, s);
      }
    });
  }

  /**
   * Draws tracked objects with IDs and trails
   *
   * @param ctx - Canvas 2D context
   * @param tracks - Tracked objects
   * @param style - Visualization style
   * @param canvasWidth - Canvas width in pixels
   * @param canvasHeight - Canvas height in pixels
   * @param showTrails - Whether to show motion trails
   */
  drawTracks(
    ctx: CanvasRenderingContext2D,
    tracks: TrackedObject[],
    style: VisualizationStyle = {},
    canvasWidth?: number,
    canvasHeight?: number,
    showTrails: boolean = true
  ): void {
    const s = { ...this.defaultStyle, ...style };
    const width = canvasWidth || ctx.canvas.width;
    const height = canvasHeight || ctx.canvas.height;

    tracks.forEach((track) => {
      const color = this.getColorForId(track.id);
      const [x, y, w, h] = this.toPixels(track.bbox, width, height);

      ctx.strokeStyle = color;
      ctx.lineWidth = s.lineWidth;
      ctx.strokeRect(x, y, w, h);

      if (showTrails && track.history.length > 1) {
        ctx.strokeStyle = color + '80';
        ctx.lineWidth = 1;
        ctx.beginPath();

        track.history.forEach((bbox, index) => {
          const [hx, hy, hw, hh] = this.toPixels(bbox, width, height);
          const centerX = hx + hw / 2;
          const centerY = hy + hh / 2;

          if (index === 0) {
            ctx.moveTo(centerX, centerY);
          } else {
            ctx.lineTo(centerX, centerY);
          }
        });

        ctx.stroke();
      }

      const label = `ID:${track.id} ${track.label}${s.showConfidence ? ` ${(track.confidence * 100).toFixed(0)}%` : ''}`;
      this.drawLabel(ctx, label, x, y - 5, color, s);
    });
  }

  /**
   * Draws segmentation overlay on canvas
   *
   * @param ctx - Canvas 2D context
   * @param result - Scene analysis result
   * @param alpha - Overlay transparency [0-1]
   */
  drawSegmentation(
    ctx: CanvasRenderingContext2D,
    result: SceneAnalysisResult,
    alpha: number = 0.5
  ): void {
    const { segmentationMask, width, height } = result;
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    const imageData = tempCtx.createImageData(width, height);

    const colorMap = this.generateSegmentationColors(256);

    for (let i = 0; i < segmentationMask.length; i++) {
      const classIndex = segmentationMask[i];
      const color = colorMap[classIndex];

      imageData.data[i * 4 + 0] = color[0];
      imageData.data[i * 4 + 1] = color[1];
      imageData.data[i * 4 + 2] = color[2];
      imageData.data[i * 4 + 3] = Math.floor(alpha * 255);
    }

    tempCtx.putImageData(imageData, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, canvasWidth, canvasHeight);
  }

  /**
   * Draws a label with background
   */
  private drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    style: Required<VisualizationStyle>
  ): void {
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = style.fontSize;

    const padding = 4;
    const bgX = x;
    const bgY = y - textHeight - padding;
    const bgWidth = textWidth + padding * 2;
    const bgHeight = textHeight + padding * 2;

    ctx.fillStyle = color;
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + padding, y - padding);
  }

  /**
   * Formats detection label with optional confidence
   */
  private formatDetectionLabel(
    detection: DetectionResult,
    showLabel: boolean,
    showConfidence: boolean
  ): string {
    const parts: string[] = [];

    if (showLabel) {
      parts.push(detection.label);
    }

    if (showConfidence) {
      parts.push(`${(detection.confidence * 100).toFixed(0)}%`);
    }

    return parts.join(' ');
  }

  /**
   * Converts normalized bbox to pixel coordinates
   */
  private toPixels(bbox: BoundingBox, width: number, height: number): number[] {
    const [x, y, w, h] = bbox;
    return [
      x * width,
      y * height,
      w * width,
      h * height
    ];
  }

  /**
   * Gets a consistent color for an index
   */
  private getColorForIndex(index: number): string {
    const colors = [
      '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff',
      '#00ffff', '#ff8000', '#8000ff', '#00ff80', '#ff0080'
    ];
    return colors[index % colors.length];
  }

  /**
   * Gets a consistent color for a tracking ID
   */
  private getColorForId(id: number): string {
    const hue = (id * 137.508) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  /**
   * Gets skeleton connections for pose visualization
   */
  private getSkeletonConnections(): [number, number][] {
    return [
      [0, 1], [0, 2], [1, 3], [2, 4],
      [0, 5], [0, 6], [5, 6],
      [5, 7], [7, 9], [6, 8], [8, 10],
      [5, 11], [6, 12], [11, 12],
      [11, 13], [13, 15], [12, 14], [14, 16]
    ];
  }

  /**
   * Generates colors for segmentation visualization
   */
  private generateSegmentationColors(numColors: number): number[][] {
    const colors: number[][] = [];

    for (let i = 0; i < numColors; i++) {
      const hue = (i * 137.508) % 360;
      const saturation = 70;
      const lightness = 50;

      const rgb = this.hslToRgb(hue, saturation, lightness);
      colors.push(rgb);
    }

    return colors;
  }

  /**
   * Converts HSL to RGB
   */
  private hslToRgb(h: number, s: number, l: number): number[] {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  /**
   * Clears the canvas
   *
   * @param ctx - Canvas 2D context
   */
  clear(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}
